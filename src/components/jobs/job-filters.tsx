"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bookmark, ChevronDown, ChevronUp, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect } from "@/components/settings/form-bits";
import { STATUS_LABELS } from "@/components/common/status-badge";
import type { JobFilters } from "@/lib/jobs/types";
import { sourceLabel } from "@/lib/jobs/format";

interface Saved { id: string; name: string; filters: Record<string, unknown> }
export const DEFAULT_FILTERS: JobFilters = { sort: "newest", active: true, page: 1, pageSize: 20 };
const NUMERIC: (keyof JobFilters)[] = ["minScore", "maxScore", "minSalary", "maxSalary", "maxExperience", "page", "pageSize"];
const BOOLEAN: (keyof JobFilters)[] = ["shortlisted", "active", "fullTimeOnly"];

/** Drop empty values so URLs/queries stay clean. */
export function cleanFilters(f: JobFilters): JobFilters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out as JobFilters;
}
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** Full filter bar + saved searches. `hide` removes controls a page fixes itself (e.g. category on /recommended). */
const locValue = (v: JobFilters) => v.region ? `region:${v.region}` : v.location && !v.workMode ? `city:${v.location}` : v.workMode === "remote" && !v.location && !v.region ? "mode:remote" : "";
const locPatch = (val: string): Partial<JobFilters> => {
  const [k, x] = val.split(":");
  const clear = { region: undefined, location: undefined } as Partial<JobFilters>;
  if (k === "region") return { ...clear, region: x as "india" | "abroad" };
  if (k === "city") return { ...clear, location: x };
  if (k === "mode") return { ...clear, workMode: x };
  return clear;
};

