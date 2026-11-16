import { JOB_STATUSES, type JobStatus } from "@/lib/db/schema";
import { businessDaysBetween } from "@/lib/utils/business-days";

export const TERMINAL_STATUSES: JobStatus[] = ["selected", "rejected", "not_interested"];
/** Statuses from which a job may be marked "selected" (an offer only makes sense after engagement). */
const SELECTABLE_FROM: JobStatus[] = ["applied", "email_sent", "follow_up_required", "interview_scheduled", "rejected", "selected"];

export function isJobStatus(s: unknown): s is JobStatus {
  return typeof s === "string" && (JOB_STATUSES as readonly string[]).includes(s);
}

export type TransitionResult = { ok: true; noop: boolean } | { ok: false; reason: string };

/**
 * Validates a pipeline status change. Rules:
 *  - target must be a known status;
 *  - same status is a no-op (ok, noop=true);
 *  - "selected" requires the job to have been engaged (applied / emailed / interviewing);
 *  - "interview_scheduled" and "follow_up_required" cannot be set on a job that was never touched
 *    (still "discovered") — but Gmail-detected invites may skip, so interview_scheduled is allowed from anywhere;
 *  - "follow_up_required" requires an engaged job (applied or email_sent) or interview stage.
 *  - Reopening a terminal job (rejected/not_interested → anything non-terminal) is allowed.
 */
export function validateTransition(from: string, to: string): TransitionResult {
  if (!isJobStatus(to)) return { ok: false, reason: `Unknown status "${to}"` };
  if (!isJobStatus(from)) return { ok: false, reason: `Job has an unknown current status "${from}"` };
  if (from === to) return { ok: true, noop: true };
  if (to === "selected" && !SELECTABLE_FROM.includes(from)) return { ok: false, reason: `Cannot mark as Selected from "${from}" — apply or contact the company first` };
  if (to === "follow_up_required" && !["applied", "email_sent", "interview_scheduled", "cold_email_drafted"].includes(from)) {
    return { ok: false, reason: `Follow-up is only meaningful after applying or sending an email (current: "${from}")` };
  }
  return { ok: true, noop: false };
}

export const REPLY_CATEGORIES = ["recruiter_message", "interview_invite", "rejection", "selection", "follow_up"] as const;

export type SentEmail = { jobId: string; sentAt: Date };
export type Reply = { jobId: string | null; receivedAt: Date | null; category: string };

/** A sent email needs a follow-up when `businessDays` business days passed with no reply received after it. */
export function needsFollowUp(sent: SentEmail, replies: Reply[], now: Date, businessDays: number): boolean {
  if (businessDaysBetween(sent.sentAt, now) < businessDays) return false;
  return !replies.some((r) => r.jobId === sent.jobId && (REPLY_CATEGORIES as readonly string[]).includes(r.category) && r.receivedAt && r.receivedAt > sent.sentAt);
}

/** Returns the job ids that need follow-up (one per job, dedupes multiple sent emails). */
export function detectFollowUpJobIds(sent: SentEmail[], replies: Reply[], now: Date, businessDays: number): string[] {
  const latest = new Map<string, SentEmail>();
  for (const s of sent) { const cur = latest.get(s.jobId); if (!cur || s.sentAt > cur.sentAt) latest.set(s.jobId, s); }
  return [...latest.values()].filter((s) => needsFollowUp(s, replies, now, businessDays)).map((s) => s.jobId);
}

export const STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered", shortlisted: "Shortlisted", ready_to_apply: "Ready to Apply", applied: "Applied", cold_email_drafted: "Cold Email Drafted",
  email_sent: "Email Sent", follow_up_required: "Follow-up Required", interview_scheduled: "Interview Scheduled", selected: "Selected", rejected: "Rejected", not_interested: "Not Interested",
};
