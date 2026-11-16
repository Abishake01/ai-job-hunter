"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/utils/fetcher";
import { Field, SaveButton } from "./form-bits";
import type { SettingsData } from "./types";

const schema = z.object({
  excellent: z.number({ error: "Enter a number" }).int().min(1).max(100),
  good: z.number({ error: "Enter a number" }).int().min(1).max(100),
}).refine((v) => v.good < v.excellent, { message: "Good must be lower than Excellent", path: ["good"] });
type Form = z.infer<typeof schema>;

export function MatchingTab({ settings, onSaved }: { settings: SettingsData; onSaved: (s: SettingsData) => void }) {
  const { register, handleSubmit, watch, reset, formState: { errors, isDirty, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: settings.thresholds });
  const [running, setRunning] = React.useState(false);
  const w = watch();

  const submit = handleSubmit(async (f) => {
    try {
      const saved = await api<SettingsData>("/api/settings", { method: "PATCH", json: { thresholds: f } });
      onSaved(saved); reset(saved.thresholds); toast.success("Thresholds saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  });

  async function rematch() {
    setRunning(true);
    try {
      const r = await api<{ matched: number; failed: number }>("/api/ai/match", { method: "POST", json: { all: true } });
      toast.success(`Re-matched ${r.matched} job${r.matched === 1 ? "" : "s"}${r.failed ? `, ${r.failed} failed` : ""}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Matching failed"); } finally { setRunning(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>Match categories</CardTitle><CardDescription>Scores at or above Excellent are Excellent; at or above Good are Good; the rest are Low. These drive the Recommended Jobs tabs.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Excellent threshold" htmlFor="excellent" error={errors.excellent?.message}><Input id="excellent" type="number" min={1} max={100} {...register("excellent", { valueAsNumber: true })} /></Field>
              <Field label="Good threshold" htmlFor="good" error={errors.good?.message}><Input id="good" type="number" min={1} max={100} {...register("good", { valueAsNumber: true })} /></Field>
            </div>
            <div aria-hidden className="flex h-3 overflow-hidden rounded-full border text-[0px]">
              <div className="bg-red-500/70" style={{ width: `${Math.max(0, Math.min(100, w.good || 0))}%` }} />
              <div className="bg-amber-500/70" style={{ width: `${Math.max(0, Math.min(100, (w.excellent || 0) - (w.good || 0)))}%` }} />
              <div className="flex-1 bg-emerald-500/70" />
            </div>
            <p className="text-xs text-muted-foreground">Low 0–{(w.good || 0) - 1} · Good {w.good || 0}–{(w.excellent || 0) - 1} · Excellent {w.excellent || 0}–100</p>
            <div className="flex justify-end"><SaveButton saving={isSubmitting} dirty={isDirty}>Save thresholds</SaveButton></div>
          </CardContent>
        </Card>
      </form>
      <Card>
        <CardHeader><CardTitle>How scoring works</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Skills 45 (required skills count double), role relevance 15, experience 15, salary 10, location and work mode 10, education 5. Anything a listing does not state is shown as Unknown and scored neutrally, never guessed. With an AI provider configured the model may adjust the score by up to ±15 and writes the explanation; without one a transparent rules-based scorer is used and labelled as such.</p>
          <Button variant="outline" onClick={rematch} disabled={running}><Sparkles /> {running ? "Re-matching…" : "Re-match all jobs now"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
