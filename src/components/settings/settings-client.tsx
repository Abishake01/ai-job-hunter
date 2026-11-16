"use client";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/utils/fetcher";
import { DiscoveryPanel } from "@/components/settings/discovery-panel";
import { GmailPanel } from "@/components/settings/gmail-panel";
import { ProfileTab } from "./profile-tab";
import { MatchingTab } from "./matching-tab";
import { LlmTab } from "./llm-tab";
import { WorkflowTab } from "./workflow-tab";
import { VerificationTab } from "./verification-tab";
import { PrivacyTab } from "./privacy-tab";
import { ErrorBlock, TabSkeleton } from "./form-bits";
import type { ProfileView, SettingsData } from "./types";

const TABS = [
  ["profile", "Profile"], ["matching", "Matching"], ["ai", "AI provider"], ["discovery", "Discovery"], ["gmail", "Gmail"],
  ["workflow", "Daily workflow"], ["verification", "Email verification"], ["privacy", "Privacy"],
] as const;

export function SettingsClient() {
  const [profile, setProfile] = React.useState<ProfileView | null>(null);
  const [settings, setSettings] = React.useState<SettingsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<string>("profile");

  const load = React.useCallback(async () => {
    setError(null);
    try { const [p, s] = await Promise.all([api<ProfileView>("/api/profile"), api<SettingsData>("/api/settings")]); setProfile(p); setSettings(s); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load settings"); }
  }, []);
  React.useEffect(() => {
    load();
    const h = window.location.hash.slice(1);
    if (TABS.some(([k]) => k === h)) setTab(h);
  }, [load]);

  const needsData = ["profile", "matching", "workflow"].includes(tab);
  const loaded = profile && settings;

  return (
    <Tabs value={tab} onValueChange={(v) => { setTab(String(v)); history.replaceState(null, "", `#${v}`); }}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="h-auto w-max min-w-full flex-nowrap">{TABS.map(([k, label]) => <TabsTrigger key={k} value={k} className="px-3 py-1.5">{label}</TabsTrigger>)}</TabsList>
      </div>
      <div className="mt-4">
        {needsData && (error ? <ErrorBlock message={error} onRetry={load} /> : !loaded ? <TabSkeleton /> : null)}
        <TabsContent value="profile">{loaded && <ProfileTab data={profile} onSaved={setProfile} />}</TabsContent>
        <TabsContent value="matching">{loaded && <MatchingTab settings={settings} onSaved={setSettings} />}</TabsContent>
        <TabsContent value="ai"><LlmTab /></TabsContent>
        <TabsContent value="discovery"><DiscoveryPanel /></TabsContent>
        <TabsContent value="gmail"><GmailPanel /></TabsContent>
        <TabsContent value="workflow">{loaded && <WorkflowTab settings={settings} onSaved={setSettings} />}</TabsContent>
        <TabsContent value="verification"><VerificationTab /></TabsContent>
        <TabsContent value="privacy"><PrivacyTab /></TabsContent>
      </div>
    </Tabs>
  );
}
