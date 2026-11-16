"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/utils/fetcher";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABELS } from "@/lib/services/application.logic";
import type { Overview } from "@/lib/services/analytics.service";
import { BarList, ChartCard, ColumnChart, SERIES, SplitBar, StatusBars, WeeklyChart } from "./charts";

const pct = (v: number | null) => (v == null ? "Unknown" : `${v}%`);

export function AnalyticsView() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Overview>("/api/analytics/overview").then(setOv).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-sm text-destructive" role="alert">{err}</p>;
  if (!ov) return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>;
  const c = ov.charts;
  return (
    <div>
      <PageHeader title="Analytics" description="Every chart has a table view. Rates show Unknown until there is data to compute them." />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Jobs by source" description="Where discovered jobs came from" empty={!c.bySource.length} table={{ cols: ["Source", "Jobs"], rows: c.bySource.map((d) => ({ Source: d.name, Jobs: d.value })) }}>
          <BarList data={c.bySource.slice(0, 10)} label="Jobs" xLabel="Jobs" />
        </ChartCard>
        <ChartCard title="Jobs by status" description="Pipeline distribution" empty={!c.byStatus.some((d) => d.value)} table={{ cols: ["Status", "Jobs"], rows: c.byStatus.map((d) => ({ Status: STATUS_LABELS[d.name] ?? d.name, Jobs: d.value })) }}>
          <StatusBars data={c.byStatus} />
        </ChartCard>
        <ChartCard title="Jobs by role type" description="Grouped from job titles" empty={!c.byRole.length} table={{ cols: ["Role", "Jobs"], rows: c.byRole.map((d) => ({ Role: d.name, Jobs: d.value })) }}>
          <BarList data={c.byRole} label="Jobs" xLabel="Jobs" />
        </ChartCard>
        <ChartCard title="Weekly activity" description="Last 12 weeks" table={{ cols: ["Week", "Discovered", "Applied", "Emails sent"], rows: c.weekly.map((w) => ({ Week: w.week, Discovered: w.discovered, Applied: w.applied, "Emails sent": w.emailsSent })) }}>
          <WeeklyChart data={c.weekly} />
        </ChartCard>
        <ChartCard title="Email response rate" description={`Response rate: ${pct(c.emailResponse.rate)} (emailed jobs with a reply)`} empty={c.emailResponse.sent === 0}
          table={{ cols: ["Outcome", "Jobs"], rows: [{ Outcome: "Replied", Jobs: c.emailResponse.replied }, { Outcome: "No reply", Jobs: c.emailResponse.noReply }] }}>
          <SplitBar label="Emailed jobs by reply status" rows={[{ name: "Emailed jobs", replied: c.emailResponse.replied, noReply: c.emailResponse.noReply }]} keys={[{ key: "replied", name: "Replied", color: SERIES.s1 }, { key: "noReply", name: "No reply", color: SERIES.s2 }]} />
        </ChartCard>
        <ChartCard title="Interview conversion" description={`Conversion: ${pct(c.interviewFunnel.rate)} of engaged jobs reached interview or selection`} empty={c.interviewFunnel.engaged === 0}
          table={{ cols: ["Stage", "Jobs"], rows: [{ Stage: "Engaged (applied / emailed)", Jobs: c.interviewFunnel.engaged }, { Stage: "Interview or selected", Jobs: c.interviewFunnel.interviews }, { Stage: "Selected", Jobs: c.interviewFunnel.selected }] }}>
          <ColumnChart label="Jobs" yLabel="Jobs" data={[{ name: "Engaged", value: c.interviewFunnel.engaged }, { name: "Interviews", value: c.interviewFunnel.interviews }, { name: "Selected", value: c.interviewFunnel.selected }]} />
        </ChartCard>
      </div>
    </div>
  );
}
