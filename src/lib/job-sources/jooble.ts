import { buildJob, htmlToText, isRecent, mapEmploymentType } from "./normalize";
import { fetchJson } from "./http";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

// Shape per Jooble's public REST API docs (POST https://jooble.org/api/{key}); needs the user's own key.
interface JoobleJob { id?: number | string; title?: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link?: string; company?: string; updated?: string }

export function mapJooble(resp: { jobs?: JoobleJob[] }, now = new Date()): NormalizedJob[] {
  return (resp.jobs ?? []).filter((j) => j.title && j.link).map((j) =>
    buildJob(
      { title: htmlToText(j.title), company: j.company?.trim() || "Unknown company", description: htmlToText(j.snippet) || null, location: j.location?.trim() || null, postedAt: j.updated ? new Date(j.updated) : null, applyUrl: j.link!, source: "jooble", sourceJobId: String(j.id ?? j.link), sourceUrl: j.link!, discoveredAt: now },
      { jobType: mapEmploymentType(j.type), salaryText: j.salary?.trim() || null },
    ));
}

export async function fetchJooble(ctx: SourceContext): Promise<AdapterResult> {
  const key = ctx.credentials.jooble?.apiKey;
  if (!key) return { jobs: [] };
  const now = new Date();
  const out = new Map<string, NormalizedJob>();
  for (const kw of (ctx.keywords.length ? ctx.keywords : ["software engineer"]).slice(0, 4)) {
    const resp = await fetchJson<{ jobs?: JoobleJob[] }>(`https://jooble.org/api/${encodeURIComponent(key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: kw, location: ctx.country === "in" ? "India" : "" }) });
    for (const j of mapJooble(resp, now)) if (isRecent(j.postedAt, ctx.maxAgeDays, now)) out.set(j.sourceJobId, j);
  }
  return { jobs: [...out.values()] };
}
