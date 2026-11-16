import { buildJob, htmlToText, isRecent, matchesKeywords, mapEmploymentType, parseSalary } from "./normalize";
import { fetchJson } from "./http";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

interface RemotiveJob { id: number; url: string; title: string; company_name: string; category?: string; tags?: string[]; job_type?: string; publication_date?: string; candidate_required_location?: string; salary?: string; description?: string }
export const REMOTIVE_URL = "https://remotive.com/api/remote-jobs?category=software-dev&limit=200";

export function mapRemotive(resp: { jobs?: RemotiveJob[] }, now = new Date()): { job: NormalizedJob; tags: string[] }[] {
  return (resp.jobs ?? []).filter((j) => j.title && j.company_name && j.url).map((j) => {
    const sal = j.salary ? parseSalary(j.salary) : null;
    const loc = j.candidate_required_location?.trim() || null;
    return {
      tags: j.tags ?? [],
      job: buildJob(
        { title: j.title.trim(), company: j.company_name.trim(), description: htmlToText(j.description) || null, location: loc ? `Remote — ${loc}` : "Remote", postedAt: j.publication_date ? new Date(j.publication_date + (/[zZ]|[+-]\d\d:?\d\d$/.test(j.publication_date) ? "" : "Z")) : null, applyUrl: j.url, source: "remotive", sourceJobId: String(j.id), sourceUrl: j.url, discoveredAt: now },
        { workMode: "remote", jobType: mapEmploymentType(j.job_type), skills: j.tags ?? [], salaryMin: sal?.salaryMin ?? null, salaryMax: sal?.salaryMax ?? null, salaryCurrency: sal?.salaryCurrency ?? null, salaryText: j.salary?.trim() || null },
      ),
    };
  });
}

export async function fetchRemotive(ctx: SourceContext): Promise<AdapterResult> {
  const resp = await fetchJson<{ jobs?: RemotiveJob[] }>(REMOTIVE_URL);
  const now = new Date();
  const jobs = mapRemotive(resp, now).filter(({ job, tags }) => isRecent(job.postedAt, ctx.maxAgeDays, now) && matchesKeywords(job, tags, ctx.keywords)).map((x) => x.job);
  return { jobs };
}
