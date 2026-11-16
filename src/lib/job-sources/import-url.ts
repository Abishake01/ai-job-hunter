import { annualToMonthly, buildJob, decodeEntities, detectJobType, htmlToText, mapEmploymentType, normalizeUrl } from "./normalize";
import { assertPublicHttpUrl, HttpFailure, isAllowedByRobots, politeFetch } from "./http";
import type { NormalizedJob, WorkMode } from "./types";

type Json = Record<string, unknown>;
export interface ImportResult { job: NormalizedJob; method: "jsonld" | "meta"; missing: string[]; closed: boolean }

const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* ignore malformed block */ }
  }
  return out;
}
function flatten(node: unknown, acc: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => flatten(n, acc));
  else if (node && typeof node === "object") {
    const o = node as Json;
    acc.push(o);
    if (o["@graph"]) flatten(o["@graph"], acc);
  }
  return acc;
}
const isType = (o: Json, t: string) => { const ty = o["@type"]; return Array.isArray(ty) ? ty.includes(t) : ty === t; };

function locationOf(p: Json): string | null {
  const locs = ([] as unknown[]).concat(p.jobLocation ?? []);
  const parts = locs.map((l) => {
    const addr = (l as Json)?.address as Json | string | undefined;
    if (typeof addr === "string") return addr;
    if (!addr) return null;
    const country = typeof addr.addressCountry === "object" ? asStr((addr.addressCountry as Json).name) : asStr(addr.addressCountry);
    return [asStr(addr.addressLocality), asStr(addr.addressRegion), country].filter(Boolean).join(", ") || null;
  }).filter(Boolean) as string[];
  return parts.length ? [...new Set(parts)].join(" / ") : null;
}

function salaryOf(p: Json): Pick<NormalizedJob, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryText"> {
  const none = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryText: null };
  const bs = p.baseSalary as Json | undefined;
  if (!bs || typeof bs !== "object") return none;
  const cur = asStr(bs.currency);
  const v = bs.value as Json | number | undefined;
  let min: number | null = null, max: number | null = null, unit: string | null = null;
  if (typeof v === "number") { min = max = v; }
  else if (v && typeof v === "object") {
    const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && !isNaN(+x) ? +x : null);
    min = num(v.minValue) ?? num(v.value); max = num(v.maxValue) ?? num(v.value); unit = asStr(v.unitText);
  }
  const text = `${cur ?? ""} ${min ?? "?"}${max !== null && max !== min ? `-${max}` : ""} ${unit ?? ""}`.trim();
  const u = unit?.toUpperCase();
  const f = u === "YEAR" ? annualToMonthly : u === "MONTH" ? Math.round : null;
  if (!f || (min === null && max === null)) return { ...none, salaryCurrency: cur, salaryText: text }; // unknown unit => keep text only
  return { salaryMin: min !== null ? f(min) : f(max!), salaryMax: max !== null ? f(max) : f(min!), salaryCurrency: cur, salaryText: text };
}

const attr = (html: string, name: string): string | null => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const c = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return c ? decodeEntities(c).trim() : null;
};

/** Pure extraction: JSON-LD JobPosting first, then OpenGraph/title fallback. Throws if no usable title. */
export function extractFromHtml(html: string, url: string, now = new Date()): ImportResult {
  const posting = jsonLdBlocks(html).flatMap((b) => flatten(b)).find((o) => isType(o, "JobPosting"));
  const base = { applyUrl: url, source: "import-url", sourceJobId: normalizeUrl(url) ?? url, sourceUrl: url, discoveredAt: now };
  if (posting) {
    const org = posting.hiringOrganization as Json | string | undefined;
    const company = typeof org === "string" ? org : asStr((org as Json | undefined)?.name);
    const title = asStr(posting.title);
    if (title) {
      const empRaw = ([] as unknown[]).concat(posting.employmentType ?? []).map(String).join(" ");
      const remote = asStr(posting.jobLocationType)?.toUpperCase() === "TELECOMMUTE";
      const wm: WorkMode | null = remote ? "remote" : null;
      const desc = htmlToText(decodeEntities(asStr(posting.description) ?? "")) || null;
      const exp = posting.experienceRequirements as Json | string | undefined;
      const expMonths = typeof exp === "object" ? Number((exp as Json).monthsOfExperience) : NaN;
      const deadline = asStr(posting.validThrough) ? new Date(asStr(posting.validThrough)!) : null;
      const job = buildJob(
        { ...base, title, company: company ?? "Unknown company", description: desc, location: locationOf(posting), postedAt: asStr(posting.datePosted) ? new Date(asStr(posting.datePosted)!) : null },
        { workMode: wm, jobType: mapEmploymentType(empRaw) ?? detectJobType(title), ...salaryOf(posting), deadline: deadline && !isNaN(+deadline) ? deadline : null, ...(Number.isFinite(expMonths) ? { experienceMin: expMonths / 12, experienceText: `${expMonths} months` } : {}) },
      );
      return { job, method: "jsonld", missing: missingOf(job, !!company), closed: !!(job.deadline && job.deadline < now) };
    }
  }
  const ogTitle = attr(html, "og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  if (!ogTitle) throw new HttpFailure(422, "Could not find a job posting on that page (no JobPosting data or title). Add the job manually instead.", url);
  const title = decodeEntities(ogTitle).replace(/\s+/g, " ").trim();
  const site = attr(html, "og:site_name");
  const job = buildJob({ ...base, title, company: site ?? "Unknown company", description: attr(html, "og:description") ?? attr(html, "description"), location: null, postedAt: null });
  return { job, method: "meta", missing: missingOf(job, !!site), closed: false };
}

function missingOf(j: NormalizedJob, hasCompany: boolean): string[] {
  const m: string[] = [];
  if (!hasCompany) m.push("company");
  if (!j.description) m.push("description");
  if (!j.location) m.push("location");
  if (j.salaryMin === null) m.push("salary");
  if (j.experienceMin === null) m.push("experience");
  if (!j.postedAt) m.push("postedAt");
  return m;
}

/** Fetch a user-supplied job URL: SSRF-guarded, robots.txt-respecting, manual redirect handling (each hop re-validated). */
export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  let url = (await assertPublicHttpUrl(rawUrl)).toString();
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isAllowedByRobots(url))) throw new HttpFailure(403, "This site's robots.txt does not permit automated access to that page. Add the job manually or use a Gmail alert instead.", url);
    const res = await politeFetch(url, { accept: "text/html,application/xhtml+xml", timeoutMs: 15000, retries: 1 }, true);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = (await assertPublicHttpUrl(new URL(res.headers.get("location")!, url).toString())).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) throw new HttpFailure(res.status, "The site refused automated access (login, CAPTCHA or rate limit). Not bypassing — add the job manually.", url);
    if (res.status === 404 || res.status === 410) throw new HttpFailure(404, "That page no longer exists (404/410).", url);
    if (!res.ok) throw new HttpFailure(res.status, `The site returned HTTP ${res.status}.`, url);
    const html = (await res.text()).slice(0, 3_000_000);
    return extractFromHtml(html, url);
  }
  throw new HttpFailure(400, "Too many redirects", url);
}
