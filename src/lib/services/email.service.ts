import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateSkills, companies, emailOutreach, followUps, jobSkills, jobs, recruiters, skills, unsubscribes } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { generateStructured } from "@/lib/ai/llm";
import { EMAIL_SYSTEM, buildEmailPrompt, emailOutputSchema } from "@/lib/ai/prompts/email";
import { assembleEmail, findUnsupportedClaims, templateEmail, type EmailFacts, type EmailKind } from "@/lib/ai/heuristics/email-template";
import { logActivity, scheduleFollowUp } from "@/lib/services/activity.service";
import { setJobStatus } from "@/lib/services/application.service";
import { getProfile, getSettings } from "@/lib/services/profile.service";
import { getResume, getResumeFile, recommendResume } from "@/lib/services/resume.service";
import { getGmailClient, isGmailConnected, markIfAuthError } from "@/lib/services/gmail.service";
import { isEmailBlocked } from "@/lib/services/recruiter.service";
import { evaluateSendGate, isUniqueViolation, makeSentKey } from "@/lib/gmail/send-gate";
import { EMAIL_KINDS } from "@/lib/db/schema";
import type { OutgoingMail } from "@/lib/gmail/client";

export type Outreach = typeof emailOutreach.$inferSelect;
const RANK: Record<string, number> = { verified: 3, public: 2, inferred: 1, unknown: 0 };
const EMAIL_RE = /^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/;

async function requireOutreach(userId: string, id: string): Promise<Outreach> {
  const [o] = await db.select().from(emailOutreach).where(and(eq(emailOutreach.id, id), eq(emailOutreach.userId, userId)));
  if (!o) throw new HttpError(404, "Email not found");
  return o;
}

// ---------------- generation ----------------
export type GenerateInput = { jobId: string; kind: EmailKind; recruiterId?: string | null; resumeId?: string | null; extraInstructions?: string | null; /** force a fresh draft even if an unsent one exists */ regenerate?: boolean };

async function buildFacts(userId: string, jobId: string, recruiterId: string | null, resumeId: string | null, kind: EmailKind) {
  const [row] = await db.select({ job: jobs, company: companies }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!row) throw new HttpError(404, "Job not found");
  const profile = await getProfile(userId);
  const settings = await getSettings(userId);
  const cs = await db.select({ name: skills.name, level: candidateSkills.level }).from(candidateSkills).innerJoin(skills, eq(skills.id, candidateSkills.skillId)).where(eq(candidateSkills.userId, userId));
  const js = await db.select({ name: skills.name, required: jobSkills.required }).from(jobSkills).innerJoin(skills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId));

  let recruiter: typeof recruiters.$inferSelect | null = null;
  if (recruiterId) {
    [recruiter] = await db.select().from(recruiters).where(and(eq(recruiters.id, recruiterId), eq(recruiters.userId, userId)));
    if (!recruiter) throw new HttpError(404, "Contact not found");
  } else {
    const cands = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.companyId, row.company.id), eq(recruiters.doNotContact, false)));
    const ok: typeof cands = [];
    for (const c of cands) if (c.email && !(await isEmailBlocked(userId, c.email)).unsubscribed) ok.push(c);
    ok.sort((a, b) => (RANK[b.verification] ?? 0) - (RANK[a.verification] ?? 0) || Number(b.jobId === jobId) - Number(a.jobId === jobId));
    recruiter = ok[0] ?? null;
  }
  if (recruiter) {
    const b = await isEmailBlocked(userId, recruiter.email);
    if (recruiter.doNotContact || b.doNotContact || b.unsubscribed) throw new HttpError(409, "This contact is marked do-not-contact / unsubscribed; no email will be drafted for them.");
  }

  let resume: { id: string; name: string; filename: string; extractedText: string } | null = null;
  const rid = resumeId ?? (await recommendResume(userId, jobId));
  if (rid) { const r = await getResume(userId, rid); resume = { id: r.id, name: r.name, filename: r.filename, extractedText: r.extractedText }; }

  let followUp: EmailFacts["followUp"] = null;
  let threadId: string | null = null;
  if (kind === "follow_up") {
    const [prev] = await db.select().from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.jobId, jobId), eq(emailOutreach.status, "sent"))).orderBy(desc(emailOutreach.sentAt)).limit(1);
    if (!prev) throw new HttpError(409, "No sent email for this job yet, so there is nothing to follow up on.");
    followUp = { originalSubject: prev.subject, sentAt: prev.sentAt };
    threadId = prev.gmailThreadId;
    if (!recruiter && prev.toEmail) { [recruiter] = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), sql`lower(${recruiters.email}) = ${prev.toEmail.toLowerCase()}`)).limit(1) ?? [null]; }
  }
  const p = profile;
  const facts: EmailFacts = {
    candidate: {
      fullName: p?.fullName ?? null, headline: p?.headline ?? null, currentTitle: p?.currentTitle ?? null, currentCompany: p?.currentCompany ?? null, yearsExperience: p?.yearsExperience ?? null,
      education: p?.education ?? null, graduationYear: p?.graduationYear ?? null, phone: p?.phone ?? null, email: null, location: p?.location ?? null,
      skills: [...new Set(cs.map((s) => s.name))], projects: (p?.projects ?? []).map((x) => ({ name: x.name, description: x.description, url: x.url })),
      portfolioUrl: p?.portfolioUrl ?? null, linkedinUrl: p?.linkedinUrl ?? null, githubUrl: p?.githubUrl ?? null,
    },
    job: { title: row.job.title, company: row.company.name, location: row.job.location, workMode: row.job.workMode, requiredSkills: js.filter((s) => s.required).map((s) => s.name), applyUrl: row.job.applyUrl },
    recruiter: recruiter ? { name: recruiter.name, designation: recruiter.designation } : null,
    resume: resume ? { name: resume.name, filename: resume.filename } : null,
    followUp, footer: settings.unsubscribeFooter,
  };
  return { facts, recruiter, resume, job: row.job, threadId, settings };
}

