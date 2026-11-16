"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, SearchX, Sparkles } from "lucide-react";
import { api, qs } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { JobCard } from "./job-card";
import { JobDetailSheet } from "./job-detail-sheet";
import { JobFiltersBar, DEFAULT_FILTERS, cleanFilters } from "./job-filters";
import { AddJobDialog } from "./add-job-dialog";
import { ImportUrlDialog } from "./import-url-dialog";
import { ScanNowButton } from "./scan-now-button";
import type { JobFilters, JobSearchResult } from "@/lib/jobs/types";

type Cat = "excellent" | "good" | "low";
const CATS: { key: Cat; label: string }[] = [{ key: "excellent", label: "Excellent" }, { key: "good", label: "Good" }, { key: "low", label: "Low" }];

/** Shared list UI: mode "discover" = all jobs with full filters; "recommended" = match-category tabs + internship/contract toggle. */
export function JobsBrowser({ mode }: { mode: "discover" | "recommended" }) {
  const rec = mode === "recommended";
  const [filters, setFilters] = useState<JobFilters>(rec ? { ...DEFAULT_FILTERS, sort: "score", category: "excellent", fullTimeOnly: true } : DEFAULT_FILTERS);
  const [data, setData] = useState<JobSearchResult | null>(null);
  const [counts, setCounts] = useState<Record<Cat, number | null>>({ excellent: null, good: null, low: null });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setError(null);
    try {
      const r = await api<JobSearchResult>(`/api/jobs${qs(cleanFilters(filters) as Record<string, unknown>)}`);
      if (my === seq.current) setData(r);
    } catch (e) { if (my === seq.current) setError(e instanceof Error ? e.message : "Failed to load jobs"); }
    finally { if (my === seq.current) setLoading(false); }
  }, [filters]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/params
  useEffect(() => { load(); }, [load]);

  const loadCounts = useCallback(async () => {
    if (!rec) return;
    const base = { active: true, fullTimeOnly: filters.fullTimeOnly, pageSize: 1 };
    const out = await Promise.all(CATS.map((c) => api<JobSearchResult>(`/api/jobs${qs({ ...base, category: c.key })}`).then((r) => r.total).catch(() => null)));
    setCounts({ excellent: out[0], good: out[1], low: out[2] });
  }, [rec, filters.fullTimeOnly]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/params
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const refresh = () => { load(); loadCounts(); };
  const runMatching = async () => {
    setMatching(true);
    try {
      const r = await api<{ matched?: number; failed?: number }>("/api/ai/match", { method: "POST", json: { all: true, onlyUnmatched: true } });
      toast.success(`Scored ${r.matched ?? 0} job${r.matched === 1 ? "" : "s"}${r.failed ? `, ${r.failed} failed` : ""}`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Matching failed"); }
    finally { setMatching(false); }
  };

  const actions = (
    <>
      {rec && <Button variant="outline" onClick={runMatching} disabled={matching}>{matching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Score unscored jobs</Button>}
      <ScanNowButton onDone={refresh} />
      <ImportUrlDialog onImported={(id) => { refresh(); setOpenId(id); }} onOpenExisting={setOpenId} />
      <AddJobDialog onCreated={(id) => { refresh(); setOpenId(id); }} onOpenExisting={setOpenId} />
    </>
  );

  return (
    <div>
      <PageHeader title={rec ? "Recommended Jobs" : "Discover Jobs"} description={rec ? "Jobs ranked by how well they fit your profile. Thresholds are configurable in Settings → Matching." : "Jobs from public APIs, company boards, Gmail alerts and your manual entries — deduplicated across sources."} actions={actions} />

      {rec && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filters.category ?? "excellent"} onValueChange={(v) => setFilters((f) => ({ ...f, category: v as Cat, page: 1 }))}>
            <TabsList>{CATS.map((c) => <TabsTrigger key={c.key} value={c.key}>{c.label}{counts[c.key] !== null ? ` (${counts[c.key]})` : ""}</TabsTrigger>)}</TabsList>
          </Tabs>
          <Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={!filters.fullTimeOnly} onCheckedChange={(c) => setFilters((f) => ({ ...f, fullTimeOnly: c ? undefined : true, page: 1 }))} />Include internships, contract &amp; part-time</Label>
        </div>
      )}

      <JobFiltersBar value={filters} onChange={setFilters} hide={rec ? ["category", "jobType", "fullTimeOnly"] : []} />

      <div className="mt-4 space-y-3" aria-live="polite" aria-busy={loading}>
        {error ? (
          <div className="rounded-xl border border-destructive/40 p-6 text-center" role="alert"><p className="text-sm text-destructive">{error}</p><Button className="mt-3" variant="outline" onClick={load}>Retry</Button></div>
        ) : loading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={SearchX} title={rec ? "No jobs in this category" : "No jobs match"} description={rec ? "Scan for jobs, then use “Score unscored jobs”. Jobs only appear here once they have a match score." : "Run Scan Now (configure sources and company boards in Settings → Discovery), import a URL, or add a job manually."} action={!rec ? <ScanNowButton onDone={refresh} /> : undefined} />
        ) : (
          <div className={loading ? "space-y-3 opacity-60 transition-opacity" : "space-y-3"}>
            {data?.items.map((j) => <JobCard key={j.id} job={j} thresholds={data.thresholds} onOpen={setOpenId} onChanged={refresh} />)}
          </div>
        )}
      </div>
      {data && data.total > 0 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => { setFilters((f) => ({ ...f, page: p })); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      <JobDetailSheet jobId={openId} open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)} onChanged={refresh} />
    </div>
  );
}
