import { buildJob, htmlToText, isRecent, matchesKeywords, mapEmploymentType } from "./normalize";
import { fetchJson } from "./http";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

interface ArbeitnowJob { slug: string; company_name: string; title: string; description?: string; remote?: boolean; url: string; tags?: string[]; job_types?: string[]; location?: string; created_at?: number }
interface ArbeitnowResp { data?: ArbeitnowJob[]; links?: { next?: string | null } }
export const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

export function mapArbeitnow(resp: ArbeitnowResp, now = new Date()): { job: NormalizedJob; tags: string[] }[] {
  return (resp.data ?? []).filter((j) => j.slug && j.title && j.company_name).map((j) => {
    const types = (j.job_types ?? []).map(mapEmploymentType).filter(Boolean);
    return {
      tags: j.tags ?? [],
      job: buildJob(
        { title: j.title.trim(), company: j.company_name.trim(), description: htmlToText(j.description) || null, location: j.location?.trim() || (j.remote ? "Remote" : null), postedAt: j.created_at ? new Date(j.created_at * 1000) : null, applyUrl: j.url, source: "arbeitnow", sourceJobId: j.slug, sourceUrl: j.url, discoveredAt: now },
        { workMode: j.remote ? "remote" : null, jobType: (types[0] as NormalizedJob["jobType"]) ?? null, skills: [] },
      ),
    };
  });
}

export async function fetchArbeitnow(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const out: NormalizedJob[] = [];
  let url: string | null | undefined = ARBEITNOW_URL;
  for (let page = 0; url && page < 3; page++) {
    const resp: ArbeitnowResp = await fetchJson<ArbeitnowResp>(url);
    out.push(...mapArbeitnow(resp, now).filter(({ job, tags }) => isRecent(job.postedAt, ctx.maxAgeDays, now) && matchesKeywords(job, tags, ctx.keywords)).map((x) => x.job));
    url = resp.links?.next;
  }
  return { jobs: out };
}
