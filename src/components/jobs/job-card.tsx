"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Radar, Building2, CalendarClock, ExternalLink, Globe2, Mail, MapPin, Star, UserSearch, Wallet, Briefcase, Loader2 } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/common/score-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { GenerateEmailDialog } from "@/components/outreach/generate-email-dialog";
import { formatExperience, formatSalary, JOB_TYPE_LABEL, WORK_MODE_LABEL, type JobListItem } from "@/lib/jobs/types";
import { sourceLabel, timeAgo } from "@/lib/jobs/format";
import { applyHost } from "@/lib/jobs/platform";
import { cn } from "@/lib/utils";

export function JobCard({ job, thresholds, onOpen, onChanged }: { job: JobListItem; thresholds?: { excellent: number; good: number }; onOpen: (id: string) => void; onChanged?: () => void }) {
  const [busy, setBusy] = useState<"short" | "hr" | "apply" | null>(null);
  const [applied, setApplied] = useState(["applied", "email_sent", "follow_up_required", "interview_scheduled", "selected"].includes(job.status));
  const [emailOpen, setEmailOpen] = useState(false);
  const [shortlisted, setShortlisted] = useState(job.shortlisted);

  const toggleShortlist = async () => {
    setBusy("short");
    try {
      const r = await api<{ shortlisted: boolean }>(`/api/jobs/${job.id}/shortlist`, { method: "POST", json: { shortlisted: !shortlisted } });
      setShortlisted(r.shortlisted);
      toast.success(r.shortlisted ? "Shortlisted" : "Removed from shortlist");
      onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update shortlist"); }
    finally { setBusy(null); }
  };
  const markApplied = async () => {
    setBusy("apply");
    try {
      await api(`/api/jobs/${job.id}/apply`, { method: "POST", json: { method: "company_site" } });
      setApplied(true); toast.success("Marked as applied"); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not mark as applied"); }
    finally { setBusy(null); }
  };
  const findHr = async () => {
    setBusy("hr");
    try {
      const r = await api<{ contacts?: unknown[]; items?: unknown[]; fallback?: unknown }>("/api/recruiters/find", { method: "POST", json: { jobId: job.id } });
      const n = (r.contacts ?? r.items ?? []).length;
      toast.success(n ? `Found ${n} public contact${n === 1 ? "" : "s"} — see HR Contacts` : "No public contact found; a careers/contact page was saved if available");
      onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Contact search failed"); }
    finally { setBusy(null); }
  };

  return (
    <Card className={cn("transition-shadow hover:shadow-md", !job.isActive && "opacity-75")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={() => onOpen(job.id)} className="text-left text-base font-semibold leading-snug hover:underline focus-visible:underline">{job.title}</button>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="size-3.5 shrink-0" /><span className="truncate">{job.companyName}</span></p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <ScoreBadge score={job.matchScore} thresholds={thresholds} />
            {job.status !== "discovered" && <StatusBadge status={job.status} />}
            {!job.isActive && <Badge variant="destructive">Possibly closed</Badge>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
          <Fact icon={MapPin} label="Location" value={job.location ?? "Unknown"} />
          <Fact icon={Wallet} label="Salary" value={formatSalary(job)} />
          <Fact icon={Briefcase} label="Experience" value={formatExperience(job)} />
          <Fact icon={CalendarClock} label="Posted" value={timeAgo(job.postedAt)} />
        </dl>

        <div className="flex flex-wrap items-center gap-1.5">
          {job.workMode && <Badge variant="outline"><Globe2 className="size-3" />{WORK_MODE_LABEL[job.workMode] ?? job.workMode}</Badge>}
          {job.jobType && <Badge variant="outline">{JOB_TYPE_LABEL[job.jobType] ?? job.jobType}</Badge>}
          {job.sources.map((s) => <Badge key={s} className="border-primary/30 bg-primary/10 text-primary" title="Where this job was found"><Radar className="size-3" />Found on {sourceLabel(s)}</Badge>)}
          {job.contactCount > 0 && <Badge variant="secondary"><UserSearch className="size-3" />{job.contactCount} contact{job.contactCount === 1 ? "" : "s"}</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={() => onOpen(job.id)}>View Details</Button>
          <Button size="sm" variant={shortlisted ? "secondary" : "outline"} onClick={toggleShortlist} disabled={busy !== null} aria-pressed={shortlisted}>
            {busy === "short" ? <Loader2 className="size-3.5 animate-spin" /> : <Star className={cn("size-3.5", shortlisted && "fill-current")} />}{shortlisted ? "Shortlisted" : "Shortlist"}
          </Button>
          <Button size="sm" variant="outline" onClick={findHr} disabled={busy !== null}>
            {busy === "hr" ? <Loader2 className="size-3.5 animate-spin" /> : <UserSearch className="size-3.5" />}Find HR
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}><Mail className="size-3.5" />Generate Email</Button>
          <Button size="sm" variant={applied ? "secondary" : "outline"} onClick={markApplied} disabled={busy !== null || applied}>{busy === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}{applied ? "Applied" : "Mark applied"}</Button>
          {job.applyUrl ? (
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium underline-offset-4 hover:underline">{applyHost(job.applyUrl) ? `Apply on ${applyHost(job.applyUrl)}` : "Apply link"} <ExternalLink className="size-3.5" /></a>
          ) : <span className="ml-auto text-xs text-muted-foreground">No apply link</span>}
        </div>
      </CardContent>
      {emailOpen && <GenerateEmailDialog jobId={job.id} open={emailOpen} onOpenChange={setEmailOpen} />}
    </Card>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="size-3" />{label}</dt>
      <dd className={cn("truncate", value === "Unknown" && "text-muted-foreground")} title={value}>{value}</dd>
    </div>
  );
}
