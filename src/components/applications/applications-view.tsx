"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KanbanSquare, LayoutList } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { JOB_STATUSES } from "@/lib/db/schema";
import { STATUS_LABELS } from "@/lib/services/application.logic";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ScoreBadge } from "@/components/common/score-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApplicationDrawer } from "./application-drawer";
import { salaryLabel, type AppRow } from "./types";

export function ApplicationsView() {
  const [rows, setRows] = useState<AppRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows((await api<{ items: AppRow[] }>("/api/applications")).items); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => (rows ?? []).filter((r) => (!status || r.status === status) && (!q || `${r.title} ${r.company}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, status]);
  const selected = rows?.find((r) => r.id === sel) ?? null;

  const move = async (id: string, to: string) => {
    const prev = rows;
    if (!prev || prev.find((r) => r.id === id)?.status === to) return;
    setRows(prev.map((r) => (r.id === id ? { ...r, status: to } : r)));
    try { await api(`/api/jobs/${id}/status`, { method: "PATCH", json: { status: to } }); toast.success(`Moved to ${STATUS_LABELS[to]}`); load(); }
    catch (e) { setRows(prev); toast.error(e instanceof Error ? e.message : "Could not move"); }
  };

  return (
    <div>
      <PageHeader title="Applications" description="Drag cards between columns to update status. Click a card for the full timeline."
        actions={<div className="flex gap-1" role="group" aria-label="View">
          <Button variant={view === "board" ? "default" : "outline"} size="sm" onClick={() => setView("board")}><KanbanSquare className="size-4" /> Board</Button>
          <Button variant={view === "table" ? "default" : "outline"} size="sm" onClick={() => setView("table")}><LayoutList className="size-4" /> Table</Button></div>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search title or company" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
      </div>
      {err && <p className="mb-3 text-sm text-destructive" role="alert">{err}</p>}
      {!rows ? <div className="flex gap-3 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-64 shrink-0" />)}</div>
        : rows.length === 0 ? <EmptyState icon={KanbanSquare} title="No tracked jobs yet" description="Shortlist a job from Discover Jobs or change its status to start tracking it here." />
        : view === "board" ? (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {JOB_STATUSES.map((s) => {
              const col = filtered.filter((r) => r.status === s);
              return (
                <section key={s} aria-label={STATUS_LABELS[s]}
                  onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver((o) => (o === s ? null : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) move(id, s); setDragId(null); }}
                  className={cn("flex w-64 shrink-0 flex-col rounded-xl border bg-muted/40 p-2 transition-colors", over === s && "border-primary bg-primary/5")}>
                  <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-medium">{STATUS_LABELS[s]}<span className="rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{col.length}</span></h2>
                  <div className="flex min-h-16 flex-col gap-2">
                    {col.map((r) => (
                      <article key={r.id} draggable tabIndex={0} role="button" aria-label={`${r.title} at ${r.company}`}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; setDragId(r.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}
                        onClick={() => setSel(r.id)} onKeyDown={(e) => { if (e.key === "Enter") setSel(r.id); }}
                        className={cn("cursor-grab rounded-lg border bg-card p-2.5 text-sm shadow-xs transition hover:shadow-md active:cursor-grabbing", dragId === r.id && "opacity-50")}>
                        <p className="line-clamp-2 font-medium">{r.title}</p><p className="truncate text-muted-foreground">{r.company}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><ScoreBadge score={r.score} />
                          {r.followUpDate && <span className="text-xs text-muted-foreground">Follow-up {new Date(r.followUpDate).toLocaleDateString()}</span>}</div>
                      </article>))}
                  </div>
                </section>);
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table><TableHeader><TableRow>{["Company", "Title", "Status", "Score", "Salary", "Applied", "Recruiter", "Email", "Follow-up"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSel(r.id)}>
                  <TableCell className="font-medium">{r.company}</TableCell><TableCell className="max-w-64 truncate">{r.title}</TableCell><TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell><ScoreBadge score={r.score} /></TableCell><TableCell>{salaryLabel(r)}</TableCell>
                  <TableCell>{r.appliedAt ? `${new Date(r.appliedAt).toLocaleDateString()} (${r.applicationMethod ?? "?"})` : "—"}</TableCell>
                  <TableCell>{r.recruiter ? `${r.recruiter.name ?? "Unknown"} (${r.recruiter.verification})` : "—"}</TableCell>
                  <TableCell>{r.emailStatus ?? "—"}</TableCell><TableCell>{r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : "—"}</TableCell></TableRow>))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No matches for the current filters.</TableCell></TableRow>}</TableBody></Table>
          </div>)}
      <ApplicationDrawer row={selected} open={!!selected} onOpenChange={(o) => !o && setSel(null)} onChanged={load} />
    </div>
  );
}
