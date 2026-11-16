import "server-only";
import { and, desc, eq, inArray, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, applications, companies, emailConversations, emailOutreach, followUps, jobMatches, jobs, recruiters, type JobStatus } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { logActivity, scheduleFollowUp } from "@/lib/services/activity.service";
import { getSettings } from "@/lib/services/profile.service";
import { STATUS_LABELS, detectFollowUpJobIds, isJobStatus, validateTransition } from "./application.logic";

export { validateTransition, isJobStatus } from "./application.logic";

async function requireJob(userId: string, jobId: string) {
  const [j] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!j) throw new HttpError(404, "Job not found");
  return j;
}

/** Sets the pipeline status (validated), logs a "status" timeline entry. Returns the updated job row. */
export async function setJobStatus(userId: string, jobId: string, status: string, note?: string | null) {
  if (!isJobStatus(status)) throw new HttpError(400, `Invalid status "${status}"`);
  const job = await requireJob(userId, jobId);
  const t = validateTransition(job.status, status);
  if (!t.ok) throw new HttpError(409, t.reason);
  if (t.noop) return job;
  const patch: Partial<typeof jobs.$inferInsert> = { status };
  if (status === "shortlisted") patch.shortlisted = true;
  const [updated] = await db.update(jobs).set(patch).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId))).returning();
  await logActivity(userId, jobId, "status", `Status: ${STATUS_LABELS[job.status] ?? job.status} → ${STATUS_LABELS[status] ?? status}`, note ?? null, { from: job.status, to: status });
  if (status === "applied") {
    await db.insert(applications).values({ userId, jobId, method: "other", notes: note ?? null }).onConflictDoNothing();
  }
  return updated;
}

export type ApplyInput = { method?: "company_site" | "email" | "portal" | "referral" | "other"; resumeId?: string | null; notes?: string | null; appliedAt?: Date };

/**
 * Records that the USER applied (never submits anything itself). Duplicate prevention: 409 if already applied.
 */
export async function markApplied(userId: string, jobId: string, input: ApplyInput = {}) {
  const job = await requireJob(userId, jobId);
  const [existing] = await db.select().from(applications).where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)));
  if (existing) throw new HttpError(409, "You already applied to this job", { applicationId: existing.id });
  let row;
  try {
    [row] = await db.insert(applications).values({
      userId, jobId, method: input.method ?? "other", resumeId: input.resumeId ?? null, notes: input.notes ?? null, appliedAt: input.appliedAt ?? new Date(),
    }).returning();
  } catch (e) {
    if (/applications_uq|duplicate key/i.test(String((e as Error).message))) throw new HttpError(409, "You already applied to this job");
    throw e;
  }
  const from = job.status;
  if (from !== "applied") {
    await db.update(jobs).set({ status: "applied" }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
    await logActivity(userId, jobId, "status", `Status: ${STATUS_LABELS[from] ?? from} → Applied`, null, { from, to: "applied" });
  }
  await logActivity(userId, jobId, "applied", `Applied via ${row.method ?? "other"}`, input.notes ?? null, { method: row.method, applicationId: row.id });
  return row;
}

export async function getApplication(userId: string, jobId: string) {
  const [a] = await db.select().from(applications).where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)));
  return a ?? null;
}

