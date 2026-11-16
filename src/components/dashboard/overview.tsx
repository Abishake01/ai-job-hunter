"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, CalendarClock, Mail, MessageSquareReply, Play, Radar, Send, Sparkles, Star, Target, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ScoreBadge } from "@/components/common/score-badge";
import { TaskProgress } from "./task-progress";
import { BarList, StatusBars } from "@/components/analytics/charts";
import type { Overview } from "@/lib/services/analytics.service";

type Report = { reportDate: string; summaryText: string | null; data: { topMatches: { jobId: string; title: string; company: string; score: number }[] }; live?: boolean } | null;
type FollowUp = { id: string; jobId: string; title: string; company: string; dueAt: string; overdue: boolean };

const fmtPct = (v: number | null) => (v == null ? "Unknown" : `${v}%`);

function Kpi({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [report, setReport] = useState<Report>(null);
  const [fups, setFups] = useState<FollowUp[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [task, setTask] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, r, f] = await Promise.all([api<Overview>("/api/analytics/overview"), api<{ report: Report }>("/api/reports/daily"), api<{ items: FollowUp[] }>("/api/follow-ups")]);
      let rep = r.report;
      if (!rep) rep = (await api<{ report: Report }>("/api/reports/daily?live=true")).report;
      setOv(o); setReport(rep); setFups(f.items); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async (kind: "scan" | "workflow") => {
    setBusy(kind);
    try {
      const r = kind === "scan" ? await api<{ taskId: string }>("/api/discovery/scan", { method: "POST", json: {} }) : await api<{ taskId: string }>("/api/workflow/run", { method: "POST" });
      setTask({ id: r.taskId, label: kind === "scan" ? "Job scan" : "Daily workflow" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not start"); } finally { setBusy(null); }
  };

  const k = ov?.kpis;
  return (
    <div>
      <PageHeader title="Overview" description="Your job hunt at a glance. Nothing is ever emailed or submitted automatically."
        actions={<>
          <Button variant="outline" onClick={() => start("scan")} disabled={busy !== null}><Radar className="size-4" /> Scan Now</Button>
          <Button onClick={() => start("workflow")} disabled={busy !== null}><Play className="size-4" /> Run Daily Workflow</Button>
        </>} />
      {err && <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{err}</p>}
      {task && <div className="mb-4"><TaskProgress key={task.id} taskId={task.id} label={task.label} onDone={() => load()} /></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!k ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />) : <>
          <Kpi label="Total jobs" value={k.totalJobs} icon={Briefcase} hint={`${k.newToday} new in 24h`} />
          <Kpi label="Excellent matches" value={k.excellentMatches} icon={Sparkles} hint={`${k.goodMatches} good · ${k.scoredJobs} scored`} />
          <Kpi label="Shortlisted" value={k.shortlisted} icon={Star} />
          <Kpi label="Applications" value={k.applications} icon={Send} />
          <Kpi label="Emails sent" value={k.emailsSent} icon={Mail} />
          <Kpi label="Interviews" value={k.interviews} icon={Users} hint={`Conversion ${fmtPct(k.interviewConversion)}`} />
          <Kpi label="Pending follow-ups" value={k.pendingFollowUps} icon={CalendarClock} />
          <Kpi label="Response rate" value={fmtPct(k.responseRate)} icon={MessageSquareReply} hint="of emailed jobs" />
        </>}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Latest daily report</CardTitle><CardDescription>{report ? `${report.reportDate}${report.live ? " · live snapshot (workflow has not run yet)" : ""}` : "—"}</CardDescription></CardHeader>
          <CardContent>{report ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{report.summaryText}</pre> : <Skeleton className="h-24" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending follow-ups</CardTitle></CardHeader>
          <CardContent>
            {fups.length === 0 ? <p className="text-sm text-muted-foreground">Nothing pending.</p> : (
              <ul className="space-y-2 text-sm">{fups.slice(0, 6).map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{f.title}</span><span className="text-muted-foreground">{f.company}</span></span>
                  <span className={f.overdue ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"}>{f.overdue ? "Overdue" : new Date(f.dueAt).toLocaleDateString()}</span></li>))}</ul>
            )}
            <Link href="/applications" className="mt-3 inline-block text-sm underline underline-offset-4">Open tracker</Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Top matches</CardTitle></CardHeader>
          <CardContent>
            {!report ? <Skeleton className="h-24" /> : report.data.topMatches.length === 0 ? <EmptyState icon={Target} title="No scored jobs yet" description="Scan for jobs, then matching scores them against your profile." /> : (
              <ul className="space-y-2 text-sm">{report.data.topMatches.map((m) => (
                <li key={m.jobId} className="flex items-center justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{m.title}</span><span className="text-muted-foreground">{m.company}</span></span><ScoreBadge score={m.score} thresholds={ov?.thresholds} /></li>))}</ul>
            )}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Jobs by source</CardTitle></CardHeader><CardContent>{ov ? <BarList data={ov.charts.bySource.slice(0, 8)} label="Jobs" /> : <Skeleton className="h-48" />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Jobs by status</CardTitle></CardHeader><CardContent>{ov ? <StatusBars data={ov.charts.byStatus} /> : <Skeleton className="h-48" />}</CardContent></Card>
      </div>
      <p className="mt-6 flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="size-3" /> Charts have a table view on the Analytics page.</p>
    </div>
  );
}