/** Generates an email draft (LLM with strict anti-fabrication prompt + audit; deterministic template fallback). Never sends. */
export async function generateEmail(userId: string, input: GenerateInput): Promise<Outreach> {
  if (!(EMAIL_KINDS as readonly string[]).includes(input.kind)) throw new HttpError(400, `Unknown email kind "${input.kind}"`);
  const { facts, recruiter, resume, job, threadId } = await buildFacts(userId, input.jobId, input.recruiterId ?? null, input.resumeId ?? null, input.kind);

  if (!input.regenerate && !input.extraInstructions) {
    const [ex] = await db.select().from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.jobId, input.jobId), eq(emailOutreach.kind, input.kind), inArray(emailOutreach.status, ["draft", "gmail_draft_created"]), recruiter ? eq(emailOutreach.recruiterId, recruiter.id) : sql`${emailOutreach.recruiterId} is null`)).orderBy(desc(emailOutreach.createdAt)).limit(1);
    if (ex) return ex; // idempotent: don't pile up duplicate drafts
  }

  let draft = templateEmail(input.kind, facts), engine: "llm" | "template" = "template", model: string | null = null;
  try {
    const resumeText = resume?.extractedText ?? null;
    const { data, model: m } = await generateStructured(userId, { system: EMAIL_SYSTEM, prompt: buildEmailPrompt(input.kind, facts, resumeText, input.extraInstructions), schema: emailOutputSchema });
    const issues = findUnsupportedClaims(`${data.subject}\n${data.body}`, facts, [recruiter?.email ?? "", ...(resumeText ? [...resumeText.matchAll(/(\d+(?:\.\d+)?\s*\+?\s*(?:years?|yrs?))/gi)].map((x) => x[0]) : [])]);
    if (!issues.length) { draft = assembleEmail({ subject: data.subject, body: data.body }, facts); engine = "llm"; model = m; }
    else console.warn("[email] LLM output rejected by audit:", issues.join("; "));
  } catch { /* LlmNotConfigured or provider error => labelled template fallback */ }

  const [row] = await db.insert(emailOutreach).values({
    userId, jobId: input.jobId, recruiterId: recruiter?.id ?? null, resumeId: resume?.id ?? null, kind: input.kind, subject: draft.subject, body: draft.body,
    toEmail: recruiter?.email ?? null, toName: recruiter?.name ?? null, status: "draft", engine, model, gmailThreadId: threadId,
  }).returning();
  await logActivity(userId, input.jobId, "email_draft", `Email drafted (${input.kind.replace(/_/g, " ")})`, draft.subject, { outreachId: row.id, engine });
  if (input.kind !== "follow_up" && ["discovered", "shortlisted", "ready_to_apply"].includes(job.status)) { try { await setJobStatus(userId, input.jobId, "cold_email_drafted", "Email draft created"); } catch { /* ignore */ } }
  return row;
}

