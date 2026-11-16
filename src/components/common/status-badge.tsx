import { Badge } from "@/components/ui/badge";
export const STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered", shortlisted: "Shortlisted", ready_to_apply: "Ready to Apply", applied: "Applied", cold_email_drafted: "Cold Email Drafted",
  email_sent: "Email Sent", follow_up_required: "Follow-up Required", interview_scheduled: "Interview Scheduled", selected: "Selected", rejected: "Rejected", not_interested: "Not Interested",
};
export function StatusBadge({ status }: { status: string }) {
  const v = status === "selected" ? "default" : status === "rejected" || status === "not_interested" ? "destructive" : "secondary";
  return <Badge variant={v}>{STATUS_LABELS[status] ?? status}</Badge>;
}
