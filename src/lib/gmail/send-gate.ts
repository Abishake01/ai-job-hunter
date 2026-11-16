/** Pure send-gate logic. The ONLY path to an actual send must pass through `evaluateSendGate`. */

export type SendGateInput = {
  status: string;
  /** Must be literally `true`; truthy strings etc. do not count. */
  confirm: unknown;
  gmailConnected: boolean;
  toEmail: string | null;
  unsubscribed: boolean;
  doNotContact: boolean;
  /** Another outreach row already holds this sentKey (sent or being sent). */
  duplicateExists: boolean;
  jobId: string | null;
  kind: string;
};
export type SendGateResult =
  | { ok: true; sentKey: string }
  | { ok: false; httpStatus: number; code: "not_approved" | "no_confirm" | "gmail_not_connected" | "no_recipient" | "unsubscribed" | "do_not_contact" | "duplicate"; message: string };

export function makeSentKey(jobId: string | null, kind: string, toEmail: string): string {
  return `${jobId ?? "none"}|${kind}|${toEmail.trim().toLowerCase()}`;
}

export function evaluateSendGate(i: SendGateInput): SendGateResult {
  const fail = (httpStatus: number, code: Extract<SendGateResult, { ok: false }>["code"], message: string): SendGateResult => ({ ok: false, httpStatus, code, message });
  if (i.status === "sent") return fail(409, "duplicate", "This email was already sent");
  if (i.status !== "approved") return fail(409, "not_approved", "Email must be approved before sending");
  if (i.confirm !== true) return fail(400, "no_confirm", "Explicit confirmation required: send with {confirm:true}");
  if (!i.toEmail) return fail(400, "no_recipient", "No recipient email on this outreach");
  if (i.unsubscribed) return fail(403, "unsubscribed", "Recipient has unsubscribed; sending is blocked");
  if (i.doNotContact) return fail(403, "do_not_contact", "Contact is marked do-not-contact; sending is blocked");
  if (!i.gmailConnected) return fail(409, "gmail_not_connected", "Connect Gmail in Settings before sending");
  if (i.duplicateExists) return fail(409, "duplicate", "An email of this kind was already sent to this recipient for this job");
  return { ok: true, sentKey: makeSentKey(i.jobId, i.kind, i.toEmail) };
}

/** Postgres unique violation (23505) across pg / neon driver error shapes. */
export function isUniqueViolation(e: unknown): boolean {
  const x = e as { code?: string; cause?: { code?: string; message?: string }; message?: string } | null;
  return x?.code === "23505" || x?.cause?.code === "23505" || /duplicate key value|unique constraint/i.test(`${x?.message ?? ""} ${x?.cause?.message ?? ""}`);
}
