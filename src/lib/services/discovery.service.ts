import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sourceHealth, userIntegrations } from "@/lib/db/schema";
import { decryptJson } from "@/lib/utils/crypto";
import { getProfile, getSettings } from "@/lib/services/profile.service";
import { upsertDiscoveredJob } from "@/lib/services/job.service";
import { applyLocationPolicy } from "@/lib/job-sources/location-policy";
import { mergeBoards } from "@/lib/job-sources/curated-boards";
import { markNoLongerListed } from "@/lib/services/availability.service";
import { enqueueTask } from "@/lib/services/tasks.service";
import { expandRoleKeywords } from "@/lib/job-sources/normalize";
import { RUNNABLE_SOURCES, SOURCE_BY_KEY, SOURCES } from "@/lib/job-sources/registry";
import type { SourceContext, SourceDef } from "@/lib/job-sources/types";
import type { SourceInfo } from "@/lib/jobs/types";

export interface DiscoveryResult {
  fetched: number; new: number; duplicates: number; expired: number; filteredOut?: number;
  perSource: Record<string, { fetched: number; new: number; duplicates: number; status: "ok" | "error" | "skipped"; message?: string }>;
  errors: string[];
}

async function loadCredentials(userId: string): Promise<SourceContext["credentials"]> {
  const rows = await db.select().from(userIntegrations).where(and(eq(userIntegrations.userId, userId)));
  const out: SourceContext["credentials"] = {};
  for (const r of rows) {
    if (!r.secretsEnc) continue;
    try {
      const sec = decryptJson<{ appKey?: string; apiKey?: string }>(r.secretsEnc);
      if (r.provider === "adzuna" && sec.appKey && typeof r.config?.app_id === "string") out.adzuna = { appId: r.config.app_id, appKey: sec.appKey };
      if (r.provider === "jooble" && sec.apiKey) out.jooble = { apiKey: sec.apiKey };
    } catch { /* unreadable secret => treated as not configured */ }
  }
  return out;
}

/** Why a source cannot run right now (null = ready). */
export function notReadyReason(def: SourceDef, ctx: SourceContext): string | null {
  if (def.key === "adzuna" && !ctx.credentials.adzuna) return "Add your Adzuna app id and key in Settings → Discovery";
  if (def.key === "jooble" && !ctx.credentials.jooble) return "Add your Jooble API key in Settings → Discovery";
  if (def.needs === "boards" && !ctx.boards.some((b) => b.ats === def.key)) return `No ${def.key} company boards added yet (Settings → Discovery)`;
  if (def.needs === "feeds" && !ctx.rssFeeds.length) return "No RSS feeds added yet";
  return null;
}

async function buildContext(userId: string): Promise<{ ctx: SourceContext; enabled: string[] }> {
  const [settings, profile, credentials] = await Promise.all([getSettings(userId), getProfile(userId), loadCredentials(userId)]);
  const d = settings.discovery;
  const keywords = d.keywords.length ? d.keywords : expandRoleKeywords(profile?.targetRoles ?? []);
  return { enabled: d.enabledSources, ctx: { keywords, country: d.country, maxAgeDays: d.maxAgeDays, boards: mergeBoards(d.companyBoards, d.useCuratedBoards), rssFeeds: d.rssFeeds, credentials } };
}

async function recordHealth(userId: string, source: string, r: { status: "ok" | "error" | "skipped"; fetched?: number; newCount?: number; error?: string | null }) {
  const now = new Date();
  const [cur] = await db.select().from(sourceHealth).where(and(eq(sourceHealth.userId, userId), eq(sourceHealth.source, source)));
  const failures = r.status === "error" ? (cur?.consecutiveFailures ?? 0) + 1 : r.status === "ok" ? 0 : cur?.consecutiveFailures ?? 0;
  const values = {
    userId, source, lastRunAt: now, lastSuccessAt: r.status === "ok" ? now : cur?.lastSuccessAt ?? null, lastStatus: r.status,
    lastError: r.error ?? null, lastFetched: r.fetched ?? 0, lastNew: r.newCount ?? 0, consecutiveFailures: failures,
  };
  await db.insert(sourceHealth).values(values).onConflictDoUpdate({ target: [sourceHealth.userId, sourceHealth.source], set: values });
}