export async function addNote(userId: string, jobId: string, note: string) {
  const job = await requireJob(userId, jobId);
  const text = note.trim();
  if (!text) throw new HttpError(400, "Note is empty");
  const merged = job.notes ? `${job.notes}\n\n${text}` : text;
  await db.update(jobs).set({ notes: merged }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  await logActivity(userId, jobId, "note", "Note added", text);
  return { notes: merged };
}

export async function setNotes(userId: string, jobId: string, notes: string) {
  await requireJob(userId, jobId);
  await db.update(jobs).set({ notes }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  await logActivity(userId, jobId, "note", "Notes updated", notes.slice(0, 500));
  return { notes };
}

export async function setFollowUpDate(userId: string, jobId: string, date: Date | null, note?: string | null) {
  await requireJob(userId, jobId);
  await db.update(jobs).set({ followUpDate: date }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (date) {
    await db.delete(followUps).where(and(eq(followUps.userId, userId), eq(followUps.jobId, jobId), eq(followUps.status, "pending"), sql`${followUps.outreachId} is null`));
    await db.insert(followUps).values({ userId, jobId, outreachId: null, dueAt: date, note: note ?? null });
    await logActivity(userId, jobId, "follow_up", `Follow-up scheduled for ${date.toISOString().slice(0, 10)}`, note ?? null);
  } else {
    await logActivity(userId, jobId, "follow_up", "Follow-up date cleared");
  }
  return { followUpDate: date };
}

export type InterviewInput = { date?: string; mode?: string; link?: string; notes?: string };
export async function setInterview(userId: string, jobId: string, interview: InterviewInput | null) {
  const job = await requireJob(userId, jobId);
  await db.update(jobs).set({ interview }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (interview) {
    await logActivity(userId, jobId, "interview", `Interview ${interview.date ? "on " + interview.date : "details saved"}`, [interview.mode, interview.link, interview.notes].filter(Boolean).join(" · ") || null, { ...interview });
    if (job.status !== "interview_scheduled" && !["selected", "rejected", "not_interested"].includes(job.status)) await setJobStatus(userId, jobId, "interview_scheduled", "Interview details added");
  }
  return { interview };
}

export async function getTimeline(userId: string, jobId: string, limit = 200) {
  await requireJob(userId, jobId);
  return db.select().from(activityLog).where(and(eq(activityLog.userId, userId), eq(activityLog.jobId, jobId))).orderBy(desc(activityLog.createdAt)).limit(limit);
}

export type PipelineFilters = { status?: string; q?: string; page?: number; pageSize?: number; all?: boolean };
/** Applications/tracker rows: every job that is shortlisted or beyond "discovered" (or all with filters). */
export async function listApplications(userId: string, f: PipelineFilters = {}) {
  const rows = await db.select({
    job: jobs, company: companies.name, score: jobMatches.score, application: applications,
  }).from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.userId, userId)))
    .where(and(eq(jobs.userId, userId), f.all ? undefined : sql`(${jobs.status} <> 'discovered' or ${jobs.shortlisted} = true)`))
    .orderBy(desc(jobs.updatedAt))
    .limit(1000);
  const ids = rows.map((r) => r.job.id);
  const outreach = ids.length ? await db.select({ jobId: emailOutreach.jobId, status: emailOutreach.status, toEmail: emailOutreach.toEmail, createdAt: emailOutreach.createdAt }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), inArray(emailOutreach.jobId, ids))).orderBy(desc(emailOutreach.createdAt)) : [];
  const recs = ids.length ? await db.select({ id: recruiters.id, jobId: recruiters.jobId, companyId: recruiters.companyId, name: recruiters.name, email: recruiters.email, verification: recruiters.verification }).from(recruiters).where(eq(recruiters.userId, userId)) : [];
  const fups = ids.length ? await db.select().from(followUps).where(and(eq(followUps.userId, userId), eq(followUps.status, "pending"), inArray(followUps.jobId, ids))).orderBy(followUps.dueAt) : [];
  const q = f.q?.trim().toLowerCase();
  let items = rows.map((r) => {
    const o = outreach.find((x) => x.jobId === r.job.id);
    const rec = recs.find((x) => x.jobId === r.job.id) ?? recs.find((x) => x.companyId === r.job.companyId);
    const fu = fups.find((x) => x.jobId === r.job.id);
    return {
      id: r.job.id, title: r.job.title, company: r.company, status: r.job.status as JobStatus, applyUrl: r.job.applyUrl, score: r.score ?? null,
      salaryMin: r.job.salaryMin, salaryMax: r.job.salaryMax, salaryCurrency: r.job.salaryCurrency, salaryText: r.job.salaryText,
      location: r.job.location, workMode: r.job.workMode,
      appliedAt: r.application?.appliedAt ?? null, applicationMethod: r.application?.method ?? null,
      recruiter: rec ? { id: rec.id, name: rec.name, email: rec.email, verification: rec.verification } : null,
      emailStatus: o?.status ?? null,
      followUpDate: fu?.dueAt ?? r.job.followUpDate ?? null,
      interview: r.job.interview ?? null, notes: r.job.notes, updatedAt: r.job.updatedAt,
    };
  });
  if (f.status) items = items.filter((i) => i.status === f.status);
  if (q) items = items.filter((i) => `${i.title} ${i.company}`.toLowerCase().includes(q));
  const total = items.length;
  if (f.page && f.pageSize) items = items.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
  return { items, total, page: f.page ?? 1, pageSize: f.pageSize ?? total };
}

