import { annualToMonthly, buildJob, isRecent, matchesKeywords, mapEmploymentType } from "./normalize";
import { fetchJson, HttpFailure } from "./http";
import { prettifySlug } from "./boards";
import type { AdapterResult, NormalizedJob, SourceContext, WorkMode } from "./types";

interface AshbyComp { compensationType?: string; interval?: string; currencyCode?: string | null; minValue?: number | null; maxValue?: number | null }
interface AshbyJob { id: string; title: string; employmentType?: string; location?: string; isListed?: boolean; isRemote?: boolean; workplaceType?: string; publishedAt?: string; jobUrl?: string; applyUrl?: string; descriptionPlain?: string; compensation?: { compensationTierSummary?: string; summaryComponents?: AshbyComp[] } }
export const ashbyUrl = (slug: string) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;

export function mapAshby(resp: { jobs?: AshbyJob[] }, slug: string, boardName?: string, now = new Date()): NormalizedJob[] {
  return (resp.jobs ?? []).filter((j) => j.id && j.title && j.isListed !== false).map((j) => {
    const sal = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary" && (c.minValue || c.maxValue));
    let min: number | null = null, max: number | null = null;
    if (sal) {
      const f = sal.interval === "1 YEAR" ? annualToMonthly : sal.interval === "1 MONTH" ? Math.round : null;
      if (f) { min = sal.minValue ? f(sal.minValue) : null; max = sal.maxValue ? f(sal.maxValue) : null; }
    }
    const wmRaw = j.workplaceType?.toLowerCase();
    const wm: WorkMode | null = wmRaw === "remote" ? "remote" : wmRaw === "hybrid" ? "hybrid" : wmRaw === "onsite" ? "onsite" : j.isRemote ? "remote" : null;
    return buildJob(
      { title: j.title.trim(), company: boardName || prettifySlug(slug), description: j.descriptionPlain?.trim() || null, location: j.location?.trim() || null, postedAt: j.publishedAt ? new Date(j.publishedAt) : null, applyUrl: j.applyUrl ?? j.jobUrl ?? null, source: "ashby", sourceJobId: `${slug}:${j.id}`, sourceUrl: j.jobUrl ?? null, discoveredAt: now },
      { workMode: wm, jobType: mapEmploymentType(j.employmentType), salaryMin: min ?? max, salaryMax: max ?? min, salaryCurrency: min || max ? (sal?.currencyCode ?? null) : null, salaryText: j.compensation?.compensationTierSummary ?? null },
    );
  });
}

export async function fetchAshby(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const jobs: NormalizedJob[] = [], completeBoards: string[] = [], errors: string[] = [], listedIds: string[] = [];
  for (const b of ctx.boards.filter((x) => x.ats === "ashby")) {
    try {
      const resp = await fetchJson<{ jobs?: AshbyJob[] }>(ashbyUrl(b.slug));
      completeBoards.push(b.slug);
      const all = mapAshby(resp, b.slug, b.name, now);
      listedIds.push(...all.map((j) => j.sourceJobId));
      jobs.push(...all.filter((j) => isRecent(j.postedAt, ctx.maxAgeDays, now) && matchesKeywords(j, [], ctx.keywords)));
    } catch (e) { errors.push(`ashby/${b.slug}: ${e instanceof HttpFailure ? e.message : String(e)}`); }
  }
  return { jobs, completeBoards, listedIds, errors };
}
