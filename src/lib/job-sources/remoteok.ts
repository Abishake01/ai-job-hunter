import { annualToMonthly, buildJob, htmlToText, isRecent, matchesKeywords } from "./normalize";
import { fetchJson } from "./http";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

interface RemoteOkJob { slug?: string; id?: string; epoch?: number; date?: string; company?: string; position?: string; tags?: string[]; description?: string; location?: string; apply_url?: string; url?: string; salary_min?: number; salary_max?: number; legal?: string }
export const REMOTEOK_URL = "https://remoteok.com/api";

export function mapRemoteOk(resp: RemoteOkJob[], now = new Date()): { job: NormalizedJob; tags: string[] }[] {
  // element 0 is the legal/terms notice, not a job.
  return resp.filter((j) => j.id && j.position && j.company).map((j) => {
    const min = j.salary_min && j.salary_min > 0 ? annualToMonthly(j.salary_min) : null;
    const max = j.salary_max && j.salary_max > 0 ? annualToMonthly(j.salary_max) : null;
    const known = min !== null || max !== null;
    return {
      tags: j.tags ?? [],
      job: buildJob(
        { title: j.position!.trim(), company: j.company!.trim(), description: htmlToText(j.description) || null, location: j.location?.trim() ? `Remote — ${j.location.trim()}` : "Remote", postedAt: j.epoch ? new Date(j.epoch * 1000) : j.date ? new Date(j.date) : null, applyUrl: j.apply_url ?? j.url ?? null, source: "remoteok", sourceJobId: String(j.id), sourceUrl: j.url ?? null, discoveredAt: now },
        { workMode: "remote", skills: j.tags ?? [], salaryMin: min ?? max, salaryMax: max ?? min, salaryCurrency: known ? "USD" : null, salaryText: known ? `$${j.salary_min ?? "?"} - $${j.salary_max ?? "?"} per year (as listed)` : null },
      ),
    };
  });
}

export async function fetchRemoteOk(ctx: SourceContext): Promise<AdapterResult> {
  const resp = await fetchJson<RemoteOkJob[]>(REMOTEOK_URL);
  const now = new Date();
  return { jobs: mapRemoteOk(resp, now).filter(({ job, tags }) => isRecent(job.postedAt, ctx.maxAgeDays, now) && matchesKeywords(job, tags, ctx.keywords)).map((x) => x.job) };
}
