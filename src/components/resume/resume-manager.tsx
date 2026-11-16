"use client";
import * as React from "react";
import { toast } from "sonner";
import { FileText, Upload, Star, Trash2, Sparkles, Eye, Download, GitCompare, Loader2, Pencil, Check, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { api } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils";

type Analysis = {
  engine: "llm" | "heuristic"; model?: string | null; atsScore: number; summary: string; sections: { name: string; present: boolean }[]; detectedSkills: string[];
  missingTargetSkills: string[]; strengths: string[]; improvements: string[]; contact: Record<string, string | null>; wordCount: number; analyzedAt: string;
};
type Resume = { id: string; name: string; filename: string; isDefault: boolean; createdAt: string; textLength: number; textPreview: string; analysis: Analysis | null };
type Comparison = {
  resumes: { a: { id: string; name: string }; b: { id: string; name: string } }; common: string[]; onlyA: string[]; onlyB: string[]; verdict: string;
  a: { wordCount: number; atsScore: number; skillCount: number; sections: string[] }; b: { wordCount: number; atsScore: number; skillCount: number; sections: string[] };
};
const MAX = 5 * 1024 * 1024;

export function ResumeManager() {
  const [items, setItems] = React.useState<Resume[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<{ id: string; value: string } | null>(null);
  const [cmp, setCmp] = React.useState<string[]>([]);
  const [comparison, setComparison] = React.useState<Comparison | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setItems((await api<{ items: Resume[] }>("/api/resumes")).items); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load resumes"); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | File[]) {
    const f = Array.from(files)[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return void toast.error("Only PDF files are accepted.");
    if (f.size > MAX) return void toast.error("File is larger than the 5MB limit.");
    setUploading(true);
    try {
      const fd = new FormData(); fd.set("file", f);
      const res = await fetch("/api/resumes", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`);
      toast.success(`Uploaded ${data.name}`);
      if (data.warning) toast.warning(data.warning);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function act<T>(id: string, fn: () => Promise<T>, ok?: string) {
    setBusy(id);
    try { const r = await fn(); if (ok) toast.success(ok); return r; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(null); }
  }
  const makeDefault = (r: Resume) => act(r.id, async () => { await api(`/api/resumes/${r.id}`, { method: "PATCH", json: { isDefault: true } }); await load(); }, `"${r.name}" is now the default`);
  const remove = (r: Resume) => { if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return; act(r.id, async () => { await api(`/api/resumes/${r.id}`, { method: "DELETE" }); setCmp((c) => c.filter((x) => x !== r.id)); setComparison(null); await load(); }, "Resume deleted"); };
  const analyze = (r: Resume) => act(r.id, async () => { const a = await api<Analysis>(`/api/resumes/${r.id}/analyze`, { method: "POST" }); setItems((it) => it?.map((x) => (x.id === r.id ? { ...x, analysis: a } : x)) ?? it); setExpanded(r.id); }, "Analysis complete");
  const saveName = () => renaming && act(renaming.id, async () => { await api(`/api/resumes/${renaming.id}`, { method: "PATCH", json: { name: renaming.value } }); setRenaming(null); await load(); }, "Renamed");
  const compare = async () => { const [a, b] = cmp; setBusy("cmp"); try { setComparison(await api<Comparison>(`/api/resumes/${a}/compare`, { method: "POST", json: { otherId: b } })); } catch (e) { toast.error(e instanceof Error ? e.message : "Comparison failed"); } finally { setBusy(null); } };
  const toggleCmp = (id: string) => { setComparison(null); setCmp((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2))); };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors", drag ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30")}
      >
        {uploading ? <Loader2 className="size-7 animate-spin text-muted-foreground" /> : <Upload className="size-7 text-muted-foreground" />}
        <p className="font-medium">{uploading ? "Uploading and extracting text…" : "Drop a PDF resume here"}</p>
        <p className="text-sm text-muted-foreground">PDF only, up to 5MB. Text is extracted so it can be analyzed and matched.</p>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        <Button variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>Choose file</Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><AlertTriangle className="size-4 text-destructive" /><span className="flex-1">{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>
      )}
      {!items && !error && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>}
      {items && items.length === 0 && <EmptyState icon={FileText} title="No resumes yet" description="Upload your first PDF resume. You can keep several versions (e.g. backend-focused and full-stack) and the best one is recommended per job." />}

      {items && items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{items.length} resume{items.length === 1 ? "" : "s"}{items.length > 1 ? ". Select two to compare." : ""}</p>
            {cmp.length === 2 && <Button size="sm" onClick={compare} disabled={busy === "cmp"}>{busy === "cmp" ? <Loader2 className="animate-spin" /> : <GitCompare />} Compare selected</Button>}
          </div>
          <div className="space-y-3">
            {items.map((r) => {
              const a = r.analysis; const isBusy = busy === r.id;
              return (
                <Card key={r.id} className={cn(r.isDefault && "ring-primary/40")}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        {renaming?.id === r.id ? (
                          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
                            <Input autoFocus value={renaming.value} onChange={(e) => setRenaming({ id: r.id, value: e.target.value })} className="h-7 w-56" aria-label="Resume name" />
                            <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name"><Check /></Button>
                            <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setRenaming(null)}><X /></Button>
                          </form>
                        ) : (
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                            <FileText className="size-4 text-muted-foreground" /> {r.name}
                            {r.isDefault && <Badge className="gap-1"><Star className="size-3" /> Default</Badge>}
                            <button className="text-muted-foreground hover:text-foreground" aria-label="Rename" onClick={() => setRenaming({ id: r.id, value: r.name })}><Pencil className="size-3.5" /></button>
                          </CardTitle>
                        )}
                        <CardDescription>{r.filename} · uploaded {new Date(r.createdAt).toLocaleDateString()} · {r.textLength.toLocaleString()} characters extracted</CardDescription>
                        {r.textLength < 100 && <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3" /> Very little text extracted; this PDF may be a scan.</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {items.length > 1 && <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={cmp.includes(r.id)} onChange={() => toggleCmp(r.id)} /> Compare</label>}
                        <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/resumes/${r.id}/file`} target="_blank" rel="noreferrer" />}><Eye /> View</Button>
                        <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/resumes/${r.id}/file?download=1`} />}><Download /> Download</Button>
                        {!r.isDefault && <Button size="sm" variant="outline" disabled={isBusy} onClick={() => makeDefault(r)}><Star /> Make default</Button>}
                        <Button size="sm" disabled={isBusy} onClick={() => analyze(r)}>{isBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} {a ? "Re-analyze" : "Analyze"}</Button>
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} disabled={isBusy} onClick={() => remove(r)}><Trash2 /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  {a && (
                    <CardContent className="space-y-3">
                      <button className="flex w-full items-center gap-3 text-left" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>
                        <div className="w-40 shrink-0"><div className="mb-1 flex justify-between text-xs"><span>ATS readiness</span><span className="font-medium">{a.atsScore}/100</span></div><Progress value={a.atsScore} /></div>
                        <Badge variant={a.engine === "llm" ? "default" : "outline"}>{a.engine === "llm" ? `AI · ${a.model ?? ""}` : "Rules-based analysis"}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{a.summary}</span>
                      </button>
                      {expanded === r.id && <AnalysisView a={a} />}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {comparison && <ComparisonView c={comparison} onClose={() => setComparison(null)} />}
    </div>
  );
}

function List({ title, items, icon, empty }: { title: string; items: string[]; icon: React.ReactNode; empty?: string }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">{icon}{title}</p>
      {items.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="text-sm text-muted-foreground">{empty ?? "None"}</p>}
    </div>
  );
}
function AnalysisView({ a }: { a: Analysis }) {
  return (
    <div className="grid gap-5 border-t pt-4 md:grid-cols-2">
      <List title="Strengths" items={a.strengths} icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
      <List title="Suggested improvements" items={a.improvements} icon={<AlertTriangle className="size-4 text-amber-500" />} empty="Nothing flagged." />
      <div>
        <p className="mb-1.5 text-sm font-medium">Skills detected ({a.detectedSkills.length})</p>
        <div className="flex flex-wrap gap-1.5">{a.detectedSkills.length ? a.detectedSkills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>) : <span className="text-sm text-muted-foreground">None detected</span>}</div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Profile skills not found in this resume</p>
        <div className="flex flex-wrap gap-1.5">{a.missingTargetSkills.length ? a.missingTargetSkills.map((s) => <Badge key={s} variant="outline">{s}</Badge>) : <span className="text-sm text-muted-foreground">All profile skills appear</span>}</div>
      </div>
      <div className="md:col-span-2">
        <p className="mb-1.5 text-sm font-medium">Sections</p>
        <div className="flex flex-wrap gap-1.5">{a.sections.map((s) => <Badge key={s.name} variant={s.present ? "secondary" : "outline"} className={cn(!s.present && "text-muted-foreground line-through")}>{s.name}</Badge>)}</div>
        <p className="mt-2 text-xs text-muted-foreground">{a.wordCount.toLocaleString()} words · analyzed {new Date(a.analyzedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}
function ComparisonView({ c, onClose }: { c: Comparison; onClose: () => void }) {
  const col = (name: string, s: Comparison["a"], only: string[]) => (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="font-medium">{name}</p>
      <p className="text-sm text-muted-foreground">ATS {s.atsScore}/100 · {s.skillCount} skills · {s.wordCount.toLocaleString()} words</p>
      <p className="text-xs text-muted-foreground">Sections: {s.sections.join(", ") || "none detected"}</p>
      <p className="text-xs font-medium">Only in this resume</p>
      <div className="flex flex-wrap gap-1.5">{only.length ? only.map((x) => <Badge key={x} variant="secondary">{x}</Badge>) : <span className="text-xs text-muted-foreground">Nothing unique</span>}</div>
    </div>
  );
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between"><CardTitle>Comparison</CardTitle><Button size="icon-sm" variant="ghost" aria-label="Close comparison" onClick={onClose}><X /></Button></div><CardDescription>{c.verdict}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">{col(c.resumes.a.name, c.a, c.onlyA)}{col(c.resumes.b.name, c.b, c.onlyB)}</div>
        <div><p className="mb-1.5 text-sm font-medium">Shared skills</p><div className="flex flex-wrap gap-1.5">{c.common.length ? c.common.map((x) => <Badge key={x} variant="outline">{x}</Badge>) : <span className="text-sm text-muted-foreground">None</span>}</div></div>
      </CardContent>
    </Card>
  );
}
