import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobSources, jobs } from "@/lib/db/schema";
import { logActivity } from "@/lib/services/activity.service";
import { requireOwnedJob } from "@/lib/services/job.service";
import { assertPublicHttpUrl, fetchJson, HttpFailure, isAllowedByRobots, politeFetch } from "@/lib/job-sources/http";
import { classifyPage, type Availability } from "@/lib/job-sources/closed";

export type { Availability };
export interface AvailabilityResult { status: Availability; reason: string; checkedAt: string; method: "ats-api" | "page" | "none" }

async function checkAtsApi(source: string, sourceJobId: string): Promise<{ status: Availability; reason: string } | null> {
  const [slug, ...rest] = sourceJobId.split(":");
  const id = rest.join(":");
  if (!slug || !id) return null;
  try {
    if (source === "greenhouse") {
      const res = await politeFetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(id)}`);
      if (res.status === 404) return { status: "expired", reason: "Greenhouse board no longer lists this job (404)" };
      if (res.ok) return { status: "available", reason: "Still listed on the Greenhouse board" };
    } else if (source === "lever") {
      const res = await politeFetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
      if (res.status === 404) return { status: "expired", reason: "Lever board no longer lists this posting (404)" };
      if (res.ok) return { status: "available", reason: "Still listed on the Lever board" };
    } else if (source === "ashby") {
      const resp = await fetchJson<{ jobs?: { id: string; isListed?: boolean }[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
      const hit = resp.jobs?.find((j) => j.id === id);
      return hit && hit.isListed !== false ? { status: "available", reason: "Still listed on the Ashby board" } : { status: "expired", reason: "Ashby board no longer lists this job" };
    }
  } catch (e) { return { status: "unknown", reason: e instanceof HttpFailure ? e.message : "Check failed" }; }
  return null;
}

/** Marks the job expired/active by checking the ATS API (when the source is an ATS board) or the apply URL (robots.txt respected). Unknown results never change the job. */
export async function checkAvailability(userId: string, jobId: string): Promise<AvailabilityResult> {
  const job = await requireOwnedJob(userId, jobId);
  const prov = await db.select().from(jobSources).where(and(eq(jobSources.jobId, jobId), eq(jobSources.userId, userId)));
  let outcome: { status: Availability; reason: string; method: AvailabilityResult["method"] } = { status: "unknown", reason: "No application URL to check", method: "none" };

  const ats = prov.find((p) => ["greenhouse", "lever", "ashby"].includes(p.source));
  if (ats) {
    const r = await checkAtsApi(ats.source, ats.sourceJobId);
    if (r) outcome = { ...r, method: "ats-api" };
  }
  if (outcome.method === "none" && job.applyUrl) {
    try {
      const u = await assertPublicHttpUrl(job.applyUrl);
      if (!(await isAllowedByRobots(u.toString()))) outcome = { status: "unknown", reason: "robots.txt does not allow an automated check; open the link yourself", method: "page" };
      else {
        const res = await politeFetch(u.toString(), { accept: "text/html", timeoutMs: 12000, retries: 1 });
        const body = res.status >= 200 && res.status < 300 ? (await res.text()).slice(0, 1_500_000) : "";
        outcome = { ...classifyPage(res.status, body), method: "page" };
      }
    } catch (e) { outcome = { status: "unknown", reason: e instanceof Error ? e.message : "Check failed", method: "page" }; }
  }

  const now = new Date();
  const patch: Partial<typeof jobs.$inferInsert> = { lastCheckedAt: now };
  if (outcome.status === "expired" && job.isActive) Object.assign(patch, { isActive: false, expiredAt: now });
  if (outcome.status === "available" && !job.isActive) Object.assign(patch, { isActive: true, expiredAt: null });
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
  if (outcome.status === "expired" && job.isActive) await logActivity(userId, jobId, "note", "Listing appears to be closed", outcome.reason, { availability: "expired" });
  return { status: outcome.status, reason: outcome.reason, checkedAt: now.toISOString(), method: outcome.method };
}

/** Called by discovery: ATS jobs no longer present on a fully-fetched board are marked expired. */
export async function markNoLongerListed(userId: string, source: string, slug: string, stillListedSourceIds: Set<string>): Promise<number> {
  const rows = await db.select({ jobId: jobSources.jobId, sourceJobId: jobSources.sourceJobId, isActive: jobs.isActive }).from(jobSources).innerJoin(jobs, eq(jobs.id, jobSources.jobId))
    .where(and(eq(jobSources.userId, userId), eq(jobSources.source, source)));
  const gone = rows.filter((r) => r.isActive && r.sourceJobId.startsWith(`${slug}:`) && !stillListedSourceIds.has(r.sourceJobId));
  let n = 0;
  for (const r of gone) {
    // only expire when no OTHER active listing source still carries this job
    const others = await db.select({ source: jobSources.source, sourceJobId: jobSources.sourceJobId }).from(jobSources).where(and(eq(jobSources.jobId, r.jobId), eq(jobSources.userId, userId)));
    if (others.some((o) => o.source !== source || o.sourceJobId !== r.sourceJobId)) continue;
    const now = new Date();
    await db.update(jobs).set({ isActive: false, expiredAt: now, lastCheckedAt: now }).where(and(eq(jobs.id, r.jobId), eq(jobs.userId, userId)));
    await logActivity(userId, r.jobId, "note", "Listing no longer on the company board", `${source}/${slug} stopped listing this job`, { availability: "expired" });
    n++;
  }
  return n;
}
