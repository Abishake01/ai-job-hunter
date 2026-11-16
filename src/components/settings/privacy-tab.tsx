"use client";
import * as React from "react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { Download, Trash2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/utils/fetcher";

export function PrivacyTab() {
  const [exporting, setExporting] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState<null | "data" | "account">(null);
  const ok = confirm === "DELETE";

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/data/export");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `ai-job-hunter-export-${new Date().toISOString().slice(0, 10)}.json` });
      a.click(); URL.revokeObjectURL(url); toast.success("Export downloaded");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); } finally { setExporting(false); }
  }
  async function del(scope: "data" | "account") {
    setBusy(scope);
    try {
      await api("/api/data/delete", { method: "POST", json: { confirm: "DELETE", scope } });
      toast.success(scope === "account" ? "Account deleted" : "All job-hunting data deleted");
      setConfirm("");
      if (scope === "account") await signOut({ callbackUrl: "/login" }); else window.location.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Deletion failed"); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Your data</CardTitle>
          <CardDescription>Everything is scoped to your account. API keys and Gmail tokens are encrypted and never sent to the browser. Only job-related email metadata is stored (no raw message bodies).</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={exportData} disabled={exporting}><Download /> {exporting ? "Preparing…" : "Export all my data (JSON)"}</Button>
          <p className="mt-2 text-xs text-muted-foreground">Includes profile, jobs, contacts, outreach, matches, activity and reports. Secrets and resume file bytes are excluded.</p></CardContent>
      </Card>
      <Card className="ring-destructive/30">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle><CardDescription>These actions cannot be undone. Type DELETE to enable them.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Input aria-label="Type DELETE to confirm" placeholder="Type DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="max-w-xs" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Delete all job data</p>
              <p className="mb-3 text-xs text-muted-foreground">Removes jobs, companies, contacts, outreach, matches, resumes, activity, reports and tasks. Keeps your profile, settings, connected accounts and unsubscribe list.</p>
              <Button variant="destructive" disabled={!ok || busy !== null} onClick={() => del("data")}><Trash2 /> {busy === "data" ? "Deleting…" : "Delete job data"}</Button>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Delete my account</p>
              <p className="mb-3 text-xs text-muted-foreground">Permanently removes everything, including profile and integrations. Gmail access is revoked on a best-effort basis.</p>
              <Button variant="destructive" disabled={!ok || busy !== null} onClick={() => del("account")}><Trash2 /> {busy === "account" ? "Deleting…" : "Delete account"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
