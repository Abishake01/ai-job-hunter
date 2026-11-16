"use client";
import * as React from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, qs } from "@/lib/utils/fetcher";
import { copyText, EmailStatusBadge, KIND_LABELS, selectCls, VerificationBadge, type OutreachRow } from "./shared";

type Contact = { id: string; name: string | null; email: string | null; designation: string | null; verification: string; doNotContact: boolean };
type Resume = { id: string; name: string; isDefault: boolean };
const KINDS = Object.keys(KIND_LABELS);

export function GenerateEmailDialog({ jobId, open, onOpenChange, defaultKind = "direct_application" }: { jobId: string; open: boolean; onOpenChange: (o: boolean) => void; defaultKind?: string }) {
  const [kind, setKind] = React.useState(defaultKind);
  const [recruiterId, setRecruiterId] = React.useState("");
  const [resumeId, setResumeId] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [resumes, setResumes] = React.useState<Resume[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState<OutreachRow | null>(null);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKind(defaultKind); setDraft(null); setExtra(""); setRecruiterId(""); setResumeId("");
    // `jobId` filter returns every contact at the job's company
    api<{ items: Contact[] }>(`/api/recruiters${qs({ jobId, pageSize: 50 })}`).then((r) => setContacts(r.items.filter((c) => !c.doNotContact))).catch(() => setContacts([]));
    api<{ items: Resume[] }>("/api/resumes").then((r) => setResumes(r.items ?? [])).catch(() => setResumes([]));
  }, [open, jobId, defaultKind]);

  async function generate(regenerate = false) {
    setBusy(true);
    try {
      const { outreach } = await api<{ outreach: OutreachRow }>("/api/outreach/generate", { method: "POST", json: { jobId, kind, recruiterId: recruiterId || null, resumeId: resumeId || null, extraInstructions: extra || null, regenerate } });
      setDraft(outreach); setSubject(outreach.subject); setBody(outreach.body);
      toast.success(outreach.engine === "llm" ? "Draft generated with your AI provider" : "Draft generated from a template (no AI provider configured or output rejected)");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!draft) return;
    setSaving(true);
    try { const { outreach } = await api<{ outreach: OutreachRow }>(`/api/outreach/${draft.id}`, { method: "PATCH", json: { subject, body } }); setDraft({ ...draft, ...outreach }); toast.success("Saved"); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  async function gmailDraft() {
    if (!draft) return;
    try { await save(); const { outreach } = await api<{ outreach: OutreachRow }>(`/api/outreach/${draft.id}/gmail-draft`, { method: "POST" }); setDraft({ ...draft, ...outreach }); toast.success("Draft created in your Gmail (not sent)"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate email</DialogTitle>
          <DialogDescription>Creates a draft only. Nothing is sent until you approve and confirm on the Email Outreach page.</DialogDescription>
        </DialogHeader>
        {!draft ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Type</Label><select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></div>
            <div className="grid gap-1.5"><Label>Recipient</Label>
              <select className={selectCls} value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}>
                <option value="">Best available contact for this company</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{(c.name ?? "Unnamed") + (c.email ? ` <${c.email}>` : " (no email)")} [{c.verification}]</option>)}
              </select>
              <p className="text-xs text-muted-foreground">No contacts yet? Use Find HR on the job first. Without a recipient, the draft has no address until you add one.</p>
            </div>
            <div className="grid gap-1.5"><Label>Resume to attach</Label>
              <select className={selectCls} value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                <option value="">Recommended for this job</option>
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isDefault ? " (default)" : ""}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="extra">Extra instructions (optional)</Label><Input id="extra" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={500} placeholder="e.g. keep it under 100 words" /></div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <EmailStatusBadge status={draft.status} />
              <span className="text-muted-foreground">To:</span><span>{draft.toEmail ?? "no recipient yet"}</span><VerificationBadge value={draft.recipientVerification} />
              <span className="ml-auto text-xs text-muted-foreground">{draft.engine === "llm" ? `AI draft (${draft.model})` : "Template draft"}</span>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="subj">Subject</Label><Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="body">Body</Label><Textarea id="body" className="min-h-64" value={body} onChange={(e) => setBody(e.target.value)} /></div>
            {!draft.resumeId && <p className="text-xs text-amber-600 dark:text-amber-400">Reminder: no resume is attached. Select one and regenerate, or attach it manually in Gmail.</p>}
            {!draft.toEmail && <p className="text-xs text-amber-600 dark:text-amber-400">Add a recipient on the Email Outreach page before approving.</p>}
          </div>
        )}
        <DialogFooter showCloseButton={false}>
          {!draft ? (
            <><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => generate(false)} disabled={busy}><Sparkles /> {busy ? "Generating…" : "Generate draft"}</Button></>
          ) : (
            <>
              <Button variant="outline" onClick={async () => { if (await copyText(`Subject: ${subject}\n\n${body}`)) toast.success("Copied"); else toast.error("Copy failed"); }}>Copy</Button>
              <Button variant="outline" onClick={() => generate(true)} disabled={busy}>Regenerate</Button>
              <Button variant="outline" onClick={gmailDraft} disabled={saving || !draft.toEmail}>Create Gmail draft</Button>
              <Button onClick={save} disabled={saving}>Save</Button>
              <Button variant="secondary" nativeButton={false} render={<a href="/outreach" />}>Open in Outreach</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
