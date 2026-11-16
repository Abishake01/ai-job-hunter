"use client";
import * as React from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/utils/fetcher";
import { Field, SaveButton, TagInput, ToggleChips, WORK_MODE_OPTIONS, JOB_TYPE_OPTIONS } from "./form-bits";
import type { ProfileView } from "./types";

const digits = z.string().regex(/^\d*$/, "Numbers only");
const url = z.string().refine((v) => v === "" || /^https?:\/\/\S+\.\S+/i.test(v), "Must start with http:// or https://");
const schema = z.object({
  fullName: z.string().max(120), headline: z.string().max(200), phone: z.string().max(40), location: z.string().max(120), summary: z.string().max(3000),
  currentCompany: z.string().max(120), currentTitle: z.string().max(120), education: z.string().max(200),
  graduationYear: z.string().regex(/^(\d{4})?$/, "Use a 4-digit year"), yearsExperience: z.string().regex(/^(\d+(\.\d+)?)?$/, "Use a number, e.g. 1.5"),
  currentSalaryMonthly: digits, expectedSalaryMin: digits, expectedSalaryMax: digits, currency: z.string().length(3, "3-letter code, e.g. INR"),
  portfolioUrl: url, linkedinUrl: url, githubUrl: url,
  targetRoles: z.array(z.string()), preferredLocations: z.array(z.string()), aiExperience: z.array(z.string()),
  primary: z.array(z.string()), additional: z.array(z.string()),
  workModes: z.array(z.string()), jobTypes: z.array(z.string()), includeInternshipsContract: z.boolean(),
  experience: z.array(z.object({ company: z.string().min(1, "Required"), title: z.string().min(1, "Required"), start: z.string(), end: z.string(), description: z.string() })),
  projects: z.array(z.object({ name: z.string().min(1, "Required"), description: z.string(), tech: z.array(z.string()), url: url })),
}).refine((v) => !v.expectedSalaryMin || !v.expectedSalaryMax || +v.expectedSalaryMin <= +v.expectedSalaryMax, { message: "Min must be ≤ max", path: ["expectedSalaryMax"] });
type Form = z.infer<typeof schema>;

const s = (v: string | null | undefined) => v ?? "";
const n = (v: number | null | undefined) => (v == null ? "" : String(v));
const toForm = (d: ProfileView): Form => {
  const p = d.profile;
  return {
    fullName: s(p.fullName), headline: s(p.headline), phone: s(p.phone), location: s(p.location), summary: s(p.summary), currentCompany: s(p.currentCompany), currentTitle: s(p.currentTitle), education: s(p.education),
    graduationYear: n(p.graduationYear), yearsExperience: n(p.yearsExperience), currentSalaryMonthly: n(p.currentSalaryMonthly), expectedSalaryMin: n(p.expectedSalaryMin), expectedSalaryMax: n(p.expectedSalaryMax), currency: p.currency || "INR",
    portfolioUrl: s(p.portfolioUrl), linkedinUrl: s(p.linkedinUrl), githubUrl: s(p.githubUrl),
    targetRoles: p.targetRoles, preferredLocations: p.preferredLocations, aiExperience: p.aiExperience, primary: d.skills.primary, additional: d.skills.additional,
    workModes: p.workModes, jobTypes: p.jobTypes, includeInternshipsContract: p.includeInternshipsContract,
    experience: p.experience.map((e) => ({ company: e.company, title: e.title, start: s(e.start), end: s(e.end), description: s(e.description) })),
    projects: p.projects.map((x) => ({ name: x.name, description: s(x.description), tech: x.tech ?? [], url: s(x.url) })),
  };
};
const num = (v: string) => (v === "" ? null : Number(v));
const txt = (v: string) => v.trim();
const toPayload = (f: Form) => ({
  fullName: txt(f.fullName), headline: txt(f.headline), phone: txt(f.phone), location: txt(f.location), summary: txt(f.summary), currentCompany: txt(f.currentCompany), currentTitle: txt(f.currentTitle), education: txt(f.education),
  graduationYear: num(f.graduationYear), yearsExperience: num(f.yearsExperience), currentSalaryMonthly: num(f.currentSalaryMonthly), expectedSalaryMin: num(f.expectedSalaryMin), expectedSalaryMax: num(f.expectedSalaryMax), currency: f.currency.toUpperCase(),
  portfolioUrl: txt(f.portfolioUrl), linkedinUrl: txt(f.linkedinUrl), githubUrl: txt(f.githubUrl),
  targetRoles: f.targetRoles, preferredLocations: f.preferredLocations, aiExperience: f.aiExperience, workModes: f.workModes, jobTypes: f.jobTypes, includeInternshipsContract: f.includeInternshipsContract,
  experience: f.experience.map((e) => ({ company: e.company.trim(), title: e.title.trim(), start: e.start.trim() || undefined, end: e.end.trim() || undefined, description: e.description.trim() || undefined })),
  projects: f.projects.map((x) => ({ name: x.name.trim(), description: x.description.trim() || undefined, tech: x.tech, url: x.url.trim() || undefined })),
  skills: { primary: f.primary, additional: f.additional },
});

