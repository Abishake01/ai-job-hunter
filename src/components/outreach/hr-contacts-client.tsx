"use client";
import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { api, qs } from "@/lib/utils/fetcher";
import { GenerateEmailDialog } from "./generate-email-dialog";
import { selectCls, VerificationBadge } from "./shared";

type Contact = {
  id: string; name: string | null; designation: string | null; email: string | null; profileUrl: string | null; verification: string; doNotContact: boolean; notes: string | null;
  companyName?: string; jobId: string | null; jobTitle?: string | null; sources: { id: string; sourceUrl: string; sourceType: string; note: string | null }[];
};
type List = { items: Contact[]; total: number; page: number; pageSize: number };
type Unsub = { id: string; email: string; reason: string | null; createdAt: string };

const isUrl = (u: string) => /^https?:\/\//.test(u);

export function HrContactsClient() {
  const [q, setQ] = React.useState("");
  const [verification, setVerification] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<List | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [emailFor, setEmailFor] = React.useState<Contact | null>(null);
  const [unsubs, setUnsubs] = React.useState<Unsub[]>([]);
  const [newUnsub, setNewUnsub] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    try { setData(await api<List>(`/api/recruiters${qs({ q, verification, page, pageSize: 20 })}`)); } catch (e) { setError((e as Error).message); }
  }, [q, verification, page]);
  React.useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const loadUnsubs = React.useCallback(() => api<{ items: Unsub[] }>("/api/unsubscribes").then((r) => setUnsubs(r.items)).catch(() => undefined), []);
  React.useEffect(() => { void loadUnsubs(); }, [loadUnsubs]);

  async function act(fn: () => Promise<unknown>, ok: string) { try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error((e as Error).message); } }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search name, email, company…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className={selectCls} value={verification} onChange={(e) => { setVerification(e.target.value); setPage(1); }} aria-label="Verification filter">
          <option value="">All verification levels</option>{["verified", "public", "inferred", "unknown"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <Button className="ml-auto" onClick={() => setAddOpen(true)}><Plus /> Add contact</Button>
      </div>
      <p className="text-xs text-muted-foreground">Contacts come from public job ads, company pages and your Gmail only. <b>verified</b> means your email-verification provider confirmed deliverability; <b>public</b> was published on a page; <b>inferred</b> is a labelled pattern guess; <b>unknown</b> is unconfirmed. Use <i>Find HR</i> on a job to search.</p>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error} <Button size="sm" variant="outline" className="ml-2" onClick={load}>Retry</Button></div>}
      {data === null ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div> : data.items.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" description="Click Find HR on a job card, or add a contact you found yourself." />
      ) : (
        <>
          <div className="space-y-2">{data.items.map((c) => (
            <Card key={c.id}><CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.name ?? "Name unknown"}{c.designation ? <span className="font-normal text-muted-foreground"> · {c.designation}</span> : null}</p>
                  <p className="text-sm text-muted-foreground">{c.companyName}{c.jobTitle ? ` · ${c.jobTitle}` : ""}</p>
                  <p className="text-sm">{c.email ?? <span className="text-muted-foreground">No email</span>}</p>
                </div>
                <div className="flex items-center gap-2"><VerificationBadge value={c.verification} />{c.doNotContact && <Badge variant="destructive">do not contact</Badge>}</div>
              </div>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                {c.sources.map((s) => (
                  <p key={s.id} className="flex flex-wrap items-center gap-1">Source ({s.sourceType.replace("_", " ")}): {isUrl(s.sourceUrl) ? <a className="inline-flex items-center gap-0.5 underline" href={s.sourceUrl} target="_blank" rel="noreferrer noopener">{s.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60)}<ExternalLink className="size-3" /></a> : <span>{s.sourceUrl}</span>}{s.note ? ` · ${s.note}` : ""}</p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {c.jobId && !c.doNotContact && <Button size="sm" onClick={() => setEmailFor(c)}>Generate email</Button>}
                {c.email && <Button size="sm" variant="outline" onClick={() => act(() => api(`/api/recruiters/${c.id}/verify`, { method: "POST" }), "Verification checked")}><ShieldCheck /> Verify email</Button>}
                <Button size="sm" variant="outline" onClick={() => act(() => api(`/api/recruiters/${c.id}`, { method: "PATCH", json: { doNotContact: !c.doNotContact } }), c.doNotContact ? "Contact re-enabled" : "Marked do-not-contact")}>{c.doNotContact ? "Allow contact" : "Do not contact"}</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this contact?")) void act(() => api(`/api/recruiters/${c.id}`, { method: "DELETE" }), "Deleted"); }}><Trash2 /></Button>
              </div>
            </CardContent></Card>))}</div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Unsubscribed addresses</h2>
        <p className="text-sm text-muted-foreground">Emails to these addresses are blocked. Replies saying &quot;unsubscribe&quot; are added automatically when Gmail sync sees them.</p>
        <form className="flex max-w-md gap-2" onSubmit={async (e) => { e.preventDefault(); if (!newUnsub) return; try { await api("/api/unsubscribes", { method: "POST", json: { email: newUnsub, reason: "Added manually" } }); setNewUnsub(""); await loadUnsubs(); await load(); } catch (err) { toast.error((err as Error).message); } }}>
          <Input type="email" placeholder="address@company.com" value={newUnsub} onChange={(e) => setNewUnsub(e.target.value)} /><Button type="submit" variant="outline">Block</Button>
        </form>
        {unsubs.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <ul className="space-y-1 text-sm">{unsubs.map((u) => (
          <li key={u.id} className="flex items-center justify-between rounded-md border px-3 py-1.5"><span>{u.email}{u.reason ? <span className="text-muted-foreground"> · {u.reason}</span> : null}</span>
            <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/api/unsubscribes/${u.id}`, { method: "DELETE" }); await loadUnsubs(); } catch (err) { toast.error((err as Error).message); } }}>Remove</Button></li>))}</ul>}
      </section>

      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
      {emailFor?.jobId && <GenerateEmailDialog jobId={emailFor.jobId} open={!!emailFor} onOpenChange={(o) => !o && setEmailFor(null)} />}
    </div>
  );
}

function AddContactDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [f, setF] = React.useState({ companyName: "", name: "", designation: "", email: "", sourceUrl: "" });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add contact</DialogTitle><DialogDescription>Manual contacts are labelled &quot;unknown&quot; until a verification provider confirms the address. Add the page where you found them if possible.</DialogDescription></DialogHeader>
        <form id="add-contact" className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try {
            await api("/api/recruiters", { method: "POST", json: { companyName: f.companyName, name: f.name || null, designation: f.designation || null, email: f.email || null, sourceUrl: f.sourceUrl || null } });
            toast.success("Contact added"); setF({ companyName: "", name: "", designation: "", email: "", sourceUrl: "" }); onOpenChange(false); onAdded();
          } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
        }}>
          <div className="grid gap-1.5"><Label htmlFor="c-company">Company *</Label><Input id="c-company" required value={f.companyName} onChange={set("companyName")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="c-name">Name</Label><Input id="c-name" value={f.name} onChange={set("name")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="c-des">Designation</Label><Input id="c-des" value={f.designation} onChange={set("designation")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="c-email">Email</Label><Input id="c-email" type="email" value={f.email} onChange={set("email")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="c-src">Source URL</Label><Input id="c-src" type="url" placeholder="https://…" value={f.sourceUrl} onChange={set("sourceUrl")} /></div>
        </form>
        <DialogFooter showCloseButton={false}><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="add-contact" disabled={busy || (!f.name && !f.email)}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
