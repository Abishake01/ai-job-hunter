"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/utils/fetcher";
import type { SourceInfo } from "@/lib/jobs/types";
import { Field, NativeSelect, TagInput } from "./form-bits";
import type { SettingsData } from "./types";

type Board = { ats: "greenhouse" | "lever" | "ashby"; slug: string; name?: string };
type Disc = { enabledSources: string[]; disabledSources: string[]; keywords: string[]; country: string; companyBoards: Board[]; rssFeeds: { name: string; url: string }[]; maxAgeDays: number; abroadRemoteOnly: boolean; useCuratedBoards: boolean };
type Keys = { adzuna: { configured: boolean; appId: string | null }; jooble: { configured: boolean } };

/** Detects ATS + slug from a pasted careers URL (boards.greenhouse.io/x, jobs.lever.co/x, jobs.ashbyhq.com/x). */
export function parseBoardUrl(raw: string): Board | null {
  try {
    const u = new URL(raw.trim());
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (!seg) return null;
    if (/greenhouse\.io$/.test(u.hostname)) return { ats: "greenhouse", slug: seg };
    if (/lever\.co$/.test(u.hostname)) return { ats: "lever", slug: seg };
    if (/ashbyhq\.com$/.test(u.hostname)) return { ats: "ashby", slug: seg };
  } catch { /* not a URL */ }
  return null;
}

