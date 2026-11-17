"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, Star, UserSearch, XCircle } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NativeSelect } from "@/components/settings/form-bits";
import { ScoreBadge } from "@/components/common/score-badge";
import { StatusBadge, STATUS_LABELS } from "@/components/common/status-badge";
import { GenerateEmailDialog } from "@/components/outreach/generate-email-dialog";
import { VerificationBadge, EmailStatusBadge } from "@/components/outreach/shared";
import { JOB_STATUSES } from "@/lib/db/schema";
import { formatExperience, formatSalary, JOB_TYPE_LABEL, WORK_MODE_LABEL, type JobDetailData } from "@/lib/jobs/types";
import { fmtDate, fmtDateTime, sourceLabel } from "@/lib/jobs/format";

type Fit = { status?: string; detail?: string };
const FIT_LABELS: [string, string][] = [["experienceFit", "Experience"], ["salaryFit", "Salary"], ["locationFit", "Location"], ["workModeFit", "Work mode"], ["educationFit", "Education"]];

export function JobDetailSheet({ jobId, open, onOpenChange, onChanged }: { jobId: string | null; open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void }) {
  const [d, setD] = useState<JobDetailData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [method, setMethod] = useState("company_site");
  const [iv, setIv] = useState({ date: "", mode: "", link: "", notes: "" });
  const [avail, setAvail] = useState<{ status: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setErr(null);
    try {
      const r = await api<JobDetailData>(`/api/jobs/${jobId}`);
      setD(r);
      setFollowUp(r.job.followUpDate ? r.job.followUpDate.slice(0, 10) : "");
      setIv({ date: r.job.interview?.date ?? "", mode: r.job.interview?.mode ?? "", link: r.job.interview?.link ?? "", notes: r.job.interview?.notes ?? "" });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load job"); }
  }, [jobId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/params
  useEffect(() => { if (open && jobId) { setD(null); setAvail(null); setNote(""); load(); } }, [open, jobId, load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await load(); onChanged?.(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };
  const checkAvail = async () => {
    setBusy("avail");
    try { const r = await api<{ status: string; reason: string }>(`/api/jobs/${jobId}/check-availability`, { method: "POST" }); setAvail(r); await load(); onChanged?.(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Check failed"); } finally { setBusy(null); }
  };
  const findHr = () => act("hr", async () => {
    const r = await api<{ contacts?: unknown[] }>("/api/recruiters/find", { method: "POST", json: { jobId } });
    if (!r.contacts?.length) toast.message("No public contact found. A careers/contact page was saved if one exists.");
  }, "Contact search finished");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {err ? (
          <div className="p-6"><SheetTitle>Could not load job</SheetTitle><p className="mt-2 text-sm text-destructive" role="alert">{err}</p><Button className="mt-3" variant="outline" onClick={load}>Retry</Button></div>
        ) : !d ? (
          <div className="space-y-3 p-6"><SheetTitle className="sr-only">Loading job</SheetTitle><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8 text-lg">{d.job.title}</SheetTitle>
              <SheetDescription>{d.company.name}{d.job.location ? ` · ${d.job.location}` : ""}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <ScoreBadge score={d.match?.score} thresholds={d.thresholds} /><StatusBadge status={d.job.status} />
                {d.job.shortlisted && <Badge variant="secondary"><Star className="size-3 fill-current" />Shortlisted</Badge>}
                {!d.job.isActive && <Badge variant="destructive">Possibly closed</Badge>}
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-8">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("short", () => api(`/api/jobs/${d.job.id}/shortlist`, { method: "POST", json: { shortlisted: !d.job.shortlisted } }), d.job.shortlisted ? "Removed from shortlist" : "Shortlisted")}>
                  <Star className="size-3.5" />{d.job.shortlisted ? "Remove shortlist" : "Shortlist"}</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={findHr}>{busy === "hr" ? <Loader2 className="size-3.5 animate-spin" /> : <UserSearch className="size-3.5" />}Find HR</Button>
                <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}><Mail className="size-3.5" />Generate Email</Button>
                {!d.application && <Button size="sm" disabled={busy !== null} onClick={() => act("apply", () => api(`/api/jobs/${d.job.id}/apply`, { method: "POST", json: { method: "company_site" } }), "Marked as applied")}><CheckCircle2 className="size-3.5" />Mark applied</Button>}
                {d.application && <Badge variant="secondary"><CheckCircle2 className="size-3" />Applied {fmtDate(d.application.appliedAt)}</Badge>}
                {d.job.applyUrl && <a href={d.job.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted">Apply on site <ExternalLink className="size-3.5" /></a>}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Fact label="Salary (monthly)" value={formatSalary(d.job)} />
                <Fact label="Experience" value={formatExperience(d.job)} />
                <Fact label="Work mode" value={d.job.workMode ? WORK_MODE_LABEL[d.job.workMode] : "Unknown"} />
                <Fact label="Job type" value={d.job.jobType ? JOB_TYPE_LABEL[d.job.jobType] : "Unknown"} />
                <Fact label="Posted" value={fmtDate(d.job.postedAt)} />
                <Fact label="Deadline" value={d.job.deadline ? fmtDate(d.job.deadline) : "Unknown"} />
              </dl>

              <section aria-labelledby="avail-h" className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="avail-h" className="font-medium">Availability</h3>
                  <Button size="sm" variant="outline" onClick={checkAvail} disabled={busy !== null}>{busy === "avail" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Check now</Button>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
                  {d.job.isActive ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-destructive" />}
                  {d.job.isActive ? "No sign that the listing closed" : `Listing looks closed${d.job.expiredAt ? ` (${fmtDate(d.job.expiredAt)})` : ""}`}
                  · last checked {d.job.lastCheckedAt ? fmtDateTime(d.job.lastCheckedAt) : "never"}
                </p>
                {avail && <p className="mt-1 text-xs text-muted-foreground">Result: {avail.status} — {avail.reason}</p>}
              </section>

              <Section title="Match breakdown">
                {!d.match ? <p className="text-sm text-muted-foreground">Not scored yet. Run matching from Recommended Jobs or the daily workflow.</p> : (
                  <div className="space-y-3 text-sm">
                    <p>{d.match.explanation ?? d.match.recommendation}</p>
                    <p className="text-xs text-muted-foreground">Engine: {d.match.engine === "llm" ? `AI (${d.match.model ?? "LLM"})` : "Heuristic (no AI key configured)"}</p>
                    <SkillRow label="Matching skills" items={d.match.matchingSkills} tone="ok" />
                    <SkillRow label="Missing required" items={d.match.missingSkills} tone="bad" />
                    <SkillRow label="Missing optional" items={d.match.optionalMissingSkills} tone="muted" />
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {FIT_LABELS.map(([k, label]) => { const f = d.match!.details[k] as Fit | undefined; return f ? <li key={k} className="rounded-md border px-2 py-1.5"><span className="font-medium">{label}:</span> <span className="capitalize">{f.status ?? "unknown"}</span>{f.detail && <span className="block text-xs text-muted-foreground">{f.detail}</span>}</li> : null; })}
                    </ul>
                    {Array.isArray(d.match.details.mismatchReasons) && (d.match.details.mismatchReasons as string[]).length > 0 && (
                      <div><p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="size-4 text-amber-600" />Possible mismatches</p><ul className="list-disc pl-5 text-muted-foreground">{(d.match.details.mismatchReasons as string[]).map((m) => <li key={m}>{m}</li>)}</ul></div>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Description">
                {d.job.description ? <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">{d.job.description}</div> : <p className="text-sm text-muted-foreground">No description provided by the source.</p>}
                {d.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.skills.map((s) => <Badge key={s.name} variant={s.required ? "secondary" : "outline"}>{s.name}{s.required ? "" : " (optional)"}</Badge>)}</div>}
              </Section>

              <Section title={`Where it was found (${d.provenance.length})`}>
                <ul className="space-y-1 text-sm">{d.provenance.map((p) => <li key={`${p.source}-${p.sourceJobId}`} className="flex items-center justify-between gap-2"><span><Badge variant="secondary">{sourceLabel(p.source)}</Badge> <span className="text-xs text-muted-foreground">{fmtDate(p.discoveredAt)}</span></span>{p.sourceUrl && <a className="inline-flex items-center gap-1 text-xs underline" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">Source <ExternalLink className="size-3" /></a>}</li>)}</ul>
              </Section>

              <Section title={`HR contacts at ${d.company.name} (${d.contacts.length})`}>
                {d.contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet. Use “Find HR” (public sources only).{d.company.careersUrl && <> Careers page: <a className="underline" href={d.company.careersUrl} target="_blank" rel="noopener noreferrer">{d.company.careersUrl}</a></>}</p> : (
                  <ul className="space-y-2 text-sm">{d.contacts.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"><span><b>{c.name ?? "Unknown name"}</b>{c.designation ? ` · ${c.designation}` : ""}<br /><span className="text-muted-foreground">{c.email ?? "No email"}</span></span><span className="flex items-center gap-1.5"><VerificationBadge value={c.verification} />{c.doNotContact && <Badge variant="destructive">Do not contact</Badge>}</span></li>)}</ul>
                )}
              </Section>

              <Section title={`Emails (${d.emails.length + d.conversations.length})`}>
                {d.emails.length + d.conversations.length === 0 ? <p className="text-sm text-muted-foreground">No emails for this job yet.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {d.emails.map((e) => <li key={e.id} className="flex items-center justify-between gap-2"><span className="truncate">{e.subject}</span><EmailStatusBadge status={e.status} /></li>)}
                    {d.conversations.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 text-muted-foreground"><span className="truncate">{c.subject ?? "(no subject)"} · {c.fromAddress ?? ""}</span><Badge variant="outline">{c.category.replace(/_/g, " ")}</Badge></li>)}
                  </ul>
                )}
              </Section>

              <Separator />
              <Section title="Track this job">
                <div className="space-y-4 text-sm">
                  <div className="space-y-1.5"><Label htmlFor="jd-status">Status</Label>
                    <NativeSelect id="jd-status" value={d.job.status} disabled={busy !== null} onChange={(e) => act("status", () => api(`/api/jobs/${d.job.id}/status`, { method: "PATCH", json: { status: e.target.value } }), "Status updated")}>
                      {JOB_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</NativeSelect></div>
                  <div className="rounded-lg border p-3">
                    {d.application ? <p>Applied on {fmtDate(d.application.appliedAt)} via {d.application.method?.replace(/_/g, " ") ?? "unknown method"}.</p> : (
                      <div className="flex items-end gap-2"><div className="flex-1 space-y-1.5"><Label htmlFor="jd-method">I applied via</Label>
                        <NativeSelect id="jd-method" value={method} onChange={(e) => setMethod(e.target.value)}>{["company_site", "email", "portal", "referral", "other"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</NativeSelect></div>
                        <Button size="sm" disabled={busy !== null} onClick={() => act("apply", () => api(`/api/jobs/${d.job.id}/apply`, { method: "POST", json: { method } }), "Marked as applied")}>Mark applied</Button></div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">This only records that you applied. The app never submits applications for you.</p>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="jd-fu">Follow-up date</Label>
                    <div className="flex gap-2"><Input id="jd-fu" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("fu", () => api(`/api/jobs/${d.job.id}/follow-up`, { method: "PUT", json: { date: followUp ? new Date(followUp).toISOString() : null } }), followUp ? "Follow-up scheduled" : "Follow-up cleared")}>Save</Button></div></div>
                  <fieldset className="space-y-2"><legend className="font-medium">Interview</legend>
                    <div className="grid grid-cols-2 gap-2"><Input aria-label="Interview date and time" placeholder="Date / time" value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} /><Input aria-label="Interview mode" placeholder="Mode (video, onsite…)" value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })} /></div>
                    <Input aria-label="Interview link" placeholder="Meeting link" value={iv.link} onChange={(e) => setIv({ ...iv, link: e.target.value })} />
                    <Textarea aria-label="Interview notes" placeholder="Notes" value={iv.notes} onChange={(e) => setIv({ ...iv, notes: e.target.value })} />
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("iv", () => api(`/api/jobs/${d.job.id}/interview`, { method: "PUT", json: { interview: { date: iv.date || undefined, mode: iv.mode || undefined, link: iv.link || undefined, notes: iv.notes || undefined } } }), "Interview saved")}>Save interview</Button></fieldset>
                  <div className="space-y-1.5"><Label htmlFor="jd-note">Add note</Label><Textarea id="jd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? Next step?" />
                    <Button size="sm" variant="outline" disabled={!note.trim() || busy !== null} onClick={() => act("note", async () => { await api(`/api/jobs/${d.job.id}/notes`, { method: "POST", json: { note } }); setNote(""); }, "Note added")}>Add note</Button></div>
                </div>
              </Section>

              <Section title="Timeline">
                {d.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
                  <ol className="relative space-y-3 border-l pl-4">{d.timeline.map((e) => (
                    <li key={e.id} className="text-sm"><span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
                      <p className="font-medium">{e.title}</p>{e.detail && <p className="whitespace-pre-wrap text-muted-foreground">{e.detail}</p>}
                      <p className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)} · {e.kind}</p></li>))}</ol>
                )}
              </Section>
            </div>
            {emailOpen && <GenerateEmailDialog jobId={d.job.id} open={emailOpen} onOpenChange={(o) => { setEmailOpen(o); if (!o) { load(); onChanged?.(); } }} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={value === "Unknown" ? "text-muted-foreground" : ""}>{value}</dd></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-2 text-sm font-semibold">{title}</h3>{children}</section>;
}
function SkillRow({ label, items, tone }: { label: string; items: string[]; tone: "ok" | "bad" | "muted" }) {
  if (!items.length) return null;
  return <div><p className="mb-1 text-xs text-muted-foreground">{label}</p><div className="flex flex-wrap gap-1.5">{items.map((s) => <Badge key={s} variant={tone === "bad" ? "destructive" : tone === "ok" ? "secondary" : "outline"}>{s}</Badge>)}</div></div>;
}
