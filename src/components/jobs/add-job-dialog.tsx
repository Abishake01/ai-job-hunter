"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PLATFORMS } from "@/lib/jobs/platform";
import { Field, NativeSelect } from "@/components/settings/form-bits";

interface Form { title: string; company: string; location: string; applyUrl: string; workMode: string; jobType: string; salaryMin: string; salaryMax: string; platform: string; salaryCurrency: string; experienceMin: string; experienceMax: string; description: string }
const empty: Form = { title: "", company: "", location: "", applyUrl: "", workMode: "", jobType: "", platform: "", salaryMin: "", salaryMax: "", salaryCurrency: "INR", experienceMin: "", experienceMax: "", description: "" };
const n = (s: string) => (s.trim() === "" ? null : Number(s));

/** Manual job entry. Leave a field empty and it stays Unknown (salary/experience are also parsed from the description when present). */
export function AddJobDialog({ onCreated, onOpenExisting, trigger }: { onCreated?: (jobId: string) => void; onOpenExisting?: (jobId: string) => void; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.title.trim() || !f.company.trim()) { setErr("Title and company are required."); return; }
    const hasSalary = f.salaryMin.trim() !== "" || f.salaryMax.trim() !== "";
    setSaving(true);
    try {
      const r = await api<{ jobId: string }>("/api/jobs", { method: "POST", json: {
        title: f.title, company: f.company, location: f.location || null, applyUrl: f.applyUrl || null, platform: f.platform || null, workMode: f.workMode || null, jobType: f.jobType || null,
        salaryMin: n(f.salaryMin), salaryMax: n(f.salaryMax), salaryCurrency: hasSalary ? f.salaryCurrency : null,
        experienceMin: n(f.experienceMin), experienceMax: n(f.experienceMax), description: f.description || null,
      } });
      toast.success("Job added");
      setOpen(false); setF(empty); onCreated?.(r.jobId);
    } catch (e2) {
      const ex = e2 as Error & { status?: number; data?: { existingJobId?: string } };
      if (ex.status === 409 && ex.data?.existingJobId) {
        const id = ex.data.existingJobId;
        setErr(ex.message);
        toast.error(ex.message, onOpenExisting ? { action: { label: "Open existing", onClick: () => { setOpen(false); onOpenExisting(id); } } } : undefined);
      } else setErr(ex.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button variant="outline"><Plus className="size-4" />Add job</Button>} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a job manually</DialogTitle>
          <DialogDescription>For roles from LinkedIn, Naukri, referrals, etc. Unfilled fields stay “Unknown”. Salary is per month.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job title *" htmlFor="aj-title"><Input id="aj-title" value={f.title} onChange={set("title")} required /></Field>
            <Field label="Company *" htmlFor="aj-company"><Input id="aj-company" value={f.company} onChange={set("company")} required /></Field>
            <Field label="Location" htmlFor="aj-loc"><Input id="aj-loc" value={f.location} onChange={set("location")} placeholder="Bengaluru, India / Remote" /></Field>
            <Field label="Application link" htmlFor="aj-url"><Input id="aj-url" type="url" value={f.applyUrl} onChange={set("applyUrl")} placeholder="https://…" /></Field>
            <Field label="Found on (job portal)" htmlFor="aj-pf" hint="Auto-detected from the link; pick it if the link is a company page."><NativeSelect id="aj-pf" value={f.platform} onChange={set("platform")}><option value="">Auto-detect from link</option>{PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</NativeSelect></Field>
            <Field label="Work mode" htmlFor="aj-wm"><NativeSelect id="aj-wm" value={f.workMode} onChange={set("workMode")}><option value="">Unknown</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></NativeSelect></Field>
            <Field label="Job type" htmlFor="aj-jt"><NativeSelect id="aj-jt" value={f.jobType} onChange={set("jobType")}><option value="">Unknown</option><option value="full_time">Full-time</option><option value="internship">Internship</option><option value="contract">Contract</option><option value="part_time">Part-time</option></NativeSelect></Field>
            <Field label="Monthly salary (min – max)" hint="Leave empty if not stated.">
              <div className="flex gap-2"><NativeSelect aria-label="Currency" className="w-20" value={f.salaryCurrency} onChange={set("salaryCurrency")}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></NativeSelect>
                <Input aria-label="Minimum monthly salary" inputMode="numeric" value={f.salaryMin} onChange={set("salaryMin")} placeholder="min" /><Input aria-label="Maximum monthly salary" inputMode="numeric" value={f.salaryMax} onChange={set("salaryMax")} placeholder="max" /></div>
            </Field>
            <Field label="Experience years (min – max)" hint="Leave empty if not stated.">
              <div className="flex gap-2"><Input aria-label="Minimum years" inputMode="decimal" value={f.experienceMin} onChange={set("experienceMin")} placeholder="min" /><Input aria-label="Maximum years" inputMode="decimal" value={f.experienceMax} onChange={set("experienceMax")} placeholder="max" /></div>
            </Field>
          </div>
          <Field label="Description / requirements" htmlFor="aj-desc" hint="Paste the posting; skills, experience, salary (e.g. “6-8 LPA”) and work mode are detected from it.">
            <Textarea id="aj-desc" rows={6} value={f.description} onChange={set("description")} />
          </Field>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Add job</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