export function ProfileTab({ data, onSaved }: { data: ProfileView; onSaved: (d: ProfileView) => void }) {
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: toForm(data) });
  const { register, control, handleSubmit, formState: { errors, isDirty, isSubmitting }, reset } = form;
  const exp = useFieldArray({ control, name: "experience" });
  const proj = useFieldArray({ control, name: "projects" });

  const submit = handleSubmit(async (f) => {
    try {
      const saved = await api<ProfileView>("/api/profile", { method: "PUT", json: toPayload(f) });
      onSaved(saved); reset(toForm(saved)); toast.success("Profile saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save profile"); }
  }, () => toast.error("Please fix the highlighted fields"));

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Basics</CardTitle><CardDescription>Used for matching and to personalise email drafts. Only facts you enter here are ever used.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}><Input id="fullName" {...register("fullName")} /></Field>
          <Field label="Headline" htmlFor="headline" error={errors.headline?.message}><Input id="headline" placeholder="Full-stack engineer (Python, React)" {...register("headline")} /></Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}><Input id="phone" {...register("phone")} /></Field>
          <Field label="Location" htmlFor="location" error={errors.location?.message}><Input id="location" {...register("location")} /></Field>
          <Field label="Current company" htmlFor="currentCompany"><Input id="currentCompany" {...register("currentCompany")} /></Field>
          <Field label="Current title" htmlFor="currentTitle"><Input id="currentTitle" {...register("currentTitle")} /></Field>
          <Field label="Education" htmlFor="education"><Input id="education" {...register("education")} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Graduation year" htmlFor="graduationYear" error={errors.graduationYear?.message}><Input id="graduationYear" inputMode="numeric" {...register("graduationYear")} /></Field>
            <Field label="Years of experience" htmlFor="yearsExperience" hint="Leave empty if unsure" error={errors.yearsExperience?.message}><Input id="yearsExperience" inputMode="decimal" {...register("yearsExperience")} /></Field>
          </div>
          <Field label="Summary" htmlFor="summary" className="sm:col-span-2" error={errors.summary?.message}><Textarea id="summary" rows={4} {...register("summary")} /></Field>
          <Field label="Portfolio URL" htmlFor="portfolioUrl" error={errors.portfolioUrl?.message}><Input id="portfolioUrl" placeholder="https://" {...register("portfolioUrl")} /></Field>
          <Field label="LinkedIn URL" htmlFor="linkedinUrl" error={errors.linkedinUrl?.message}><Input id="linkedinUrl" placeholder="https://" {...register("linkedinUrl")} /></Field>
          <Field label="GitHub URL" htmlFor="githubUrl" error={errors.githubUrl?.message}><Input id="githubUrl" placeholder="https://" {...register("githubUrl")} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Skills</CardTitle><CardDescription>Press Enter or comma to add. Matching compares these against each job's skills.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Primary skills"><Controller control={control} name="primary" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="Python, FastAPI, React…" />} /></Field>
          <Field label="Additional skills"><Controller control={control} name="additional" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="PostgreSQL, AWS…" />} /></Field>
          <Field label="AI experience" hint="Also counted as skills for matching"><Controller control={control} name="aiExperience" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="LLM APIs, AI integrations…" />} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Job preferences</CardTitle><CardDescription>Salary figures are per month.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Target roles" className="sm:col-span-2"><Controller control={control} name="targetRoles" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="Backend Developer…" />} /></Field>
          <Field label="Preferred locations" className="sm:col-span-2"><Controller control={control} name="preferredLocations" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="India, Remote, Bengaluru…" />} /></Field>
          <Field label="Work modes"><Controller control={control} name="workModes" render={({ field }) => <ToggleChips options={[...WORK_MODE_OPTIONS]} value={field.value} onChange={field.onChange} />} /></Field>
          <Field label="Job types"><Controller control={control} name="jobTypes" render={({ field }) => <ToggleChips options={[...JOB_TYPE_OPTIONS]} value={field.value} onChange={field.onChange} />} /></Field>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div><p className="text-sm font-medium">Show internships and contract roles</p><p className="text-xs text-muted-foreground">They appear in a separate section when enabled; full-time stays the default.</p></div>
            <Controller control={control} name="includeInternshipsContract" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Include internships and contract" />} />
          </div>
          <Field label="Current salary / month" htmlFor="currentSalaryMonthly" error={errors.currentSalaryMonthly?.message}><Input id="currentSalaryMonthly" inputMode="numeric" {...register("currentSalaryMonthly")} /></Field>
          <Field label="Currency" htmlFor="currency" error={errors.currency?.message}><Input id="currency" maxLength={3} className="uppercase" {...register("currency")} /></Field>
          <Field label="Expected salary min / month" htmlFor="expectedSalaryMin" error={errors.expectedSalaryMin?.message}><Input id="expectedSalaryMin" inputMode="numeric" {...register("expectedSalaryMin")} /></Field>
          <Field label="Expected salary max / month" htmlFor="expectedSalaryMax" error={errors.expectedSalaryMax?.message}><Input id="expectedSalaryMax" inputMode="numeric" {...register("expectedSalaryMax")} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Experience</CardTitle><CardDescription>Optional. Email drafts may only reference what is listed here.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {exp.fields.length === 0 && <p className="text-sm text-muted-foreground">No experience entries yet.</p>}
          {exp.fields.map((f, i) => (
            <div key={f.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Field label="Company" error={errors.experience?.[i]?.company?.message}><Input {...register(`experience.${i}.company`)} /></Field>
              <Field label="Title" error={errors.experience?.[i]?.title?.message}><Input {...register(`experience.${i}.title`)} /></Field>
              <Field label="Start"><Input placeholder="Jan 2025" {...register(`experience.${i}.start`)} /></Field>
              <Field label="End"><Input placeholder="Present" {...register(`experience.${i}.end`)} /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea rows={2} {...register(`experience.${i}.description`)} /></Field>
              <div className="sm:col-span-2"><Button type="button" variant="ghost" size="sm" onClick={() => exp.remove(i)}><Trash2 /> Remove</Button></div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => exp.append({ company: "", title: "", start: "", end: "", description: "" })}><Plus /> Add experience</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {proj.fields.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
          {proj.fields.map((f, i) => (
            <div key={f.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Field label="Name" error={errors.projects?.[i]?.name?.message}><Input {...register(`projects.${i}.name`)} /></Field>
              <Field label="URL" error={errors.projects?.[i]?.url?.message}><Input placeholder="https://" {...register(`projects.${i}.url`)} /></Field>
              <Field label="Tech" className="sm:col-span-2"><Controller control={control} name={`projects.${i}.tech`} render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="Next.js, Postgres…" />} /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea rows={2} {...register(`projects.${i}.description`)} /></Field>
              <div className="sm:col-span-2"><Button type="button" variant="ghost" size="sm" onClick={() => proj.remove(i)}><Trash2 /> Remove</Button></div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => proj.append({ name: "", description: "", tech: [], url: "" })}><Plus /> Add project</Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end rounded-xl border bg-background/80 p-3 backdrop-blur">
        <SaveButton saving={isSubmitting} dirty={isDirty}>Save profile</SaveButton>
      </div>
    </form>
  );
}
