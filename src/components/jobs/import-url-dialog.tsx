"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/settings/form-bits";
import { formatExperience, formatSalary } from "@/lib/jobs/types";

interface Preview { title: string; company: string; description: string | null; location: string | null; workMode: string | null; jobType: string | null; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryText: string | null; experienceMin: number | null; experienceMax: number | null; experienceText: string | null; postedAt: string | null; applyUrl: string | null }
interface PreviewResp { preview: Preview; method: "jsonld" | "meta"; missing: string[]; closed: boolean }

/** Fetches a posting URL (JSON-LD JobPosting first; robots.txt respected), shows what was found, lets you fix title/company, then saves. */
export function ImportUrlDialog({ onImported, onOpenExisting, trigger }: { onImported?: (jobId: string) => void; onOpenExisting?: (jobId: string) => void; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"fetch" | "save" | null>(null);
  const [res, setRes] = useState<PreviewResp | null>(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setUrl(""); setRes(null); setErr(null); setTitle(""); setCompany(""); };
  const fetchPreview = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy("fetch"); setRes(null);
    try {
      const r = await api<PreviewResp>("/api/jobs/import-url", { method: "POST", json: { url } });
      setRes(r); setTitle(r.preview.title); setCompany(r.preview.company === "Unknown company" ? "" : r.preview.company);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Import failed"); }
    finally { setBusy(null); }
  };
  const save = async () => {
    if (!title.trim() || !company.trim()) { setErr("Company and title are required."); return; }
    setErr(null); setBusy("save");
    try {
      const r = await api<{ jobId: string }>("/api/jobs/import-url", { method: "POST", json: { url, save: true, overrides: { title, company } } });
      toast.success("Job imported"); setOpen(false); reset(); onImported?.(r.jobId);
    } catch (e2) {
      const ex = e2 as Error & { status?: number; data?: { existingJobId?: string } };
      setErr(ex.message);
      if (ex.status === 409 && ex.data?.existingJobId && onOpenExisting) { const id = ex.data.existingJobId; toast.error(ex.message, { action: { label: "Open existing", onClick: () => { setOpen(false); onOpenExisting(id); } } }); }
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={trigger ?? <Button variant="outline"><Link2 className="size-4" />Import URL</Button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a job from a URL</DialogTitle>
          <DialogDescription>Reads the page’s structured job data (JSON-LD) and falls back to page metadata. Sites that block automated access (login, CAPTCHA, robots.txt) are not bypassed — add those manually.</DialogDescription>
        </DialogHeader>
        <form onSubmit={fetchPreview} className="flex items-end gap-2">
          <Field label="Job posting URL" htmlFor="iu-url" className="flex-1"><Input id="iu-url" type="url" required placeholder="https://company.com/careers/123" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Button type="submit" disabled={busy !== null || !url}>{busy === "fetch" && <Loader2 className="size-4 animate-spin" />}Fetch</Button>
        </form>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        {res && (
          <div className="space-y-3 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{res.method === "jsonld" ? "Structured data found" : "Page metadata only"}</Badge>
              {res.closed && <Badge variant="destructive">Listing deadline has passed</Badge>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="iu-title"><Input id="iu-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Company" htmlFor="iu-company" error={!company ? "Company not found on the page — please enter it." : undefined}><Input id="iu-company" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <div><dt className="text-xs text-muted-foreground">Location</dt><dd>{res.preview.location ?? "Unknown"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Salary</dt><dd>{formatSalary(res.preview)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Experience</dt><dd>{formatExperience(res.preview)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Work mode</dt><dd>{res.preview.workMode ?? "Unknown"}</dd></div>
            </dl>
            {res.missing.length > 0 && <p className="text-xs text-muted-foreground">Not found on the page (kept as Unknown): {res.missing.join(", ")}.</p>}
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={!res || busy !== null}>{busy === "save" && <Loader2 className="size-4 animate-spin" />}Save job</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
