"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/services/application.logic";

/* Palette: validated categorical slots 1-3 (blue, orange, aqua); light/dark stepped separately. */
const CSS = `
.viz-root{--viz-1:#2a78d6;--viz-2:#eb6834;--viz-3:#1baf7a;--viz-grid:#e4e3df;--viz-axis:#52514e;--viz-surface:#fcfcfb;--viz-text:#0b0b0b}
.dark .viz-root{--viz-1:#3987e5;--viz-2:#d95926;--viz-3:#199e70;--viz-grid:#2e2e2c;--viz-axis:#c3c2b7;--viz-surface:#1a1a19;--viz-text:#f0efec}
.viz-root .recharts-cartesian-axis-tick-value{fill:var(--viz-axis);font-size:12px}
.viz-root .recharts-legend-item-text{color:var(--viz-axis)!important}
`;
const S1 = "var(--viz-1)", S2 = "var(--viz-2)", S3 = "var(--viz-3)";
const tip = { contentStyle: { background: "var(--viz-surface)", color: "var(--viz-text)", border: "1px solid var(--viz-grid)", borderRadius: 8, fontSize: 12 }, cursor: { fill: "var(--viz-grid)", opacity: 0.4 } } as const;

export function ChartStyle() { return <style>{CSS}</style>; }

type Row = { name: string; value: number };

function TableView({ rows, cols }: { rows: Record<string, string | number>[]; cols: string[] }) {
  return (
    <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{cols.map((c) => <td key={c} className="px-2 py-1 tabular-nums">{r[c]}</td>)}</tr>)}</tbody></table></div>
  );
}

export function ChartCard({ title, description, table, children, empty }: { title: string; description?: string; table: { rows: Record<string, string | number>[]; cols: string[] }; children: React.ReactNode; empty?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className="viz-root">
      <ChartStyle />
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
        <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? "Chart" : "Table"}</Button>
      </CardHeader>
      <CardContent>{empty ? <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p> : asTable ? <TableView {...table} /> : children}</CardContent>
    </Card>
  );
}

/** Single-series horizontal bars, labelled axis, thin marks with rounded data-ends. */
export function BarList({ data, label, height, xLabel = "Count" }: { data: Row[]; label: string; height?: number; xLabel?: string }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>;
  const h = height ?? Math.max(160, data.length * 30 + 40);
  return (
    <div className="viz-root" role="img" aria-label={`${label}: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
      <ChartStyle />
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, bottom: 18 }}>
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" allowDecimals={false} stroke="var(--viz-grid)" label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "var(--viz-axis)", fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={110} stroke="var(--viz-grid)" tickLine={false} />
          <Tooltip {...tip} formatter={(v) => [String(v), label]} />
          <Bar dataKey="value" name={label} fill={S1} barSize={14} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function StatusBars({ data }: { data: Row[] }) {
  return <BarList label="Jobs" data={data.map((d) => ({ ...d, name: STATUS_LABELS[d.name] ?? d.name })).filter((d) => d.value > 0)} />;
}

export function WeeklyChart({ data }: { data: { week: string; discovered: number; applied: number; emailsSent: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: d.week.slice(5) }));
  return (
    <div className="viz-root" role="img" aria-label="Weekly activity for the last 12 weeks: jobs discovered, applications and emails sent">
      <ChartStyle />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ left: 4, right: 16, bottom: 22, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" stroke="var(--viz-grid)" tickLine={false} label={{ value: "Week starting (MM-DD)", position: "insideBottom", offset: -14, fill: "var(--viz-axis)", fontSize: 12 }} />
          <YAxis allowDecimals={false} stroke="var(--viz-grid)" tickLine={false} width={44} label={{ value: "Count", angle: -90, position: "insideLeft", fill: "var(--viz-axis)", fontSize: 12 }} />
          <Tooltip {...tip} />
          <Legend verticalAlign="top" height={28} />
          <Line type="monotone" dataKey="discovered" name="Discovered" stroke={S1} strokeWidth={2} dot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="applied" name="Applied" stroke={S2} strokeWidth={2} dot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="emailsSent" name="Emails sent" stroke={S3} strokeWidth={2} dot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-segment horizontal stacked bar with a 2px surface gap; shows part-to-whole of emailed jobs. */
export function SplitBar({ rows, keys, label }: { rows: Record<string, string | number>[]; keys: { key: string; name: string; color: string }[]; label: string }) {
  return (
    <div className="viz-root" role="img" aria-label={`${label}: ${rows.map((r) => keys.map((k) => `${k.name} ${r[k.key]}`).join(", ")).join("; ")}`}>
      <ChartStyle />
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, bottom: 22, top: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" allowDecimals={false} stroke="var(--viz-grid)" label={{ value: "Jobs", position: "insideBottom", offset: -12, fill: "var(--viz-axis)", fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={90} stroke="var(--viz-grid)" tickLine={false} />
          <Tooltip {...tip} />
          <Legend verticalAlign="top" height={28} />
          {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.name} stackId="s" fill={k.color} barSize={22} stroke="var(--viz-surface)" strokeWidth={2} radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export const SERIES = { s1: S1, s2: S2, s3: S3 };

/** Vertical columns for the engagement funnel. */
export function ColumnChart({ data, label, yLabel }: { data: Row[]; label: string; yLabel: string }) {
  return (
    <div className="viz-root" role="img" aria-label={`${label}: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
      <ChartStyle />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 4, right: 16, bottom: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="name" stroke="var(--viz-grid)" tickLine={false} />
          <YAxis allowDecimals={false} stroke="var(--viz-grid)" tickLine={false} width={44} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--viz-axis)", fontSize: 12 }} />
          <Tooltip {...tip} />
          <Bar dataKey="value" name={label} fill={S1} barSize={28} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