/** Fetches every enabled (or requested) source, upserts with dedupe, records health, flags jobs that vanished from company boards. */
export async function runDiscovery(userId: string, opts: { sources?: string[] } = {}): Promise<DiscoveryResult> {
  const { ctx, enabled } = await buildContext(userId);
  const abroadRemoteOnly = (await getSettings(userId)).discovery.abroadRemoteOnly;
  const wanted = (opts.sources?.length ? opts.sources : enabled).filter((k) => SOURCE_BY_KEY.get(k)?.fetch);
  const res: DiscoveryResult = { fetched: 0, new: 0, duplicates: 0, expired: 0, perSource: {}, errors: [] };

  for (const key of wanted) {
    const def = SOURCE_BY_KEY.get(key)!;
    const skip = notReadyReason(def, ctx);
    if (skip) {
      res.perSource[key] = { fetched: 0, new: 0, duplicates: 0, status: "skipped", message: skip };
      await recordHealth(userId, key, { status: "skipped", error: skip });
      continue;
    }
    const stat = { fetched: 0, new: 0, duplicates: 0, status: "ok" as "ok" | "error" | "skipped", message: undefined as string | undefined };
    try {
      const r = await def.fetch!(ctx);
      stat.fetched = r.jobs.length;
      for (const nj of r.jobs) {
        if (!applyLocationPolicy(nj, { abroadRemoteOnly }).keep) { res.filteredOut = (res.filteredOut ?? 0) + 1; continue; }
        try {
          const u = await upsertDiscoveredJob(userId, nj, { platform: key });
          if (u.created) stat.new++; else stat.duplicates++;
        } catch (e) { res.errors.push(`${key}: could not save "${nj.title}": ${e instanceof Error ? e.message : e}`); }
      }
      if (r.errors?.length) { res.errors.push(...r.errors); stat.message = r.errors.join("; "); }
      // "adapter no longer lists it" => expired
      if (r.completeBoards?.length) {
        const listed = new Set(r.listedIds ?? []);
        for (const slug of r.completeBoards) res.expired += await markNoLongerListed(userId, key, slug, listed);
      }
      if (r.errors?.length && !r.jobs.length && !r.completeBoards?.length) stat.status = "error"; // every board/feed failed
    } catch (e) {
      stat.status = "error";
      stat.message = e instanceof Error ? e.message : String(e);
      res.errors.push(`${key}: ${stat.message}`);
    }
    res.perSource[key] = stat;
    res.fetched += stat.fetched; res.new += stat.new; res.duplicates += stat.duplicates;
    await recordHealth(userId, key, { status: stat.status, fetched: stat.fetched, newCount: stat.new, error: stat.status === "error" ? stat.message : stat.message ?? null });
  }
  return res;
}

/** Queues a discover_jobs task through the task runner (durable, retried, idempotent per minute). */
export async function startDiscoveryTask(userId: string, sources?: string[]) {
  const bucket = Math.floor(Date.now() / 60_000);
  return enqueueTask(userId, "discover_jobs", sources?.length ? { sources } : {}, { idempotencyKey: `discover:${bucket}` });
}

/** Source list with health, enablement and configuration state (for Discovery panel / /api/sources). */
export async function listSources(userId: string): Promise<SourceInfo[]> {
  const { ctx, enabled } = await buildContext(userId);
  const health = await db.select().from(sourceHealth).where(eq(sourceHealth.userId, userId));
  const hmap = new Map(health.map((h) => [h.source, h]));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return SOURCES.map((s) => {
    const runnable = !!s.fetch;
    const note = runnable ? notReadyReason(s, ctx) : null;
    const h = hmap.get(s.key);
    return {
      key: s.key, label: s.label, kind: s.kind, needs: s.needs ?? null, website: s.website ?? null, compliance: s.compliance,
      runnable, enabled: runnable && enabled.includes(s.key), configured: runnable ? note === null : false, configNote: note,
      health: h ? { lastRunAt: iso(h.lastRunAt), lastSuccessAt: iso(h.lastSuccessAt), lastStatus: h.lastStatus, lastError: h.lastError, lastFetched: h.lastFetched, lastNew: h.lastNew, consecutiveFailures: h.consecutiveFailures } : null,
    };
  });
}
export { RUNNABLE_SOURCES };
