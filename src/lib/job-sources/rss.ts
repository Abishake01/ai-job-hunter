import { buildJob, decodeEntities, htmlToText, isRecent, matchesKeywords } from "./normalize";
import { fetchText, HttpFailure, isAllowedByRobots } from "./http";
import type { AdapterResult, NormalizedJob, RssFeedRef, SourceContext } from "./types";

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return null;
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
};
const rawTag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : null;
};

/** Split "Title at Company" / "Company - Title" / "Company: Title" when the pattern is explicit; otherwise company is Unknown. */
export function splitTitleCompany(raw: string): { title: string; company: string | null } {
  let m = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(raw);
  if (m) return { title: m[1].trim(), company: m[2].trim() };
  m = /^(.+?)\s+(?:—|–|-|\|)\s+(.+)$/.exec(raw);
  if (m && m[2].length < 40 && !/\b(developer|engineer|manager|designer|analyst|intern)\b/i.test(m[2])) return { title: m[1].trim(), company: m[2].trim() };
  return { title: raw.trim(), company: null };
}

export function parseFeed(xml: string, feed: RssFeedRef, now = new Date()): { job: NormalizedJob; tags: string[] }[] {
  const items = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const out: { job: NormalizedJob; tags: string[] }[] = [];
  for (const it of items) {
    const rawTitle = htmlToText(tag(it, "title") ?? "");
    let link = tag(it, "link");
    if (!link) link = /<link[^>]*href=["']([^"']+)["']/i.exec(it)?.[1] ?? null;
    if (!rawTitle || !link) continue;
    const { title, company: fromTitle } = splitTitleCompany(rawTitle);
    const company = tag(it, "dc:creator") ?? tag(it, "author") ?? fromTitle;
    const desc = htmlToText(rawTag(it, "content:encoded") ?? rawTag(it, "description") ?? rawTag(it, "summary") ?? rawTag(it, "content") ?? "") || null;
    const dateStr = tag(it, "pubDate") ?? tag(it, "published") ?? tag(it, "updated") ?? tag(it, "dc:date");
    const d = dateStr ? new Date(dateStr) : null;
    const host = new URL(link).hostname.replace(/^www\./, "");
    const cats = [...it.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")).trim()).filter(Boolean);
    out.push({
      tags: cats,
      job: buildJob({ title, company: company?.trim() || `Unknown company (${host})`, description: desc, location: null, postedAt: d && !isNaN(+d) ? d : null, applyUrl: link, source: "rss", sourceJobId: tag(it, "guid") ?? tag(it, "id") ?? link, sourceUrl: link, discoveredAt: now }),
    });
  }
  void feed;
  return out;
}

export async function fetchRss(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const jobs: NormalizedJob[] = [], errors: string[] = [];
  for (const f of ctx.rssFeeds) {
    try {
      // User-supplied feeds are non-API pages: honor robots.txt.
      if (!(await isAllowedByRobots(f.url))) { errors.push(`rss/${f.name}: blocked by robots.txt`); continue; }
      const xml = await fetchText(f.url, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
      jobs.push(...parseFeed(xml, f, now).filter(({ job, tags }) => isRecent(job.postedAt, ctx.maxAgeDays, now) && matchesKeywords(job, tags, ctx.keywords)).map((x) => x.job));
    } catch (e) { errors.push(`rss/${f.name}: ${e instanceof HttpFailure ? e.message : String(e)}`); }
  }
  return { jobs, errors };
}
