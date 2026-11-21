"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Rocket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/utils/fetcher";
import type { Completeness } from "@/lib/profile/completeness";
import { Field } from "./form-bits";
import type { SettingsData } from "./types";

type RunResult = { ran: boolean; reason?: string; missing?: string[]; sent: number; skippedNoContact: number; failed: number; remainingToday: number; applied: { jobId: string; title: string; company: string; to: string }[] };

/** Turning auto-apply on also turns on the scheduled daily run (fetch → match → contacts), so scanning and applying happen every day. */
export async function setAutoApply(enabled: boolean): Promise<SettingsData> {
  const json: Record<string, unknown> = { autoApply: { enabled } };
  if (enabled) json.dailyWorkflow = { enabled: true, steps: { fetchJobs: true, match: true, findContacts: true } };
  return api<SettingsData>("/api/settings", { method: "PATCH", json });
}

export function AutoApplyCard({ settings, onSaved }: { settings: SettingsData; onSaved: (s: SettingsData) => void }) {
  const [comp, setComp] = React.useState<Completeness | null>(null);
  const [gmail, setGmail] = React.useState<boolean | null>(null);
  const [minScore, setMinScore] = React.useState(settings.autoApply.minScore);
  const [cap, setCap] = React.useState(settings.autoApply.dailyCap);
  const [busy, setBusy] = React.useState<"save" | "run" | null>(null);
  const [last, setLast] = React.useState<RunResult | null>(null);

  React.useEffect(() => {
    api<Completeness>("/api/profile/completeness").then(setComp).catch(() => undefined);
    api<{ connected?: boolean }>("/api/gmail/status").then((g) => setGmail(!!g.connected)).catch(() => setGmail(false));
  }, []);

  const save = async (patch: Partial<SettingsData["autoApply"]>) => {
    setBusy("save");
    try { onSaved(await api<SettingsData>("/api/settings", { method: "PATCH", json: { autoApply: patch } })); toast.success("Auto-apply settings saved"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(null); }
  };
  const run = async () => {
    setBusy("run");
    try { const r = await api<RunResult>("/api/auto-apply/run", { method: "POST" }); setLast(r); if (r.ran) toast.success(`${r.sent} application email(s) sent`); else toast.info(r.reason ?? "Nothing to do"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Auto-apply failed"); }
    finally { setBusy(null); }
  };

  const unlocked = !!comp?.complete && gmail === true;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Rocket className="size-4" /> Auto-apply</CardTitle>
        <CardDescription>When on, the daily workflow emails your application (resume attached, sent from your Gmail) for strong matches that have a public recruiter email. Guessed addresses are never used, nobody is emailed twice for the same job, and unsubscribed contacts are skipped.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">Profile completeness</span><span>{comp ? `${comp.percent}%` : "…"}</span></div>
          <Progress value={comp?.percent ?? 0} />
          {comp && !comp.complete && <p className="text-xs text-muted-foreground">Missing: {comp.missing.map((m) => m.label).join(", ")}. <Link href="/settings#profile" className="underline">Update profile</Link> · <Link href="/resume" className="underline">Resume</Link></p>}
          {gmail === false && <p className="text-xs text-muted-foreground">Gmail is not connected — connect it in the Gmail tab to send applications.</p>}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div><p className="text-sm font-medium">Enable auto-apply</p><p className="text-xs text-muted-foreground">{unlocked ? "When on: every day the app scans for jobs from your profile, scores them and applies to the best matches." : "Locked until the profile is 100% complete and Gmail is connected."}</p></div>
          <Switch checked={settings.autoApply.enabled} disabled={!unlocked || busy === "save"} onCheckedChange={async (v) => { setBusy("save"); try { onSaved(await setAutoApply(v)); toast.success(v ? "Auto-apply on — jobs will be scanned and applied to daily" : "Auto-apply off"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(null); } }} aria-label="Enable auto-apply" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum match score" htmlFor="aa-score" hint="Only jobs scoring at least this are applied to."><Input id="aa-score" type="number" min={50} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></Field>
          <Field label="Max applications per day" htmlFor="aa-cap"><Input id="aa-cap" type="number" min={1} max={30} value={cap} onChange={(e) => setCap(Number(e.target.value))} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => save({ minScore: Math.min(100, Math.max(50, minScore || 75)), dailyCap: Math.min(30, Math.max(1, cap || 10)) })}>Save limits</Button>
          <Button disabled={!unlocked || !settings.autoApply.enabled || busy !== null} onClick={run}>{busy === "run" ? <Loader2 className="size-4 animate-spin" /> : null} Run auto-apply now</Button>
        </div>
        {last && (
          <div className="rounded-lg border p-3 text-sm">
            {last.ran ? <p>{last.sent} sent · {last.skippedNoContact} without a public contact (left for you) · {last.failed} failed · {last.remainingToday} left today</p> : <p>{last.reason}{last.missing?.length ? ` (${last.missing.join(", ")})` : ""}</p>}
            {last.applied.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{last.applied.map((a) => <li key={a.jobId}>{a.title} @ {a.company} → {a.to}</li>)}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
