import "server-only";
import { and, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailOutreach, jobMatches, jobs, recruiters } from "@/lib/db/schema";
import { getSettings } from "@/lib/services/profile.service";
import { detectFollowUps, setJobStatus } from "@/lib/services/application.service";
import { saveDailyReport } from "@/lib/services/report.service";

export type WorkflowStep = { name: string; status: "ok" | "skipped" | "failed"; detail?: string; data?: Record<string, unknown> };
export type WorkflowResult = { steps: WorkflowStep[]; reportId: string | null; startedAt: string; finishedAt: string };

const CONTACT_LIMIT = 15;
const DRAFT_LIMIT = 10;
const OPEN = ["discovered", "shortlisted", "ready_to_apply"] as const;

/**
 * Daily workflow: fetch → gmail → dedupe → match → contacts → drafts → tracker → report.
 * Each step is toggleable via settings and failure-isolated (an error is recorded and the next step still runs).
 * SAFETY: only creates email DRAFTS; never sends email and never submits applications.
 */
export async function runDailyWorkflow(userId: string, opts: { onStep?: (s: WorkflowStep) => Promise<unknown> | unknown; force?: boolean } = {}): Promise<WorkflowResult> {
  const settings = await getSettings(userId);
  const cfg = settings.dailyWorkflow;
  const startedAt = new Date().toISOString();
  const steps: WorkflowStep[] = [];
  const push = async (s: WorkflowStep) => { steps.push(s); try { await opts.onStep?.(s); } catch { /* progress reporting must never break the workflow */ } };
  const run = async (name: string, enabled: boolean, fn: () => Promise<{ detail: string; data?: Record<string, unknown> } | "skip">, skipReason = "Disabled in settings") => {
    if (!enabled) return push({ name, status: "skipped", detail: skipReason });
    try {
      const r = await fn();
      if (r === "skip") return;
      await push({ name, status: "ok", detail: r.detail, data: r.data });
    } catch (e) { await push({ name, status: "failed", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }); }
  };

  let discovery: { fetched?: number; new?: number; duplicates?: number; expired?: number } = {};
  await run("fetch", cfg.steps.fetchJobs, async () => {
    const { runDiscovery } = await import("@/lib/services/discovery.service");
    discovery = await runDiscovery(userId, {});
    return { detail: `${discovery.fetched ?? 0} fetched, ${discovery.new ?? 0} new`, data: { ...discovery } };
  });

  await run("gmail", cfg.steps.processGmail, async () => {
    const gm = await import("@/lib/services/gmail.service");
    const status = (await gm.getGmailStatus(userId)) as { connected?: boolean };
    if (!status?.connected) { await push({ name: "gmail", status: "skipped", detail: "Gmail not connected" }); return "skip"; }
    const r = (await gm.syncGmail(userId, { days: 2 })) as unknown as Record<string, unknown>;
    return { detail: `scanned ${r.scanned ?? "?"}, relevant ${r.relevant ?? "?"}`, data: r };
  });

  await run("dedupe", true, async () => ({ detail: `${discovery.duplicates ?? 0} duplicates merged by fingerprint/URL during fetch; ${discovery.expired ?? 0} expired`, data: { duplicates: discovery.duplicates ?? 0, expired: discovery.expired ?? 0 } }));

  await run("match", cfg.steps.match, async () => {
    const { matchJobs } = await import("@/lib/services/matching.service");
    const r = await matchJobs(userId, { onlyUnmatched: true, limit: 200 });
    return { detail: `${r.matched} matched, ${r.failed} failed`, data: { ...r } };
  });

  await run("contacts", cfg.steps.findContacts, async () => {
    const { findContactsForJob } = await import("@/lib/services/recruiter.service");
    const rows = await db.select({ id: jobs.id }).from(jobs).innerJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
      .where(and(eq(jobs.userId, userId), eq(jobs.isActive, true), inArray(jobs.status, [...OPEN]), sql`${jobMatches.score} >= ${cfg.minScoreForContacts}`,
        notExists(db.select({ x: sql`1` }).from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.jobId, jobs.id))))))
      .orderBy(desc(jobMatches.score)).limit(CONTACT_LIMIT);
    let done = 0, failed = 0;
    for (const r of rows) { try { await findContactsForJob(userId, r.id); done++; } catch { failed++; } }
    return { detail: `${done} jobs searched for contacts${failed ? `, ${failed} failed` : ""}`, data: { searched: done, failed } };
  });

  await run("drafts", cfg.steps.draftEmails, async () => {
    const { generateEmail } = await import("@/lib/services/email.service");
    const rows = await db.select({ id: jobs.id, status: jobs.status }).from(jobs).innerJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
      .where(and(eq(jobs.userId, userId), eq(jobs.isActive, true), inArray(jobs.status, [...OPEN]), sql`${jobMatches.score} >= ${cfg.minScoreForDrafts}`,
        notExists(db.select({ x: sql`1` }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.jobId, jobs.id))))))
      .orderBy(desc(jobMatches.score)).limit(DRAFT_LIMIT);
    let created = 0, failed = 0;
    for (const j of rows) {
      try {
        const recs = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.jobId, j.id), eq(recruiters.doNotContact, false)));
        const rec = recs.find((r) => r.email);
        await generateEmail(userId, { jobId: j.id, kind: rec ? "recruiter_outreach" : "direct_application", recruiterId: rec?.id }); // draft only
        await setJobStatus(userId, j.id, "cold_email_drafted", "Draft created by daily workflow (not sent)").catch(() => undefined);
        created++;
      } catch { failed++; }
    }
    return { detail: `${created} drafts created (not sent)${failed ? `, ${failed} failed` : ""}`, data: { created, failed } };
  });

  await run("tracker", true, async () => {
    const r = await detectFollowUps(userId);
    return { detail: `${r.flagged.length} job(s) flagged for follow-up`, data: { flagged: r.flagged.length } };
  });

  let reportId: string | null = null;
  await run("report", true, async () => {
    const row = await saveDailyReport(userId, steps.map((s) => ({ name: s.name, status: s.status, detail: s.detail })));
    reportId = row.id;
    return { detail: `Report saved for ${row.reportDate}` };
  });
  return { steps, reportId, startedAt, finishedAt: new Date().toISOString() };
}