// ---------------- CRUD ----------------
export async function listOutreach(userId: string, f: { status?: string; jobId?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, f.page ?? 1), pageSize = Math.min(100, f.pageSize ?? 25);
  const where = and(eq(emailOutreach.userId, userId), f.status ? eq(emailOutreach.status, f.status) : undefined, f.jobId ? eq(emailOutreach.jobId, f.jobId) : undefined);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(emailOutreach).where(where);
  const items = await db.select({ o: emailOutreach, jobTitle: jobs.title, companyName: companies.name, verification: recruiters.verification, doNotContact: recruiters.doNotContact })
    .from(emailOutreach).leftJoin(jobs, eq(jobs.id, emailOutreach.jobId)).leftJoin(companies, eq(companies.id, jobs.companyId)).leftJoin(recruiters, eq(recruiters.id, emailOutreach.recruiterId))
    .where(where).orderBy(desc(emailOutreach.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items: items.map((x) => ({ ...x.o, jobTitle: x.jobTitle, companyName: x.companyName, recipientVerification: x.verification, doNotContact: x.doNotContact })), total: n, page, pageSize };
}

export async function getOutreach(userId: string, id: string) {
  const o = await requireOutreach(userId, id);
  const [j] = o.jobId ? await db.select({ title: jobs.title, company: companies.name }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(eq(jobs.id, o.jobId)) : [];
  const [rc] = o.recruiterId ? await db.select().from(recruiters).where(eq(recruiters.id, o.recruiterId)) : [];
  const blocked = await isEmailBlocked(userId, o.toEmail);
  const reminders: string[] = [];
  if (!o.resumeId) reminders.push("No resume is attached to this email. Select a resume or attach one manually in Gmail before sending.");
  if (!o.toEmail) reminders.push("Add a recipient email before approving.");
  if (rc && rc.verification !== "verified") reminders.push(`Recipient address is "${rc.verification}" (not provider-verified).`);
  return { ...o, jobTitle: j?.title ?? null, companyName: j?.company ?? null, recruiter: rc ?? null, blocked, reminders };
}

export async function updateOutreach(userId: string, id: string, patch: { subject?: string; body?: string; toEmail?: string | null; toName?: string | null }) {
  const o = await requireOutreach(userId, id);
  if (o.status === "sent") throw new HttpError(409, "A sent email cannot be edited");
  const set: Partial<typeof emailOutreach.$inferInsert> = {};
  let changed = false;
  if (patch.subject !== undefined && patch.subject !== o.subject) { set.subject = patch.subject.replace(/[\r\n]+/g, " ").trim(); changed = true; }
  if (patch.body !== undefined && patch.body !== o.body) { set.body = patch.body; changed = true; }
  if (patch.toEmail !== undefined) {
    const e = patch.toEmail?.trim().toLowerCase() || null;
    if (e && !EMAIL_RE.test(e)) throw new HttpError(400, "Invalid recipient email");
    if (e !== (o.toEmail?.toLowerCase() ?? null)) { set.toEmail = e; changed = true; if (e) { const [r] = await db.select({ id: recruiters.id }).from(recruiters).where(and(eq(recruiters.userId, userId), sql`lower(${recruiters.email}) = ${e}`)).limit(1); set.recruiterId = r?.id ?? null; } else set.recruiterId = null; }
  }
  if (patch.toName !== undefined) set.toName = patch.toName;
  // Any content change invalidates a prior approval / Gmail draft: what is approved must be exactly what is sent.
  if (changed) { set.status = "draft"; set.approvedAt = null; set.gmailDraftId = null; set.error = null; }
  if (!Object.keys(set).length) return o;
  const [row] = await db.update(emailOutreach).set(set).where(and(eq(emailOutreach.id, id), eq(emailOutreach.userId, userId))).returning();
  return row;
}

export async function deleteOutreach(userId: string, id: string) {
  const o = await requireOutreach(userId, id);
  if (o.status === "sent") throw new HttpError(409, "Sent emails are kept as history and cannot be deleted");
  await db.delete(emailOutreach).where(and(eq(emailOutreach.id, id), eq(emailOutreach.userId, userId)));
  return { deleted: true };
}

// ---------------- gmail draft / approve / send ----------------
async function toMail(userId: string, o: Outreach): Promise<OutgoingMail> {
  if (!o.toEmail) throw new HttpError(400, "No recipient email on this outreach");
  const mail: OutgoingMail = { to: o.toEmail, subject: o.subject, body: o.body, threadId: o.gmailThreadId };
  if (o.resumeId) {
    const f = await getResumeFile(userId, o.resumeId).catch(() => null);
    if (f) mail.attachments = [{ filename: f.filename, mimeType: f.mimeType, data: Buffer.from(f.fileData) }];
  }
  return mail;
}

/** Creates a Gmail DRAFT (gmail.compose). Never sends. */
export async function createGmailDraft(userId: string, id: string) {
  const o = await requireOutreach(userId, id);
  if (o.status === "sent") throw new HttpError(409, "Already sent");
  const b = await isEmailBlocked(userId, o.toEmail);
  if (b.unsubscribed || b.doNotContact) throw new HttpError(403, "Recipient is unsubscribed / do-not-contact");
  const client = await getGmailClient(userId);
  if (!client) throw new HttpError(409, "Connect Gmail in Settings first");
  try {
    const d = await client.createDraft(await toMail(userId, o));
    const [row] = await db.update(emailOutreach).set({ gmailDraftId: d.draftId, status: o.status === "approved" ? "approved" : "gmail_draft_created", error: null }).where(eq(emailOutreach.id, id)).returning();
    await logActivity(userId, o.jobId, "email_draft", "Gmail draft created", o.subject, { outreachId: id, draftId: d.draftId });
    return row;
  } catch (e) { if (e instanceof HttpError) throw e; await markIfAuthError(userId, e); throw new HttpError(502, `Gmail draft failed: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`); }
}

/** Step 1 of 2: explicit per-email approval. */
export async function approveOutreach(userId: string, id: string, confirm: unknown) {
  if (confirm !== true) throw new HttpError(400, "Approval requires {confirm:true}");
  const o = await requireOutreach(userId, id);
  if (o.status === "sent") throw new HttpError(409, "Already sent");
  if (!o.toEmail) throw new HttpError(400, "Add a recipient email before approving");
  const b = await isEmailBlocked(userId, o.toEmail);
  if (b.unsubscribed) throw new HttpError(403, "Recipient has unsubscribed");
  if (b.doNotContact) throw new HttpError(403, "Contact is marked do-not-contact");
  const [row] = await db.update(emailOutreach).set({ status: "approved", approvedAt: new Date(), error: null }).where(and(eq(emailOutreach.id, id), eq(emailOutreach.userId, userId))).returning();
  return row;
}

/**
 * Step 2 of 2: the ONLY code path that sends mail. Requires status "approved" + {confirm:true} + Gmail connected + recipient not
 * unsubscribed/do-not-contact. Duplicate protection is enforced by the DB unique index on (user_id, sent_key): the key is claimed
 * atomically BEFORE calling Gmail (so concurrent double-clicks cannot both send) and released if Gmail fails.
 */
export async function sendOutreach(userId: string, id: string, confirm: unknown) {
  const o = await requireOutreach(userId, id);
  const blocked = await isEmailBlocked(userId, o.toEmail);
  const sentKey = o.toEmail ? makeSentKey(o.jobId, o.kind, o.toEmail) : null;
  const dup = sentKey ? (await db.select({ id: emailOutreach.id }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.sentKey, sentKey), ne(emailOutreach.id, id))).limit(1)).length > 0 : false;
  const gate = evaluateSendGate({ status: o.status, confirm, gmailConnected: await isGmailConnected(userId), toEmail: o.toEmail, unsubscribed: blocked.unsubscribed, doNotContact: blocked.doNotContact, duplicateExists: dup, jobId: o.jobId, kind: o.kind });
  if (!gate.ok) throw new HttpError(gate.httpStatus, gate.message, { code: gate.code });

  const client = await getGmailClient(userId); // resolved BEFORE claiming so a setup failure can never leave a claimed key behind
  if (!client) throw new HttpError(409, "Connect Gmail in Settings before sending", { code: "gmail_not_connected" });

  // Atomic claim (status must still be "approved" and no key yet).
  let claimed: Outreach[];
  try {
    claimed = await db.update(emailOutreach).set({ sentKey: gate.sentKey }).where(and(eq(emailOutreach.id, id), eq(emailOutreach.userId, userId), eq(emailOutreach.status, "approved"), sql`${emailOutreach.sentKey} is null`)).returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "An email of this kind was already sent to this recipient for this job", { code: "duplicate" });
    throw e;
  }
  if (!claimed.length) throw new HttpError(409, "This email is already being sent or was sent", { code: "duplicate" });

  let sent: { messageId: string; threadId: string | null };
  try { sent = await client.send(await toMail(userId, o)); }
  catch (e) {
    const m = e instanceof Error ? e.message.slice(0, 300) : "send failed";
    await release(id, m); await markIfAuthError(userId, e);
    throw new HttpError(502, `Gmail send failed: ${m}`);
  }
  const [row] = await db.update(emailOutreach).set({ status: "sent", sentAt: new Date(), gmailMessageId: sent.messageId, gmailThreadId: sent.threadId ?? o.gmailThreadId, error: null }).where(eq(emailOutreach.id, id)).returning();
  if (o.jobId) {
    await logActivity(userId, o.jobId, "email_sent", `Email sent to ${o.toEmail}`, o.subject, { outreachId: id, kind: o.kind });
    try { await setJobStatus(userId, o.jobId, "email_sent", `Sent "${o.subject}"`); } catch { /* e.g. already in a later stage */ }
    if (o.kind === "follow_up") await db.update(followUps).set({ status: "done" }).where(and(eq(followUps.userId, userId), eq(followUps.jobId, o.jobId), eq(followUps.status, "pending")));
    else { const s = await getSettings(userId); await scheduleFollowUp(userId, o.jobId, id, s.followUpBusinessDays, `Follow up on "${o.subject}"`); }
  }
  return row;
}
async function release(id: string, error: string) {
  await db.update(emailOutreach).set({ sentKey: null, status: "failed", error }).where(eq(emailOutreach.id, id));
}

