"use client";
import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AutoApplyCard } from "./auto-apply-card";
import { api } from "@/lib/utils/fetcher";
import { Field, SaveButton } from "./form-bits";
import type { SettingsData } from "./types";

const int = (min: number, max: number) => z.number({ error: "Enter a number" }).int().min(min).max(max);
const schema = z.object({
  enabled: z.boolean(), hour: int(0, 23), minute: int(0, 59), timezone: z.string().min(1, "Required"),
  steps: z.object({ fetchJobs: z.boolean(), processGmail: z.boolean(), match: z.boolean(), findContacts: z.boolean(), draftEmails: z.boolean() }),
  minScoreForContacts: int(0, 100), minScoreForDrafts: int(0, 100), followUpBusinessDays: int(1, 30), unsubscribeFooter: z.string().max(600),
});
type Form = z.infer<typeof schema>;
const STEPS: { key: keyof Form["steps"]; label: string; hint: string }[] = [
  { key: "fetchJobs", label: "Fetch new jobs", hint: "Runs enabled discovery sources." },
  { key: "processGmail", label: "Process Gmail", hint: "Only when Gmail is connected; reads job-related mail only." },
  { key: "match", label: "Score matches", hint: "Matches newly discovered jobs." },
  { key: "findContacts", label: "Find HR contacts", hint: "Public sources only, for jobs above the score below." },
  { key: "draftEmails", label: "Draft emails", hint: "Creates drafts only. Nothing is ever sent automatically." },
];
const isValidTz = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

export function WorkflowTab({ settings, onSaved }: { settings: SettingsData; onSaved: (s: SettingsData) => void }) {
  const toForm = (s: SettingsData): Form => ({ ...s.dailyWorkflow, followUpBusinessDays: s.followUpBusinessDays, unsubscribeFooter: s.unsubscribeFooter });
  const { register, control, handleSubmit, reset, setError, formState: { errors, isDirty, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: toForm(settings) });

  const submit = handleSubmit(async (f) => {
    if (!isValidTz(f.timezone)) return setError("timezone", { message: "Unknown IANA timezone (e.g. Asia/Kolkata)" });
    const { followUpBusinessDays, unsubscribeFooter, ...dailyWorkflow } = f;
    try {
      const saved = await api<SettingsData>("/api/settings", { method: "PATCH", json: { dailyWorkflow, followUpBusinessDays, unsubscribeFooter } });
      onSaved(saved); reset(toForm(saved)); toast.success("Workflow settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  });

  return (
    <div className="space-y-6">
    <AutoApplyCard settings={settings} onSaved={onSaved} />
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Daily workflow</CardTitle><CardDescription>Runs discovery, matching, contact lookup and email <em>drafts</em> on a schedule. Emails are only drafted here; sending happens only through the Auto-apply switch above.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div><p className="text-sm font-medium">Enable scheduled run</p><p className="text-xs text-muted-foreground">You can always run it manually from the dashboard.</p></div>
            <Controller control={control} name="enabled" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Enable daily workflow" />} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Hour (0–23)" htmlFor="hour" error={errors.hour?.message}><Input id="hour" type="number" {...register("hour", { valueAsNumber: true })} /></Field>
            <Field label="Minute" htmlFor="minute" error={errors.minute?.message}><Input id="minute" type="number" {...register("minute", { valueAsNumber: true })} /></Field>
            <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}><Input id="timezone" {...register("timezone")} /></Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Steps</p>
            {STEPS.map((st) => (
              <div key={st.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div><p className="text-sm">{st.label}</p><p className="text-xs text-muted-foreground">{st.hint}</p></div>
                <Controller control={control} name={`steps.${st.key}`} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={st.label} />} />
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Min score to find contacts" htmlFor="minScoreForContacts" error={errors.minScoreForContacts?.message}><Input id="minScoreForContacts" type="number" {...register("minScoreForContacts", { valueAsNumber: true })} /></Field>
            <Field label="Min score to draft emails" htmlFor="minScoreForDrafts" error={errors.minScoreForDrafts?.message}><Input id="minScoreForDrafts" type="number" {...register("minScoreForDrafts", { valueAsNumber: true })} /></Field>
            <Field label="Follow-up after (business days)" htmlFor="followUpBusinessDays" error={errors.followUpBusinessDays?.message}><Input id="followUpBusinessDays" type="number" {...register("followUpBusinessDays", { valueAsNumber: true })} /></Field>
          </div>
          <Field label="Unsubscribe footer" htmlFor="unsubscribeFooter" hint="Appended to every outreach draft." error={errors.unsubscribeFooter?.message}><Textarea id="unsubscribeFooter" rows={2} {...register("unsubscribeFooter")} /></Field>
          <div className="flex justify-end"><SaveButton saving={isSubmitting} dirty={isDirty} /></div>
        </CardContent>
      </Card>
    </form>
    </div>
  );
}
