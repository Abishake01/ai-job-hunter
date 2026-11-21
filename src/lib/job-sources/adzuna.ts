import { annualToMonthly, buildJob, htmlToText, isRecent, mapEmploymentType } from "./normalize";
import { fetchJson } from "./http";
import { queryTerms } from "./keywords";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

// Shape per Adzuna's public API docs (requires the user's own app_id/app_key; not verifiable without a key).
interface AdzunaJob { id: string | number; title: string; description?: string; created?: string; redirect_url: string; company?: { display_name?: string }; location?: { display_name?: string }; salary_min?: number; salary_max?: number; salary_is_predicted?: string | number; contract_type?: string; contract_time?: string }
const CURRENCY: Record<string, string> = { in: "INR", gb: "GBP", us: "USD", ca: "CAD", au: "AUD", de: "EUR", fr: "EUR", nl: "EUR", it: "EUR", es: "EUR", at: "EUR", be: "EUR", pl: "PLN", sg: "SGD", nz: "NZD", br: "BRL", mx: "MXN", za: "ZAR", ch: "CHF" };

export function mapAdzuna(resp: { results?: AdzunaJob[] }, country: string, now = new Date()): NormalizedJob[] {
  return (resp.results ?? []).filter((j) => j.id && j.title && j.redirect_url).map((j) => {
    const predicted = String(j.salary_is_predicted ?? "0") === "1"; // Adzuna estimates are not real listings => Unknown
    const min = !predicted && j.salary_min ? annualToMonthly(j.salary_min) : null;
    const max = !predicted && j.salary_max ? annualToMonthly(j.salary_max) : null;
    return buildJob(
      { title: htmlToText(j.title), company: j.company?.display_name?.trim() || "Unknown company", description: htmlToText(j.description) || null, location: j.location?.display_name ?? null, postedAt: j.created ? new Date(j.created) : null, applyUrl: j.redirect_url, source: "adzuna", sourceJobId: String(j.id), sourceUrl: j.redirect_url, discoveredAt: now },
      { jobType: mapEmploymentType(j.contract_time) ?? mapEmploymentType(j.contract_type), salaryMin: min ?? max, salaryMax: max ?? min, salaryCurrency: min || max ? CURRENCY[country.toLowerCase()] ?? null : null, salaryText: min || max ? `${j.salary_min ?? "?"}-${j.salary_max ?? "?"} per year` : null },
    );
  });
}

export async function fetchAdzuna(ctx: SourceContext): Promise<AdapterResult> {
  const cred = ctx.credentials.adzuna;
  if (!cred) return { jobs: [] };
  const now = new Date();
  const out = new Map<string, NormalizedJob>();
  const errors: string[] = [];
  for (const kw of queryTerms(ctx.keywords.length ? ctx.keywords : ["software engineer"], 8)) {
    for (const page of [1, 2]) {
      try {
        const u = new URL(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(ctx.country.toLowerCase())}/search/${page}`);
        u.search = new URLSearchParams({ app_id: cred.appId, app_key: cred.appKey, what: kw, results_per_page: "50", max_days_old: String(ctx.maxAgeDays), sort_by: "date", "content-type": "application/json" }).toString();
        const resp = await fetchJson<{ results?: AdzunaJob[] }>(u.toString());
        const got = mapAdzuna(resp, ctx.country, now);
        for (const j of got) if (isRecent(j.postedAt, ctx.maxAgeDays, now)) out.set(j.sourceJobId, j);
        if (got.length < 50) break;
      } catch (e) { errors.push(`adzuna "${kw}": ${e instanceof Error ? e.message.split(cred.appKey).join("***") : String(e)}`); break; }
    }
  }
  if (!out.size && errors.length) throw new Error(errors[0]);
  return { jobs: [...out.values()], errors };
}
