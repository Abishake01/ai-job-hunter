import { buildJob, htmlToText, isRecent, mapEmploymentType } from "./normalize";
import { fetchJson } from "./http";
import { queryTerms } from "./keywords";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

interface JobicyJob { id: number | string; url: string; jobTitle: string; companyName?: string; jobType?: string[]; jobGeo?: string; jobDescription?: string; jobExcerpt?: string; pubDate?: string; annualSalaryMin?: number; annualSalaryMax?: number; salaryCurrency?: string }
export const JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs";

export function mapJobicy(resp: { jobs?: JobicyJob[] }, now = new Date()): NormalizedJob[] {
  return (resp.jobs ?? []).filter((j) => j.id && j.jobTitle && j.url).map((j) => {
    const min = j.annualSalaryMin ? Math.round(j.annualSalaryMin / 12) : null, max = j.annualSalaryMax ? Math.round(j.annualSalaryMax / 12) : null;
    return buildJob(
      { title: htmlToText(j.jobTitle).trim(), company: j.companyName?.trim() || "Unknown company", description: htmlToText(j.jobDescription ?? j.jobExcerpt) || null, location: j.jobGeo ? `Remote — ${j.jobGeo}` : "Remote", postedAt: j.pubDate ? new Date(j.pubDate) : null, applyUrl: j.url, source: "jobicy", sourceJobId: String(j.id), sourceUrl: j.url, discoveredAt: now },
      { workMode: "remote", jobType: mapEmploymentType(j.jobType?.[0]), salaryMin: min ?? max, salaryMax: max ?? min, salaryCurrency: min || max ? j.salaryCurrency ?? null : null, salaryText: min || max ? `${j.annualSalaryMin ?? "?"}-${j.annualSalaryMax ?? "?"} ${j.salaryCurrency ?? ""} per year`.trim() : null },
    );
  });
}

/** Jobicy public API (credit + link back to source per their notice), queried per profile keyword. */
export async function fetchJobicy(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const out = new Map<string, NormalizedJob>();
  const errors: string[] = [];
  const terms = queryTerms(ctx.keywords.length ? ctx.keywords : ["software engineer"], 5).map((k) => k.replace(/\b(developer|engineer)\b/g, "").trim()).filter(Boolean);
  for (const tag of [...new Set(terms.length ? terms : ["developer"])]) {
    try {
      const resp = await fetchJson<{ jobs?: JobicyJob[] }>(`${JOBICY_URL}?count=50&tag=${encodeURIComponent(tag)}`);
      for (const j of mapJobicy(resp, now)) if (isRecent(j.postedAt, ctx.maxAgeDays, now)) out.set(j.sourceJobId, j);
    } catch (e) { errors.push(`jobicy "${tag}": ${e instanceof Error ? e.message : e}`); }
  }
  if (!out.size && errors.length) throw new Error(errors[0]);
  return { jobs: [...out.values()], errors };
}
