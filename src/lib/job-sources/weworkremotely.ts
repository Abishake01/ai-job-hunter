import { fetchText, HttpFailure } from "./http";
import { isRecent, matchesKeywords } from "./normalize";
import { parseFeed } from "./rss";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

const FEEDS = [
  { name: "WWR full-stack", url: "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss" },
  { name: "WWR back-end", url: "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss" },
  { name: "WWR front-end", url: "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss" },
  { name: "WWR devops", url: "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss" },
  { name: "WWR all programming", url: "https://weworkremotely.com/categories/remote-programming-jobs.rss" },
];

/** We Work Remotely public category RSS feeds (their documented feed offering). Titles look like "Company: Role". */
export async function fetchWeWorkRemotely(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const out = new Map<string, NormalizedJob>();
  const errors: string[] = [];
  for (const f of FEEDS) {
    try {
      const xml = await fetchText(f.url, { accept: "application/rss+xml, application/xml, text/xml" });
      const regions = new Map<string, string>();
      for (const it of xml.matchAll(/<item>[\s\S]*?<\/item>/gi)) {
        const link = /<link>([^<]+)<\/link>/i.exec(it[0])?.[1]?.trim(), region = /<region>([^<]*)<\/region>/i.exec(it[0])?.[1]?.trim();
        if (link && region) regions.set(link, region);
      }
      for (const { job, tags } of parseFeed(xml, f, now)) {
        const m = /^([^:]{2,60}):\s+(.+)$/.exec(job.title);
        const j: NormalizedJob = { ...job, source: "weworkremotely", ...(m ? { company: m[1].trim(), title: m[2].trim() } : {}), workMode: "remote", location: job.location ?? "Remote — Worldwide" };
        const region = regions.get(job.applyUrl ?? "");
        if (region && /only|usa|us\b|europe|canada|uk/i.test(region) && !/anywhere|worldwide|asia|india/i.test(region)) continue; // region-locked away from India
        if (isRecent(j.postedAt, ctx.maxAgeDays, now) && matchesKeywords(j, tags, ctx.keywords)) out.set(j.sourceJobId, j);
      }
    } catch (e) { errors.push(`weworkremotely/${f.name}: ${e instanceof HttpFailure ? e.message : String(e)}`); }
  }
  if (!out.size && errors.length === FEEDS.length) throw new Error(errors[0]);
  return { jobs: [...out.values()], errors };
}