export function JobFiltersBar({ value, onChange, hide = [] }: { value: JobFilters; onChange: (f: JobFilters) => void; hide?: (keyof JobFilters)[] }) {
  const [more, setMore] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState(value.q ?? "");
  const set = (patch: Partial<JobFilters>) => onChange({ ...value, ...patch, page: 1 });
  const show = (k: keyof JobFilters) => !hide.includes(k);

  const loadSaved = useCallback(async () => { try { setSaved((await api<{ items: Saved[] }>("/api/saved-searches")).items); } catch { /* non-fatal */ } }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadSaved();
    Promise.all([
      api<{ items: { key: string; runnable: boolean }[] }>("/api/sources").then((r) => r.items.filter((x) => x.runnable).map((x) => x.key)).catch(() => [] as string[]),
      api<{ sources: { v: string }[] }>("/api/jobs/facets").then((r) => r.sources.map((x) => x.v)).catch(() => [] as string[]),
    ]).then(([a, b]) => setSources([...new Set([...a, ...b, "manual"])]));
  }, [loadSaved]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync controlled input with external filter reset
  useEffect(() => { setQ(value.q ?? ""); }, [value.q]);
  useEffect(() => { const t = setTimeout(() => { if ((value.q ?? "") !== q) onChange({ ...value, q: q || undefined, page: 1 }); }, 350); return () => clearTimeout(t); }); // debounce search

  const applySaved = (id: string) => {
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const f: Record<string, unknown> = { ...DEFAULT_FILTERS };
    for (const [k, v] of Object.entries(s.filters)) f[k] = NUMERIC.includes(k as keyof JobFilters) ? Number(v) : BOOLEAN.includes(k as keyof JobFilters) ? v === true || v === "true" : v;
    onChange({ ...f, page: 1 } as JobFilters);
    toast.success(`Applied “${s.name}”`);
  };
  const saveSearch = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const { page, pageSize, ...f } = cleanFilters(value);
      void page; void pageSize;
      await api("/api/saved-searches", { method: "POST", json: { name: saveName.trim(), filters: f } });
      setSaveName(""); toast.success("Search saved"); loadSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  };
  const removeSaved = async (id: string) => { try { await api(`/api/saved-searches/${id}`, { method: "DELETE" }); loadSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); } };

  const activeCount = Object.entries(cleanFilters(value)).filter(([k]) => !["page", "pageSize", "sort"].includes(k) && !(k === "active" && value.active === true)).length;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search jobs" placeholder="Search title, company, skills, location…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect aria-label="Location" className="w-44" value={locValue(value)} onChange={(e) => set(locPatch(e.target.value))}>
          <option value="">All locations</option>
          <optgroup label="India"><option value="region:india">India (all cities)</option>{["Chennai", "Bengaluru", "Hyderabad", "Pune", "Mumbai", "Delhi", "Gurugram", "Noida", "Kochi", "Coimbatore"].map((c) => <option key={c} value={`city:${c}`}>{c}</option>)}</optgroup>
          <optgroup label="Other"><option value="mode:remote">Remote (anywhere)</option><option value="region:abroad">Outside India</option></optgroup>
        </NativeSelect>
        {show("workMode") && <NativeSelect aria-label="Work mode" className="w-32" value={value.workMode ?? ""} onChange={(e) => set({ workMode: e.target.value || undefined })}><option value="">Any mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></NativeSelect>}
        {show("source") && <NativeSelect aria-label="Source" className="w-36" value={value.source ?? ""} onChange={(e) => set({ source: e.target.value || undefined })}><option value="">All sources</option>{sources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}</NativeSelect>}
        <NativeSelect aria-label="Sort" className="w-40" value={value.sort ?? "newest"} onChange={(e) => set({ sort: e.target.value as JobFilters["sort"] })}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score">Best match</option><option value="salary">Highest salary</option><option value="company">Company A–Z</option>
        </NativeSelect>
        <Button variant="outline" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}Filters{activeCount > 0 && ` (${activeCount})`}</Button>
        {activeCount > 0 && <Button variant="ghost" onClick={() => { setQ(""); onChange({ ...DEFAULT_FILTERS, sort: value.sort, pageSize: value.pageSize, ...Object.fromEntries(hide.map((k) => [k, value[k]])) }); }}><X className="size-4" />Clear</Button>}
      </div>

      {more && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Company" htmlFor="f-company"><Input id="f-company" value={value.company ?? ""} onChange={(e) => set({ company: e.target.value || undefined })} /></Field>
          <Field label="Location" htmlFor="f-loc"><Input id="f-loc" value={value.location ?? ""} onChange={(e) => set({ location: e.target.value || undefined })} /></Field>
          {show("status") && <Field label="Status" htmlFor="f-status"><NativeSelect id="f-status" value={value.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })}><option value="">Any status</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>}
          {show("jobType") && <Field label="Job type" htmlFor="f-jt"><NativeSelect id="f-jt" value={value.jobType ?? ""} onChange={(e) => set({ jobType: e.target.value || undefined })}><option value="">Any type</option><option value="full_time">Full-time</option><option value="internship">Internship</option><option value="contract">Contract</option><option value="part_time">Part-time</option></NativeSelect></Field>}
          {show("category") && <Field label="Match category" htmlFor="f-cat"><NativeSelect id="f-cat" value={value.category ?? ""} onChange={(e) => set({ category: (e.target.value || undefined) as JobFilters["category"] })}><option value="">Any</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="low">Low</option></NativeSelect></Field>}
          <Field label="Match score (min – max)"><div className="flex gap-2"><Input aria-label="Minimum score" inputMode="numeric" placeholder="0" value={value.minScore ?? ""} onChange={(e) => set({ minScore: num(e.target.value) })} /><Input aria-label="Maximum score" inputMode="numeric" placeholder="100" value={value.maxScore ?? ""} onChange={(e) => set({ maxScore: num(e.target.value) })} /></div></Field>
          <Field label="Monthly salary (min – max)" hint="Jobs with unknown salary are hidden when set."><div className="flex gap-2"><Input aria-label="Minimum salary" inputMode="numeric" placeholder="45000" value={value.minSalary ?? ""} onChange={(e) => set({ minSalary: num(e.target.value) })} /><Input aria-label="Maximum salary" inputMode="numeric" placeholder="60000" value={value.maxSalary ?? ""} onChange={(e) => set({ maxSalary: num(e.target.value) })} /></div></Field>
          <Field label="Max experience required (yrs)" hint="Unknown experience is kept."><Input aria-label="Maximum experience" inputMode="decimal" value={value.maxExperience ?? ""} onChange={(e) => set({ maxExperience: num(e.target.value) })} /></Field>
          <Field label="Posted after" htmlFor="f-pa"><Input id="f-pa" type="date" value={value.postedAfter?.slice(0, 10) ?? ""} onChange={(e) => set({ postedAfter: e.target.value || undefined })} /></Field>
          <Field label="Posted before" htmlFor="f-pb"><Input id="f-pb" type="date" value={value.postedBefore?.slice(0, 10) ?? ""} onChange={(e) => set({ postedBefore: e.target.value ? e.target.value + "T23:59:59" : undefined })} /></Field>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <Label className="flex items-center gap-2 font-normal"><Checkbox checked={value.shortlisted === true} onCheckedChange={(c) => set({ shortlisted: c ? true : undefined })} />Shortlisted only</Label>
            <Label className="flex items-center gap-2 font-normal"><Checkbox checked={value.active === true} onCheckedChange={(c) => set({ active: c ? true : undefined })} />Hide closed listings</Label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
        <Bookmark className="size-4 text-muted-foreground" aria-hidden />
        <NativeSelect aria-label="Saved searches" className="w-48" value="" onChange={(e) => e.target.value && applySaved(e.target.value)}>
          <option value="">{saved.length ? "Saved searches…" : "No saved searches"}</option>{saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
        <Input aria-label="Name for this search" className="h-8 w-44" placeholder="Name this search" value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveSearch()} />
        <Button size="sm" variant="outline" onClick={saveSearch} disabled={!saveName.trim() || saving}>Save search</Button>
        {saved.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {saved.map((s) => <span key={s.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">{s.name}<button type="button" aria-label={`Delete saved search ${s.name}`} onClick={() => removeSaved(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button></span>)}
          </span>
        )}
      </div>
    </div>
  );
}
export { JobFiltersBar as JobFilters };
