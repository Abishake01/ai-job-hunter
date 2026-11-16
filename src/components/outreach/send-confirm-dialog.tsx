"use client";
import * as React from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/utils/fetcher";
import { VerificationBadge, type OutreachRow } from "./shared";

/**
 * Two-step safety flow: (1) "Approve" marks the exact subject/body as approved, (2) this modal shows the final recipient and
 * content and only sends after an explicit click that posts {confirm:true}. Editing after approval resets approval server-side.
 */
export function SendConfirmDialog({ outreach, open, onOpenChange, onDone }: { outreach: OutreachRow | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [step, setStep] = React.useState<"approve" | "send">("approve");
  const [busy, setBusy] = React.useState(false);
  const [understood, setUnderstood] = React.useState(false);
  React.useEffect(() => { if (open) { setStep(outreach?.status === "approved" ? "send" : "approve"); setUnderstood(false); } }, [open, outreach?.id, outreach?.status]);
  if (!outreach) return null;

  async function approve() {
    setBusy(true);
    try { await api(`/api/outreach/${outreach!.id}/approve`, { method: "POST", json: { confirm: true } }); toast.success("Approved. Nothing has been sent yet."); setStep("send"); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function send() {
    setBusy(true);
    try { await api(`/api/outreach/${outreach!.id}/send`, { method: "POST", json: { confirm: true } }); toast.success(`Email sent to ${outreach!.toEmail}`); onDone(); onOpenChange(false); }
    catch (e) { toast.error((e as Error).message); onDone(); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === "approve" ? "Step 1 of 2: Approve this email" : "Step 2 of 2: Send this email"}</DialogTitle>
          <DialogDescription>{step === "approve" ? "Approving does not send anything. You will confirm once more before it is sent." : "This sends one email from your connected Gmail account right now. It cannot be undone."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">To:</span><span className="font-medium">{outreach.toName ? `${outreach.toName} <${outreach.toEmail}>` : outreach.toEmail ?? "No recipient"}</span><VerificationBadge value={outreach.recipientVerification} /></div>
          <div><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{outreach.subject}</span></div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs">{outreach.body}</pre>
          {outreach.resumeId ? <p className="text-xs text-muted-foreground">Your selected resume will be attached.</p> : <p className="text-xs text-amber-600 dark:text-amber-400">No resume attached.</p>}
        </div>
        {step === "send" && (
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> I have reviewed the recipient and content and want to send this email now.</label>
        )}
        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {step === "approve" ? <Button onClick={approve} disabled={busy || !outreach.toEmail}>Approve</Button> : <Button onClick={send} disabled={busy || !understood}><Send /> Send email</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
