/**
 * Recruiter discovery from PERMITTED PUBLIC sources only: job-ad text, the company's own careers/contact pages
 * (robots.txt honoured, polite rate limit, public pages only), and Gmail. No LinkedIn / search-engine / login-gated scraping.
 * Every candidate carries a sourceUrl.
 */
import { DESIGNATION_RE } from "@/lib/gmail/extract";
import { isNoReply, isGenericMailbox, type SourceType } from "./verify";
import { assertPublicHttpUrl, isAllowedByRobots, politeFetch } from "@/lib/job-sources/http";

export type ContactCandidate = { email: string; name: string | null; designation: string | null; sourceUrl: string; sourceType: SourceType; generic: boolean };

const ATS_HOSTS = ["greenhouse.io", "lever.co", "ashbyhq.com", "workable.com", "smartrecruiters.com", "myworkdayjobs.com", "icims.com", "bamboohr.com", "recruitee.com", "jobvite.com", "linkedin.com", "naukri.com", "indeed.com", "glassdoor.com", "wellfound.com", "foundit.in", "instahyre.com", "cutshort.io", "hirist.tech", "hirist.com", "remotive.com", "remoteok.com", "arbeitnow.com", "adzuna.com", "adzuna.in", "jooble.org", "weworkremotely.com", "breezy.hr", "teamtailor.com", "pinpointhq.com", "dover.com", "keka.com", "zohorecruit.com", "freshteam.com"];

/** Registrable-ish company domain from URLs; ATS/job-board hosts are skipped (their domain is not the company's). */
export function deriveCompanyDomain(urls: (string | null | undefined)[]): string | null {
  for (const raw of urls) {
    if (!raw) continue;
    let host: string;
    try { host = new URL(raw).hostname.toLowerCase(); } catch { continue; }
    if (ATS_HOSTS.some((a) => host === a || host.endsWith("." + a))) continue;
    host = host.replace(/^(www|careers?|jobs?|apply|hire|work|join)\./, "");
    if (!host.includes(".") || /^\d+\.\d+/.test(host)) continue;
    return host;
  }
  return null;
}

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}/gi;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|^(example|sentry|wixpress|domain)\b|@(example\.|sentry|wixpress|email\.com$|domain\.com$|yourcompany|your-company)/i;
const NAME_RE = /^[A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){1,2}$/;

export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
    .replace(/<a [^>]*href=["']mailto:([^"'?>]+)[^>]*>/gi, " $1 ")
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h\d|\/section)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#64;|&commat;/g, "@").replace(/\[at\]|\(at\)/gi, "@").replace(/[ \t]+/g, " ");
}

/**
 * Pulls emails (+ name/designation ONLY when the same or previous line explicitly pairs them) from text.
 * company_site pages only accept addresses on the company's own domain; job ads accept what the ad itself publishes.
 */
export function extractContactsFromText(text: string, ctx: { sourceUrl: string; sourceType: SourceType; companyDomain?: string | null }): ContactCandidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out = new Map<string, ContactCandidate>();
  lines.forEach((line, i) => {
    for (const m of line.matchAll(EMAIL_RE)) {
      const email = m[0].toLowerCase().replace(/[.,;:]+$/, "");
      if (BAD_EMAIL.test(email) || isNoReply(email) || out.has(email)) continue;
      if (ctx.sourceType === "company_site" && ctx.companyDomain && !(email.endsWith("@" + ctx.companyDomain) || email.endsWith("." + ctx.companyDomain))) continue;
      let name: string | null = null, designation: string | null = null;
      for (const l of [line.replace(m[0], " "), lines[i - 1] ?? "", lines[i + 1] ?? ""]) {
        if (l.length > 140) continue;
        const d = l.match(DESIGNATION_RE);
        if (!d) continue;
        designation = d[1].replace(/\s+/g, " ");
        const pieces = l.split(/\s*[-–—|,:()]\s*/).map((p) => p.replace(/\b(?:email|e-mail|contact|mail|reach|write to)\b:?/gi, "").trim()).filter(Boolean);
        name = pieces.find((p) => !DESIGNATION_RE.test(p) && NAME_RE.test(p)) ?? null;
        break;
      }
      out.set(email, { email, name, designation, sourceUrl: ctx.sourceUrl, sourceType: ctx.sourceType, generic: isGenericMailbox(email) });
    }
  });
  return [...out.values()];
}

