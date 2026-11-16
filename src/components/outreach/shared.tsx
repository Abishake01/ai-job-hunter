"use client";
import { Badge } from "@/components/ui/badge";

export const KIND_LABELS: Record<string, string> = {
  direct_application: "Direct application", recruiter_outreach: "Recruiter outreach", hiring_manager_intro: "Hiring manager intro", follow_up: "Follow-up", general_inquiry: "General inquiry",
};
export const EMAIL_STATUS_LABELS: Record<string, string> = { draft: "Draft", gmail_draft_created: "Gmail draft", approved: "Approved", sent: "Sent", failed: "Failed" };
const VERIFY_HELP: Record<string, string> = {
  verified: "Deliverable according to your email-verification provider",
  public: "Found on a public page (not provider-verified)",
  inferred: "Guessed from a public email pattern: unverified",
  unknown: "Source not independently verified",
};

export function VerificationBadge({ value }: { value: string | null | undefined }) {
  const v = value ?? "unknown";
  const variant = v === "verified" ? "default" : v === "public" ? "secondary" : v === "inferred" ? "outline" : "outline";
  return <Badge variant={variant} title={VERIFY_HELP[v]} className={v === "inferred" ? "border-amber-500/50 text-amber-700 dark:text-amber-400" : undefined}>{v}</Badge>;
}

export function EmailStatusBadge({ status }: { status: string }) {
  const variant = status === "sent" ? "default" : status === "failed" ? "destructive" : status === "approved" ? "secondary" : "outline";
  return <Badge variant={variant}>{EMAIL_STATUS_LABELS[status] ?? status}</Badge>;
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const selectCls = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export type OutreachRow = {
  id: string; jobId: string | null; recruiterId: string | null; resumeId: string | null; kind: string; subject: string; body: string; toEmail: string | null; toName: string | null;
  status: string; engine: string; model: string | null; gmailDraftId: string | null; approvedAt: string | null; sentAt: string | null; error: string | null; createdAt: string;
  jobTitle?: string | null; companyName?: string | null; recipientVerification?: string | null; doNotContact?: boolean | null;
  reminders?: string[]; blocked?: { unsubscribed: boolean; doNotContact: boolean };
};
