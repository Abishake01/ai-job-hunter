import { annualToMonthly, buildJob, htmlToText, isRecent, matchesKeywords, mapEmploymentType } from "./normalize";
import { fetchJson, HttpFailure } from "./http";
import { prettifySlug } from "./boards";
import type { AdapterResult, NormalizedJob, SourceContext, WorkMode } from "./types";

interface LeverJob { id: string; text: string; categories?: { commitment?: string; location?: string; team?: string; department?: string; allLocations?: string[] }; createdAt?: number; descriptionPlain?: string; descriptionBodyPlain?: string; lists?: { text: string; content: string }[]; additionalPlain?: string; salaryRange?: { min?: number; max?: number; currency?: string; interval?: string }; workplaceType?: string; hostedUrl?: string; applyUrl?: string }
export const leverUrl = (slug: string) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;

function monthly(v: number | undefined, interval?: string): number | null {
  if (!v) return null;
  if (interval === "per-year-salary") return annualToMonthly(v);
  if (interval === "per-month-salary") return Math.round(v);
  return null; // hourly/other => Unknown
}

export function mapLever(resp: LeverJob[], slug: string, boardName?: string, now = new Date()): NormalizedJob[] {
  return resp.filter((j) => j.id && j.text).map((j) => {
    const body = [j.descriptionPlain ?? j.descriptionBodyPlain ?? "", ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain ?? ""].filter(Boolean).join("\n\n").trim();
    const sr = j.salaryRange;
    const min = monthly(sr?.min, sr?.interval), max = monthly(sr?.max, sr?.interval);
    const wm = (["remote", "hybrid", "onsite"] as const).includes(j.workplaceType as WorkMode) ? (j.workplaceType as WorkMode) : null;
    const loc = j.categories?.location ?? j.categories?.allLocations?.[0] ?? null;
    return buildJob(
      { title: j.text.trim(), company: boardName || prettifySlug(slug), description: body || null, location: loc, postedAt: j.createdAt ? new Date(j.createdAt) : null, applyUrl: j.applyUrl ?? j.hostedUrl ?? null, source: "lever", sourceJobId: `${slug}:${j.id}`, sourceUrl: j.hostedUrl ?? null, discoveredAt: now },
      { workMode: wm, jobType: mapEmploymentType(j.categories?.commitment), salaryMin: min, salaryMax: max, salaryCurrency: min || max ? (sr?.currency ?? null) : null, salaryText: sr && (min || max) ? `${sr.currency ?? ""} ${sr.min ?? "?"}-${sr.max ?? "?"} ${sr.interval ?? ""}`.trim() : null },
    );
  });
}

export async function fetchLever(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const jobs: NormalizedJob[] = [], completeBoards: string[] = [], errors: string[] = [], listedIds: string[] = [];
  for (const b of ctx.boards.filter((x) => x.ats === "lever")) {
    try {
      const resp = await fetchJson<LeverJob[]>(leverUrl(b.slug));
      completeBoards.push(b.slug);
      const all = mapLever(resp, b.slug, b.name, now);
      listedIds.push(...all.map((j) => j.sourceJobId));
      jobs.push(...all.filter((j) => isRecent(j.postedAt, ctx.maxAgeDays, now) && matchesKeywords(j, [], ctx.keywords)));
    } catch (e) { errors.push(`lever/${b.slug}: ${e instanceof HttpFailure ? e.message : String(e)}`); }
  }
  return { jobs, completeBoards, listedIds, errors };
}
