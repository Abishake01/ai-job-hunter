import { buildJob, htmlToText, isRecent, mapEmploymentType } from "./normalize";
import { fetchJson } from "./http";
import { queryTerms } from "./keywords";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

interface HimalayasJob { title?: string; companyName?: string; employmentType?: string; minSalary?: number | null; maxSalary?: number | null; salaryPeriod?: string; currency?: string | null; locationRestrictions?: string[]; categories?: string[]; description?: string; pubDate?: number; applicationLink?: string; guid?: string }
export const HIMALAYAS_SEARCH = "https://himalayas.app/jobs/api/search";

export function mapHimalayas(resp: { jobs?: HimalayasJob[] }, now = new Date()): NormalizedJob[] {
  return (resp.jobs ?? []).filter((j) => j.title && j.companyName && (j.applicationLink || j.guid)).map((j) => {
    const link = (j.applicationLink || j.guid)!;
    const restr = (j.locationRestrictions ?? []).filter(Boolean);
    const period = (j.salaryPeriod ?? "annual").toLowerCase();
    const toMonthly = (n?: number | null) => (n ? Math.round(period.startsWith("month") ? n : period.startsWith("year") || period === "annual" ? n / 12 : n) : null);
    const min = toMonthly(j.minSalary), max = toMonthly(j.maxSalary);
    return buildJob(
      { title: htmlToText(j.title!).trim(), company: j.companyName!.trim(), description: htmlToText(j.description) || null, location: restr.length ? `Remote — ${restr.join(", ")}` : "Remote — Worldwide", postedAt: j.pubDate ? new Date(j.pubDate * 1000) : null, applyUrl: link, source: "himalayas", sourceJobId: j.guid ?? link, sourceUrl: link, discoveredAt: now },
      { workMode: "remote", jobType: mapEmploymentType(j.employmentType), skills: j.categories ?? [], salaryMin: min ?? max, salaryMax: max ?? min, salaryCurrency: min || max ? j.currency ?? null : null, salaryText: min || max ? `${j.minSalary ?? "?"}-${j.maxSalary ?? "?"} ${j.currency ?? ""} ${period}`.trim() : null },
    );
  });
}

/** Himalayas public search API, one query per profile keyword, restricted to India-eligible + worldwide remote roles. */
export async function fetchHimalayas(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const out = new Map<string, NormalizedJob>();
  const errors: string[] = [];
  for (const kw of queryTerms(ctx.keywords.length ? ctx.keywords : ["software engineer"], 6)) {
    for (const country of ["IN", ""]) {
      try {
        const u = new URL(HIMALAYAS_SEARCH);
        u.searchParams.set("q", kw);
        if (country) u.searchParams.set("country", country);
        const resp = await fetchJson<{ jobs?: HimalayasJob[] }>(u.toString());
        for (const j of mapHimalayas(resp, now)) if (isRecent(j.postedAt, ctx.maxAgeDays, now)) out.set(j.sourceJobId, j);
      } catch (e) { errors.push(`himalayas "${kw}": ${e instanceof Error ? e.message : e}`); }
    }
  }
  if (!out.size && errors.length) throw new Error(errors[0]);
  return { jobs: [...out.values()], errors };
}