// ---------------- follow-ups & unsubscribes ----------------
export async function listOutreachFollowUps(userId: string) {
  const rows = await db.select({ f: followUps, jobTitle: jobs.title, companyName: companies.name, subject: emailOutreach.subject, toEmail: emailOutreach.toEmail })
    .from(followUps).innerJoin(jobs, eq(jobs.id, followUps.jobId)).innerJoin(companies, eq(companies.id, jobs.companyId)).leftJoin(emailOutreach, eq(emailOutreach.id, followUps.outreachId))
    .where(and(eq(followUps.userId, userId), eq(followUps.status, "pending"))).orderBy(followUps.dueAt);
  return rows.map((r) => ({ ...r.f, jobTitle: r.jobTitle, companyName: r.companyName, subject: r.subject, toEmail: r.toEmail, overdue: r.f.dueAt < new Date() }));
}

export async function listUnsubscribes(userId: string) {
  return db.select().from(unsubscribes).where(eq(unsubscribes.userId, userId)).orderBy(desc(unsubscribes.createdAt));
}
/** Adds to the suppression list and flags matching contacts do_not_contact. */
export async function addUnsubscribe(userId: string, email: string, reason?: string | null) {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, "Invalid email");
  const [row] = await db.insert(unsubscribes).values({ userId, email: e, reason: reason ?? null }).onConflictDoUpdate({ target: [unsubscribes.userId, unsubscribes.email], set: { reason: reason ?? null } }).returning();
  await db.update(recruiters).set({ doNotContact: true }).where(and(eq(recruiters.userId, userId), sql`lower(${recruiters.email}) = ${e}`));
  return row;
}
export async function removeUnsubscribe(userId: string, id: string) {
  const [r] = await db.delete(unsubscribes).where(and(eq(unsubscribes.id, id), eq(unsubscribes.userId, userId))).returning();
  if (!r) throw new HttpError(404, "Not found");
  return { deleted: true }; // contacts stay flagged do-not-contact until the user clears the flag explicitly
}
