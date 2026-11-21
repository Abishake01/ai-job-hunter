import "server-only";
import { and, desc, eq, gte, inArray, notExists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, applications, companies, emailOutreach, jobMatches, jobs, recruiters } from "@/lib/db/schema";
import { getSettings } from "@/lib/services/profile.service";
import { getProfileCompleteness } from "@/lib/services/completeness.service";
import { isGmailConnected } from "@/lib/services/gmail.service";
import { findContactsForJob, isEmailBlocked } from "@/lib/services/recruiter.service";
import { approveOutreach, generateEmail, sendOutreach } from "@/lib/services/email.service";
import { markApplied, setJobStatus } from "@/lib/services/application.service";
import { logActivity } from "@/lib/services/activity.service";

const OPEN = ["discovered", "shortlisted", "ready_to_apply", "cold_email_drafted"] as const;
/** Contacts whose address was only guessed ("inferred"/"unknown") are never auto-emailed: a bounce hurts your sender reputation. */
const SENDABLE = new Set(["verified", "public"]);

export type AutoApplyResult = { ran: boolean; reason?: string; missing?: string[]; sent: number; skippedNoContact: number; failed: number; remainingToday: number; applied: { jobId: string; title: string; company: string; to: string }[] };

/**
 * Opt-in auto-apply. Emails an application (resume attached, from the user's own Gmail) for top-matching jobs that have a public recruiter contact.
 * Guards: user enabled it · profile 100% complete · Gmail connected · score >= threshold · daily cap · never twice for the same job/recipient
 * (DB sentKey) · skips unsubscribed / do-not-contact · never guessed addresses. Jobs without a contact are left for you (status: Ready to Apply).
 */
export async function runAutoApply(userId: string, opts: { force?: boolean } = {}): Promise<AutoApplyResult> {
  const empty = (reason: string, extra: Partial<AutoApplyResult> = {}): AutoApplyResult => ({ ran: false, reason, sent: 0, skippedNoContact: 0, failed: 0, remainingToday: 0, applied: [], ...extra });
  const cfg = (await getSettings(userId)).autoApply;
  if (!cfg.enabled && !opts.force) return empty("Auto-apply is turned off in Settings → Daily workflow");
  const comp = await getProfileCompleteness(userId);
  if (!comp.complete) return empty(`Profile is ${comp.percent}% complete — finish it to enable auto-apply`, { missing: comp.missing.map((m) => m.label) });
  if (!(await isGmailConnected(userId))) return empty("Connect Gmail in Settings → Gmail so applications can be sent from your address");

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(activityLog).where(and(eq(activityLog.userId, userId), eq(activityLog.kind, "auto_apply"), gte(activityLog.createdAt, startOfDay)));
  let remaining = cfg.dailyCap - n;
  const res: AutoApplyResult = { ran: true, sent: 0, skippedNoContact: 0, failed: 0, remainingToday: Math.max(0, remaining), applied: [] };
  if (remaining <= 0) return { ...res, reason: `Daily cap of ${cfg.dailyCap} reached` };

  const rows = await db.select({ id: jobs.id, title: jobs.title, company: companies.name, score: jobMatches.score }).from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .where(and(eq(jobs.userId, userId), eq(jobs.isActive, true), inArray(jobs.status, [...OPEN]), sql`${jobMatches.score} >= ${cfg.minScore}`,
      notExists(db.select({ x: sql`1` }).from(applications).where(and(eq(applications.userId, userId), eq(applications.jobId, jobs.id)))),
      notExists(db.select({ x: sql`1` }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.jobId, jobs.id), eq(emailOutreach.status, "sent")))),
      notExists(db.select({ x: sql`1` }).from(activityLog).where(and(eq(activityLog.userId, userId), eq(activityLog.jobId, jobs.id), eq(activityLog.kind, "auto_apply_skipped"), gte(activityLog.createdAt, new Date(Date.now() - 3 * 86400_000)))))))
    .orderBy(desc(jobMatches.score)).limit(Math.max(remaining * 4, 20));

  for (const j of rows) {
    if (remaining <= 0) break;
    try {
      let recs = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.jobId, j.id), eq(recruiters.doNotContact, false)));
      if (!recs.some((r) => r.email)) { await findContactsForJob(userId, j.id).catch(() => undefined); recs = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.jobId, j.id), eq(recruiters.doNotContact, false))); }
      let rec: (typeof recs)[number] | undefined;
      for (const r of recs.filter((x) => x.email && SENDABLE.has(x.verification))) { if (!(await isEmailBlocked(userId, r.email)).unsubscribed) { rec = r; break; } }
      if (!rec) {
        res.skippedNoContact++;
        await logActivity(userId, j.id, "auto_apply_skipped", "Auto-apply skipped: no public recruiter email", "Apply on the company page yourself, or add a contact.", { score: j.score });
        await setJobStatus(userId, j.id, "ready_to_apply", "Auto-apply found no contact; ready for you to apply").catch(() => undefined);
        continue;
      }
      const kind = cfg.kinds.includes("recruiter_outreach") ? "recruiter_outreach" : "direct_application";
      const draft = await generateEmail(userId, { jobId: j.id, kind, recruiterId: rec.id });
      await approveOutreach(userId, draft.id, true);
      await sendOutreach(userId, draft.id, true);
      await markApplied(userId, j.id, { method: "email", resumeId: draft.resumeId, notes: `Auto-applied by email to ${rec.email}` }).catch(() => undefined);
      await logActivity(userId, j.id, "auto_apply", `Auto-applied by email to ${rec.email}`, draft.subject, { outreachId: draft.id, score: j.score });
      res.sent++; remaining--; res.applied.push({ jobId: j.id, title: j.title, company: j.company, to: rec.email! });
    } catch (e) {
      res.failed++;
      await logActivity(userId, j.id, "auto_apply_skipped", "Auto-apply failed", (e instanceof Error ? e.message : String(e)).slice(0, 300)).catch(() => undefined);
    }
  }
  return { ...res, remainingToday: Math.max(0, remaining) };
}
