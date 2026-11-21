"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Circle, Loader2, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/utils/fetcher";
import type { Completeness } from "@/lib/profile/completeness";
import { setAutoApply } from "./auto-apply-card";
import type { ProfileView, SettingsData } from "./types";

function Ring({ percent, initials }: { percent: number; initials: string }) {
  const r = 52, c = 2 * Math.PI * r, color = percent >= 100 ? "#22c55e" : percent >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative size-32 shrink-0" role="img" aria-label={`Profile ${percent}% complete`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="7" strokeLinecap="round" stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-3.5 flex items-center justify-center rounded-full bg-muted text-3xl font-semibold text-muted-foreground">{initials}</div>
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border bg-background px-2 py-0.5 text-xs font-semibold" style={{ color }}>{percent}%</span>
    </div>
  );
}

/** Naukri-style profile card: completion ring, what is missing (click to jump to the field) and the auto-apply switch. */
export function ProfileHeader({ profile, settings, onSettings, goProfileTab, onProfile }: { profile: ProfileView | null; settings: SettingsData | null; onSettings: (s: SettingsData) => void; goProfileTab: () => void; onProfile: (v: ProfileView) => void }) {
  const router = useRouter();
  const [comp, setComp] = React.useState<Completeness | null>(null);
  const [gmail, setGmail] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const importFromResume = async () => {
    setImporting(true);
    try {
      const r = await api<{ resumeName: string; engine: string; filled: string[]; nothingNew: boolean; view: ProfileView; completeness: Completeness }>("/api/profile/import-resume", { method: "POST", json: {} });
      onProfile(r.view); setComp(r.completeness);
      if (r.nothingNew) toast.info("Nothing new to fill — your profile already has everything I could read from the resume.");
      else toast.success(`Filled from "${r.resumeName}": ${r.filled.join(", ")}`, { description: "Review the values and click Save profile if you edit anything." });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Import failed";
      if (/upload a resume/i.test(m)) { toast.error(m, { action: { label: "Upload resume", onClick: () => router.push("/resume") } }); } else toast.error(m);
    } finally { setImporting(false); }
  };

  React.useEffect(() => { api<Completeness>("/api/profile/completeness").then(setComp).catch(() => undefined); }, [profile]);
  React.useEffect(() => { api<{ connected?: boolean }>("/api/gmail/status").then((g) => setGmail(!!g.connected)).catch(() => setGmail(false)); }, []);

  const p = profile?.profile;
  const initials = (p?.fullName ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
  const percent = comp?.percent ?? 0;
  const unlocked = !!comp?.complete && gmail === true;
  const on = !!settings?.autoApply.enabled;

  const jump = (item: Completeness["items"][number]) => {
    if (item.tab === "resume") return router.push("/resume");
    goProfileTab();
    setTimeout(() => { const el = document.getElementById(item.fieldId); el?.scrollIntoView({ behavior: "smooth", block: "center" }); (el as HTMLElement | null)?.focus({ preventScroll: true }); }, 120);
  };
  const toggle = async (v: boolean) => {
    setBusy(true);
    try { onSettings(await setAutoApply(v)); toast.success(v ? "Auto-apply on — jobs will be scanned and applied to daily" : "Auto-apply off"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  const missing = comp?.missing ?? [];
  const shown = open ? comp?.items ?? [] : missing;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Ring percent={percent} initials={initials} />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-xl font-semibold">{p?.fullName || "Your name"}</h2>
            <p className="text-sm text-muted-foreground">{[p?.currentTitle, p?.currentCompany && `at ${p.currentCompany}`].filter(Boolean).join(" ") || p?.headline || "Add a headline"}</p>
            <p className="text-sm text-muted-foreground">{[p?.location, p?.yearsExperience != null && `${p.yearsExperience} yr experience`, p?.expectedSalaryMin && `₹${p.expectedSalaryMin.toLocaleString("en-IN")}/mo expected`].filter(Boolean).join(" · ") || "Add location and experience"}</p>
            {comp && !comp.complete && (
              <Button type="button" size="sm" variant="outline" className="mt-2" disabled={importing} onClick={importFromResume}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Fill missing details from my resume
              </Button>
            )}
            <p className="pt-1 text-sm font-medium">{comp?.complete ? "Your profile is complete 🎉" : comp ? `${missing.length} thing${missing.length === 1 ? "" : "s"} left to reach 100%` : "Checking profile…"}</p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:w-72 sm:flex-col sm:items-stretch">
            <div className="flex items-center gap-2"><Rocket className="size-4" /><div><p className="text-sm font-medium">Auto job apply</p><p className="text-xs text-muted-foreground">{unlocked ? (on ? "On — scans & applies daily" : "Off") : comp && !comp.complete ? "Complete your profile to unlock" : gmail === false ? "Connect Gmail to unlock" : "…"}</p></div></div>
            <Switch checked={on} disabled={!unlocked || busy || !settings} onCheckedChange={toggle} aria-label="Enable auto job apply" />
          </div>
        </div>

        {comp && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-sm font-medium">{comp.complete ? "Profile checklist" : "Complete these to reach 100%"}</p>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setOpen((o) => !o)}>{open ? "Show only missing" : "Show all"}</button>
            </div>
            <ul className="divide-y border-t">
              {shown.map((i) => (
                <li key={i.key}>
                  <button type="button" onClick={() => jump(i)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60">
                    {i.done ? <Check className="size-4 shrink-0 text-green-500" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1"><span className={i.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{i.label}</span>{!i.done && <span className="block text-xs text-muted-foreground">{i.hint}</span>}</span>
                    {!i.done && <span className="flex shrink-0 items-center text-xs font-medium text-primary">{i.tab === "resume" ? "Upload" : "Add"}<ChevronRight className="size-3.5" /></span>}
                  </button>
                </li>
              ))}
              {!shown.length && <li className="px-3 py-2 text-sm text-muted-foreground">Nothing missing.</li>}
            </ul>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">Fields live in Settings → <b>Profile</b> (name, phone, headline, summary, location, education, experience, skills, roles, locations, salary, links, projects) and <b>Resume Manager</b> (resume upload). Click Save profile after editing.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
