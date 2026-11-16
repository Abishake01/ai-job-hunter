"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { JOB_STATUSES } from "@/lib/db/schema";
import { STATUS_LABELS } from "@/lib/services/application.logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScoreBadge } from "@/components/common/score-badge";
import { StatusBadge } from "@/components/common/status-badge";
import type { AppRow } from "./types";

type Event = { id: string; kind: string; title: string; detail: string | null; createdAt: string };
const fieldCls = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** Timeline drawer: status, apply, follow-up, interview, notes, and the full activity timeline. */
export function ApplicationDrawer({ row, open, onOpenChange, onChanged }: { row: AppRow | null; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [iv, setIv] = useState({ date: "", mode: "", link: "", notes: "" });
  const [method, setMethod] = useState("company_site");
  const id = row?.id;

  const loadTimeline = useCallback(async () => {
    if (!id) return;
    try { setEvents((await api<{ items: Event[] }>(`/api/jobs/${id}/timeline`)).items); } catch (e) { toast.error(e instanceof Error ? e.message : "Timeline failed"); }
  }, [id]);
  useEffect(() => {
    if (open && id) { setEvents(null); loadTimeline(); setFollowUp(row?.followUpDate ? new Date(row.followUpDate).toISOString().slice(0, 10) : ""); setIv({ date: row?.interview?.date ?? "", mode: row?.interview?.mode ?? "", link: row?.interview?.link ?? "", notes: row?.interview?.notes ?? "" }); setNote(""); }
  }, [open, id, loadTimeline, row?.followUpDate, row?.interview]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await loadTimeline(); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  if (!row) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{row.title}</SheetTitle>
          <SheetDescription>{row.company}{row.location ? ` · ${row.location}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><ScoreBadge score={row.score} />
            {row.applyUrl && <a href={row.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">Job link <ExternalLink className="size-3" /></a>}</div>

          <div className="space-y-1.5"><Label htmlFor="st">Status</Label>
            <select id="st" className={fieldCls} value={row.status} onChange={(e) => act(() => api(`/api/jobs/${row.id}/status`, { method: "PATCH", json: { status: e.target.value } }), "Status updated")}>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>

          <div className="rounded-lg border p-3 text-sm">
            {row.appliedAt ? <p>Applied on {new Date(row.appliedAt).toLocaleDateString()} via {row.applicationMethod ?? "unknown method"}.</p> : (
              <div className="flex items-end gap-2"><div className="flex-1 space-y-1.5"><Label htmlFor="m">I applied via</Label>
                <select id="m" className={fieldCls} value={method} onChange={(e) => setMethod(e.target.value)}>{["company_site", "email", "portal", "referral", "other"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select></div>
                <Button size="sm" onClick={() => act(() => api(`/api/jobs/${row.id}/apply`, { method: "POST", json: { method } }), "Marked as applied")}>Mark applied</Button></div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">This only records that you applied. The app never submits applications for you.</p>
          </div>

          <div className="space-y-1.5"><Label htmlFor="fu">Follow-up date</Label>
            <div className="flex gap-2"><Input id="fu" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => act(() => api(`/api/jobs/${row.id}/follow-up`, { method: "PUT", json: { date: followUp ? new Date(followUp).toISOString() : null } }), followUp ? "Follow-up scheduled" : "Follow-up cleared")}>Save</Button></div></div>

          <fieldset className="space-y-2"><legend className="text-sm font-medium">Interview</legend>
            <div className="grid grid-cols-2 gap-2"><Input aria-label="Interview date and time" placeholder="Date / time" value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} /><Input aria-label="Interview mode" placeholder="Mode (video, onsite…)" value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })} /></div>
            <Input aria-label="Interview link" placeholder="Meeting link" value={iv.link} onChange={(e) => setIv({ ...iv, link: e.target.value })} />
            <Textarea aria-label="Interview notes" placeholder="Notes" value={iv.notes} onChange={(e) => setIv({ ...iv, notes: e.target.value })} />
            <Button size="sm" variant="outline" onClick={() => act(() => api(`/api/jobs/${row.id}/interview`, { method: "PUT", json: { interview: { date: iv.date || undefined, mode: iv.mode || undefined, link: iv.link || undefined, notes: iv.notes || undefined } } }), "Interview saved")}>Save interview</Button></fieldset>

          <div className="space-y-1.5"><Label htmlFor="nt">Add note</Label><Textarea id="nt" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? Next step?" />
            <Button size="sm" variant="outline" disabled={!note.trim()} onClick={() => act(async () => { await api(`/api/jobs/${row.id}/notes`, { method: "POST", json: { note } }); setNote(""); }, "Note added")}>Add note</Button></div>

          <div><h3 className="mb-2 text-sm font-medium">Timeline</h3>
            {!events ? <p className="text-sm text-muted-foreground">Loading…</p> : events.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
              <ol className="relative space-y-3 border-l pl-4">{events.map((e) => (
                <li key={e.id} className="text-sm"><span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
                  <p className="font-medium">{e.title}</p>{e.detail && <p className="whitespace-pre-wrap text-muted-foreground">{e.detail}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()} · {e.kind}</p></li>))}</ol>)}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
