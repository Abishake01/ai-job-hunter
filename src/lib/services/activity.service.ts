import "server-only";
import { db } from "@/lib/db";
import { activityLog, followUps } from "@/lib/db/schema";
import { addBusinessDays } from "@/lib/utils/business-days";

export type ActivityKind = "discovered" | "status" | "match" | "contact" | "email_draft" | "email_sent" | "email_received" | "applied" | "note" | "interview" | "follow_up" | "auto_apply" | "auto_apply_skipped";

/** Append to the per-job interaction timeline. Safe to call from any service. */
export async function logActivity(userId: string, jobId: string | null, kind: ActivityKind, title: string, detail?: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(activityLog).values({ userId, jobId, kind, title, detail: detail ?? null, meta });
}

/** Creates a pending follow-up `businessDays` business days from now. */
export async function scheduleFollowUp(userId: string, jobId: string, outreachId: string | null, businessDays: number, note?: string) {
  const dueAt = addBusinessDays(new Date(), businessDays);
  const [row] = await db.insert(followUps).values({ userId, jobId, outreachId, dueAt, note: note ?? null }).returning();
  return row;
}
