"use client";
import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, FileText, Mail, Save, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { api, qs } from "@/lib/utils/fetcher";
import { copyText, EmailStatusBadge, KIND_LABELS, VerificationBadge, type OutreachRow } from "./shared";
import { SendConfirmDialog } from "./send-confirm-dialog";

type List = { items: OutreachRow[]; total: number; page: number; pageSize: number };
type FollowUp = { id: string; jobId: string; jobTitle: string; companyName: string; subject: string | null; toEmail: string | null; dueAt: string; overdue: boolean };
const TABS = [["all", "All"], ["draft", "Drafts"], ["gmail_draft_created", "Gmail drafts"], ["approved", "Approved"], ["sent", "Sent"], ["failed", "Failed"], ["followups", "Follow-ups"]] as const;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "");

export function OutreachClient() {
  const [tab, setTab] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<List | null>(null);
  const [followUps, setFollowUps] = React.useState<FollowUp[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      if (tab === "followups") setFollowUps((await api<{ items: FollowUp[] }>("/api/outreach/follow-ups")).items);
      else setData(await api<List>(`/api/outreach${qs({ status: tab === "all" ? "" : tab, page, pageSize: 20 })}`));
    } catch (e) { setError((e as Error).message); }
  }, [tab, page]);
  React.useEffect(() => { setData(null); void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => { setTab(String(v)); setPage(1); setOpenId(null); }}>
        <TabsList className="flex-wrap">{TABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>
      </Tabs>
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error} <Button size="sm" variant="outline" className="ml-2" onClick={load}>Retry</Button></div>}

      {tab === "followups" ? (
        followUps === null ? <Skeleton className="h-24 w-full" /> : followUps.length === 0 ? <EmptyState icon={Mail} title="No pending follow-ups" description="Follow-ups are scheduled automatically a few business days after you send an email." /> : (
          <div className="space-y-2">{followUps.map((f) => (
            <Card key={f.id}><CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div><p className="font-medium">{f.jobTitle} · {f.companyName}</p><p className="text-muted-foreground">{f.subject ?? "Email"} → {f.toEmail ?? "unknown"}</p></div>
              <div className="flex items-center gap-2"><Badge variant={f.overdue ? "destructive" : "secondary"}>{f.overdue ? "Overdue" : "Due"} {new Date(f.dueAt).toLocaleDateString()}</Badge>
                <FollowUpButton jobId={f.jobId} onDone={load} /></div>
            </CardContent></Card>))}</div>
        )
      ) : data === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Mail} title="No emails here yet" description="Generate a draft from a job card (Generate Email). Drafts are never sent without your approval." />
      ) : (
        <>
          <div className="space-y-2">{data.items.map((o) => (
            <Card key={o.id}><CardContent className="p-4">
              <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.subject}</p>
                  <p className="truncate text-sm text-muted-foreground">{o.companyName ?? "Unknown company"} · {o.jobTitle ?? "Unknown role"} · {KIND_LABELS[o.kind] ?? o.kind} · to {o.toEmail ?? "no recipient"}</p>
                </div>
                <div className="flex items-center gap-2"><VerificationBadge value={o.recipientVerification} />{o.doNotContact && <Badge variant="destructive">do not contact</Badge>}<EmailStatusBadge status={o.status} /></div>
              </button>
              {openId === o.id && <Editor id={o.id} onChanged={load} />}
            </CardContent></Card>))}</div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function FollowUpButton({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await api("/api/outreach/generate", { method: "POST", json: { jobId, kind: "follow_up" } }); toast.success("Follow-up draft created in Drafts"); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }}>Draft follow-up</Button>;
}

function Editor({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [o, setO] = React.useState<OutreachRow | null>(null);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [to, setTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const { outreach } = await api<{ outreach: OutreachRow }>(`/api/outreach/${id}`);
    setO(outreach); setSubject(outreach.subject); setBody(outreach.body); setTo(outreach.toEmail ?? "");
  }, [id]);
  React.useEffect(() => { load().catch((e) => toast.error((e as Error).message)); }, [load]);
  if (!o) return <Skeleton className="mt-3 h-40 w-full" />;

  const locked = o.status === "sent";
  const dirty = subject !== o.subject || body !== o.body || (to.trim().toLowerCase() || null) !== (o.toEmail?.toLowerCase() ?? null);
  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const save = () => run(() => api(`/api/outreach/${id}`, { method: "PATCH", json: { subject, body, toEmail: to.trim() || null } }), "Saved. Any earlier approval was reset.");

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {o.blocked?.unsubscribed && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">This recipient has unsubscribed. Sending is blocked.</p>}
      {o.blocked?.doNotContact && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">This contact is marked do-not-contact. Sending is blocked.</p>}
      {o.error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">Last error: {o.error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>To</Label><Input value={to} onChange={(e) => setTo(e.target.value)} disabled={locked} placeholder="recipient@company.com" /></div>
        <div className="grid gap-1.5"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} /></div>
      </div>
      <div className="grid gap-1.5"><Label>Body</Label><Textarea className="min-h-56 font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} /></div>
      {(o.reminders ?? []).map((r) => <p key={r} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"><FileText className="mt-0.5 size-3.5 shrink-0" />{r}</p>)}
      <p className="text-xs text-muted-foreground">{o.engine === "llm" ? `AI-generated (${o.model}) from your profile, resume and the job only.` : "Generated from a template using only your profile and job facts."} Created {fmt(o.createdAt)}{o.sentAt ? ` · Sent ${fmt(o.sentAt)}` : ""}{o.approvedAt && !o.sentAt ? ` · Approved ${fmt(o.approvedAt)}` : ""}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={async () => { if (await copyText(`To: ${to}\nSubject: ${subject}\n\n${body}`)) toast.success("Copied to clipboard"); else toast.error("Copy failed"); }}><Copy /> Copy</Button>
        {!locked && <Button size="sm" variant="outline" disabled={busy || !dirty} onClick={save}><Save /> Save changes</Button>}
        {!locked && <Button size="sm" variant="outline" disabled={busy || dirty || !o.toEmail} onClick={() => run(() => api(`/api/outreach/${id}/gmail-draft`, { method: "POST" }), "Draft created in Gmail (not sent)")}><Mail /> Create Gmail draft</Button>}
        {!locked && <Button size="sm" disabled={busy || dirty || !o.toEmail || !!o.blocked?.unsubscribed || !!o.blocked?.doNotContact} onClick={() => setSendOpen(true)}>{o.status === "approved" ? <><Send /> Review &amp; send</> : <><Check /> Approve</>}</Button>}
        {!locked && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (confirm("Delete this draft?")) void run(() => api(`/api/outreach/${id}`, { method: "DELETE" }), "Deleted"); }}><Trash2 /> Delete</Button>}
      </div>
      {dirty && !locked && <p className="text-xs text-muted-foreground">Save your changes before approving: approval always applies to the saved text.</p>}
      <SendConfirmDialog outreach={o} open={sendOpen} onOpenChange={setSendOpen} onDone={() => { void load(); onChanged(); }} />
    </div>
  );
}
