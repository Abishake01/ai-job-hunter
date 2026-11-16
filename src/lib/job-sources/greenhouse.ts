import { buildJob, decodeEntities, htmlToText, isRecent, matchesKeywords } from "./normalize";
import { fetchJson, HttpFailure } from "./http";
import { prettifySlug } from "./boards";
import type { AdapterResult, NormalizedJob, SourceContext } from "./types";

interface GhJob { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string; updated_at?: string; company_name?: string; content?: string; application_deadline?: string | null; metadata?: { name: string; value: unknown }[] | null }
export const ghUrl = (slug: string) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;

/** sourceJobId is `${slug}:${id}` so availability checks can address the board. */
export function mapGreenhouse(resp: { jobs?: GhJob[] }, slug: string, boardName?: string, now = new Date()): NormalizedJob[] {
  return (resp.jobs ?? []).filter((j) => j.id && j.title).map((j) =>
    buildJob(
      // `content` is HTML-entity-escaped HTML: decode once, then strip tags.
      { title: j.title.trim(), company: j.company_name?.trim() || boardName || prettifySlug(slug), description: htmlToText(decodeEntities(j.content ?? "")) || null, location: j.location?.name?.trim() || null, postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null, applyUrl: j.absolute_url, source: "greenhouse", sourceJobId: `${slug}:${j.id}`, sourceUrl: j.absolute_url, discoveredAt: now },
      { deadline: j.application_deadline ? new Date(j.application_deadline) : null },
    ));
}

export async function fetchGreenhouse(ctx: SourceContext): Promise<AdapterResult> {
  const now = new Date();
  const jobs: NormalizedJob[] = [], completeBoards: string[] = [], errors: string[] = [], listedIds: string[] = [];
  for (const b of ctx.boards.filter((x) => x.ats === "greenhouse")) {
    try {
      const resp = await fetchJson<{ jobs?: GhJob[] }>(ghUrl(b.slug));
      const all = mapGreenhouse(resp, b.slug, b.name, now);
      completeBoards.push(b.slug);
      listedIds.push(...all.map((j) => j.sourceJobId));
      jobs.push(...all.filter((j) => isRecent(j.postedAt, ctx.maxAgeDays, now) && matchesKeywords(j, [], ctx.keywords)));
    } catch (e) { errors.push(`greenhouse/${b.slug}: ${e instanceof HttpFailure ? e.message : String(e)}`); }
  }
  return { jobs, completeBoards, listedIds, errors };
}