/** Same-origin links whose URL/text suggests a careers or contact page. */
export function findPageLinks(html: string, baseUrl: string): { careersUrl: string | null; contactUrl: string | null } {
  let careersUrl: string | null = null, contactUrl: string | null = null;
  let base: URL;
  try { base = new URL(baseUrl); } catch { return { careersUrl, contactUrl }; }
  for (const m of html.matchAll(/<a [^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    const text = m[2].replace(/<[^>]+>/g, " ").trim().toLowerCase();
    const sameSite = u.hostname === base.hostname || u.hostname.endsWith("." + base.hostname.replace(/^www\./, ""));
    if (!/^https?:$/.test(u.protocol)) continue;
    const key = `${u.pathname} ${text}`.toLowerCase();
    if (!careersUrl && (sameSite || /careers|jobs/.test(u.hostname)) && /career|join[- ]us|work[- ]with[- ]us|we'?re hiring/.test(key)) careersUrl = u.toString();
    if (!contactUrl && sameSite && /contact/.test(key)) contactUrl = u.toString();
  }
  return { careersUrl, contactUrl };
}

export type CrawlResult = { candidates: ContactCandidate[]; careersUrl: string | null; contactUrl: string | null; fetched: string[]; skipped: { url: string; reason: string }[] };

const GUESS_PATHS = ["/", "/careers", "/contact", "/contact-us", "/about"];

/** Fetches a handful of the company's own public pages (robots.txt honoured, SSRF-guarded, rate-limited). */
export async function crawlCompanySite(domain: string, known: { careersUrl?: string | null; contactUrl?: string | null } = {}, maxPages = 5): Promise<CrawlResult> {
  const r: CrawlResult = { candidates: [], careersUrl: known.careersUrl ?? null, contactUrl: known.contactUrl ?? null, fetched: [], skipped: [] };
  const queue = [known.careersUrl, known.contactUrl, ...GUESS_PATHS.map((p) => `https://${domain}${p}`)].filter((u): u is string => !!u);
  const seen = new Set<string>();
  while (queue.length && r.fetched.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const u = await assertPublicHttpUrl(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== domain && !host.endsWith("." + domain)) { r.skipped.push({ url, reason: "off-domain" }); continue; }
      if (!(await isAllowedByRobots(url))) { r.skipped.push({ url, reason: "robots.txt disallows" }); continue; }
      const res = await politeFetch(url, { accept: "text/html", retries: 1, timeoutMs: 10000 });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) { r.skipped.push({ url, reason: `HTTP ${res.status}` }); continue; }
      const finalUrl = res.url || url;
      const html = (await res.text()).slice(0, 600_000);
      r.fetched.push(finalUrl);
      r.candidates.push(...extractContactsFromText(htmlToText(html), { sourceUrl: finalUrl, sourceType: "company_site", companyDomain: domain }));
      const links = findPageLinks(html, finalUrl);
      if (!r.careersUrl) r.careersUrl = links.careersUrl ?? (/career/i.test(finalUrl) ? finalUrl : null);
      if (!r.contactUrl) r.contactUrl = links.contactUrl ?? (/contact/i.test(finalUrl) ? finalUrl : null);
      for (const l of [links.careersUrl, links.contactUrl]) if (l && !seen.has(l)) queue.unshift(l);
    } catch (e) { r.skipped.push({ url, reason: e instanceof Error ? e.message.slice(0, 100) : "error" }); }
  }
  return r;
}