export function DiscoveryPanel() {
  const [sources, setSources] = React.useState<SourceInfo[] | null>(null);
  const [d, setD] = React.useState<Disc | null>(null);
  const [keys, setKeys] = React.useState<Keys | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [board, setBoard] = React.useState("");
  const [az, setAz] = React.useState({ appId: "", appKey: "" });
  const [jb, setJb] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const [s, st, k] = await Promise.all([api<{ items: SourceInfo[] }>("/api/sources"), api<SettingsData>("/api/settings"), api<Keys>("/api/integrations/discovery-keys")]);
      setSources(s.items); setD(st.discovery as unknown as Disc); setKeys(k);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load"); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const patch = async (p: Partial<Disc>, msg = "Saved") => {
    setSaving(true);
    try { const st = await api<SettingsData>("/api/settings", { method: "PATCH", json: { discovery: p } }); setD(st.discovery as unknown as Disc); setSources((await api<{ items: SourceInfo[] }>("/api/sources")).items); toast.success(msg); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setSaving(false); }
  };
  const toggle = (key: string, on: boolean) => { if (!d) return; const enabled = on ? [...new Set([...d.enabledSources, key])] : d.enabledSources.filter((k) => k !== key); const disabled = on ? d.disabledSources.filter((k) => k !== key) : [...new Set([...d.disabledSources, key])]; return patch({ enabledSources: enabled, disabledSources: disabled }); };
  const saveKey = async (body: unknown, ok: string) => { try { await api("/api/integrations/discovery-keys", { method: "PUT", json: body }); toast.success(ok); setAz({ appId: "", appKey: "" }); setJb(""); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save key"); } };
  const addBoard = () => {
    if (!d) return; const b = parseBoardUrl(board);
    if (!b) return toast.error("Paste a careers link like boards.greenhouse.io/company, jobs.lever.co/company or jobs.ashbyhq.com/company");
    if (d.companyBoards.some((x) => x.ats === b.ats && x.slug.toLowerCase() === b.slug.toLowerCase())) return toast.info("Already added");
    setBoard(""); patch({ companyBoards: [...d.companyBoards, b] }, `Added ${b.slug} (${b.ats})`);
  };

  if (err) return <p className="text-sm text-destructive">{err} <Button variant="link" onClick={load}>Retry</Button></p>;
  if (!sources || !d || !keys) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>;
  const runnable = sources.filter((s) => s.runnable), alerts = sources.filter((s) => !s.runnable);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Job sources</CardTitle><CardDescription>Search terms come from your profile (target roles + skills), so updating your profile changes what is searched. Sources that need a key or boards say so below.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {runnable.map((s) => (
            <div key={s.key} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{s.label}
                  {!s.configured && <Badge variant="outline">Needs setup</Badge>}
                  {s.health?.lastStatus === "error" && <Badge variant="destructive">Last run failed</Badge>}
                  {s.health && s.health.lastStatus === "ok" && <Badge variant="secondary">{s.health.lastFetched ?? 0} fetched · {s.health.lastNew ?? 0} new</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{s.configNote ?? s.compliance}</p>
              </div>
              <Switch checked={s.enabled} disabled={saving} onCheckedChange={(v) => toggle(s.key, v)} aria-label={`Enable ${s.label}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>API keys (free)</CardTitle><CardDescription>Adzuna and Jooble have the best India coverage. Keys are stored encrypted and never shown again.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium">Adzuna {keys.adzuna.configured && <Badge variant="secondary">Connected{keys.adzuna.appId ? ` (${keys.adzuna.appId})` : ""}</Badge>} <a className="text-xs text-muted-foreground underline" href="https://developer.adzuna.com" target="_blank" rel="noreferrer">get free key</a></p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input placeholder="App ID" value={az.appId} onChange={(e) => setAz({ ...az, appId: e.target.value })} /><Input placeholder="App key" type="password" value={az.appKey} onChange={(e) => setAz({ ...az, appKey: e.target.value })} /><Button disabled={!az.appId || !az.appKey} onClick={() => saveKey({ provider: "adzuna", ...az }, "Adzuna key saved")}>Save</Button></div></div>
          <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium">Jooble {keys.jooble.configured && <Badge variant="secondary">Connected</Badge>} <a className="text-xs text-muted-foreground underline" href="https://jooble.org/api/about" target="_blank" rel="noreferrer">get free key</a></p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input placeholder="API key" type="password" value={jb} onChange={(e) => setJb(e.target.value)} /><Button disabled={!jb} onClick={() => saveKey({ provider: "jooble", apiKey: jb }, "Jooble key saved")}>Save</Button></div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Company career pages</CardTitle><CardDescription>Paste a company&apos;s careers link (Greenhouse, Lever or Ashby) to scan its openings directly. A built-in list of India-hiring companies is included.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2"><Input placeholder="https://jobs.lever.co/company" value={board} onChange={(e) => setBoard(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBoard()} /><Button onClick={addBoard} disabled={saving}><Plus className="size-4" /> Add</Button></div>
          <div className="flex flex-wrap gap-1.5">{d.companyBoards.map((b) => <Badge key={`${b.ats}:${b.slug}`} variant="secondary" className="gap-1 pr-1">{b.name ?? b.slug} · {b.ats}<button type="button" aria-label={`Remove ${b.slug}`} className="rounded-sm p-0.5 hover:bg-foreground/10" onClick={() => patch({ companyBoards: d.companyBoards.filter((x) => x !== b) })}><X className="size-3" /></button></Badge>)}{!d.companyBoards.length && <p className="text-xs text-muted-foreground">No custom boards yet.</p>}</div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3"><p className="text-sm">Also scan the built-in company list</p><Switch checked={d.useCuratedBoards} onCheckedChange={(v) => patch({ useCuratedBoards: v })} aria-label="Use built-in boards" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Search preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Extra keywords" hint="Added to the terms derived from your profile."><TagInput value={d.keywords} onChange={(v) => setD({ ...d, keywords: v })} placeholder="e.g. django developer" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max job age (days)" htmlFor="age"><Input id="age" type="number" min={1} max={90} value={d.maxAgeDays} onChange={(e) => setD({ ...d, maxAgeDays: Number(e.target.value) })} /></Field>
            <Field label="Country (Adzuna)" htmlFor="country"><NativeSelect id="country" value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })}>{["in", "us", "gb", "ca", "au", "sg", "de"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</NativeSelect></Field>
            <div className="flex items-end justify-between gap-3 rounded-lg border p-3"><p className="text-sm">Abroad: remote only</p><Switch checked={d.abroadRemoteOnly} onCheckedChange={(v) => setD({ ...d, abroadRemoteOnly: v })} aria-label="Abroad remote only" /></div>
          </div>
          <div className="flex justify-end"><Button disabled={saving} onClick={() => patch({ keywords: d.keywords, maxAgeDays: Math.min(90, Math.max(1, d.maxAgeDays || 30)), country: d.country, abroadRemoteOnly: d.abroadRemoteOnly }, "Search preferences saved")}>Save preferences</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>LinkedIn, Naukri, Indeed and others</CardTitle><CardDescription>These sites forbid scraping, so jobs come from their email job alerts via Gmail, or Add Job / Import URL.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">{alerts.map((s) => <Badge key={s.key} variant="outline" title={s.compliance}>{s.label}</Badge>)}</CardContent>
      </Card>
    </div>
  );
}