/**
 * Sent email with no reply after N business days ⇒ job becomes follow_up_required and a pending follow-up exists.
 * Never sends anything.
 */
export async function detectFollowUps(userId: string, opts: { now?: Date; businessDays?: number } = {}) {
  const now = opts.now ?? new Date();
  const bd = opts.businessDays ?? (await getSettings(userId)).followUpBusinessDays;
  const sentRows = await db.select({ jobId: emailOutreach.jobId, sentAt: emailOutreach.sentAt }).from(emailOutreach)
    .innerJoin(jobs, eq(jobs.id, emailOutreach.jobId))
    .where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.status, "sent"), eq(jobs.status, "email_sent")));
  const sent = sentRows.filter((r): r is { jobId: string; sentAt: Date } => !!r.jobId && !!r.sentAt);
  if (!sent.length) return { flagged: [] as string[] };
  const replies = await db.select({ jobId: emailConversations.jobId, receivedAt: emailConversations.receivedAt, category: emailConversations.category }).from(emailConversations)
    .where(and(eq(emailConversations.userId, userId), inArray(emailConversations.jobId, sent.map((s) => s.jobId))));
  const flagged = detectFollowUpJobIds(sent, replies, now, bd);
  for (const jobId of flagged) {
    await setJobStatus(userId, jobId, "follow_up_required", `No reply after ${bd} business days`);
    const [pending] = await db.select().from(followUps).where(and(eq(followUps.userId, userId), eq(followUps.jobId, jobId), eq(followUps.status, "pending")));
    if (!pending) await scheduleFollowUp(userId, jobId, null, 0, `No reply after ${bd} business days`);
  }
  return { flagged };
}

export async function listFollowUps(userId: string, status: "pending" | "done" | "dismissed" | "all" = "pending") {
  const rows = await db.select({ f: followUps, title: jobs.title, company: companies.name, jobStatus: jobs.status }).from(followUps)
    .innerJoin(jobs, eq(jobs.id, followUps.jobId)).innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(followUps.userId, userId), status === "all" ? undefined : eq(followUps.status, status)))
    .orderBy(followUps.dueAt).limit(200);
  const now = new Date();
  return rows.map((r) => ({ id: r.f.id, jobId: r.f.jobId, title: r.title, company: r.company, jobStatus: r.jobStatus, dueAt: r.f.dueAt, status: r.f.status, note: r.f.note, overdue: r.f.status === "pending" && r.f.dueAt <= now }));
}

export async function resolveFollowUp(userId: string, id: string, status: "done" | "dismissed") {
  const [row] = await db.update(followUps).set({ status }).where(and(eq(followUps.id, id), eq(followUps.userId, userId))).returning();
  if (!row) throw new HttpError(404, "Follow-up not found");
  await logActivity(userId, row.jobId, "follow_up", `Follow-up ${status}`);
  return row;
}

export async function countFollowUpsDue(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(followUps).where(and(eq(followUps.userId, userId), eq(followUps.status, "pending"), gt(sql`now() + interval '1 day'`, followUps.dueAt)));
  return r?.n ?? 0;
}
