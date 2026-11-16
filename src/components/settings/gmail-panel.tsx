"use client";
import * as React from "react";
import { toast } from "sonner";
import { Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, qs } from "@/lib/utils/fetcher";
import { selectCls } from "@/components/outreach/shared";

type Status = {
  configured: boolean; redirectUri: string; connected: boolean; needsReauth: boolean; accountEmail: string | null; scopes: string[]; classifiedMessages: number;
  history: { id: string; startedAt: string; status: string; scanned: number; relevant: number; jobsCreated: number; error: string | null }[];
};
type Msg = { id: string; category: string; subject: string | null; fromAddress: string | null; snippet: string | null; receivedAt: string | null; jobTitle: string | null; companyName: string | null };
const CATS = ["job_alert", "recruiter_message", "interview_invite", "application_ack", "rejection", "selection", "follow_up"];

export function GmailPanel() {
  const [s, setS] = React.useState<Status | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[] | null>(null);
  const [cat, setCat] = React.useState("");
  const [days, setDays] = React.useState(14);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const st = await api<Status>("/api/gmail/status"); setS(st);
      if (st.connected || st.classifiedMessages > 0) setMsgs((await api<{ items: Msg[] }>(`/api/gmail/messages${qs({ category: cat, pageSize: 15 })}`)).items);
    } catch (e) { setError((e as Error).message); }
  }, [cat]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("gmail") === "connected") toast.success("Gmail connected");
    else if (p.get("gmail") === "error") toast.error(`Gmail connection failed: ${p.get("reason") ?? "unknown error"}`);
  }, []);

  async function sync() {
    setBusy(true);
    try {
      const r = await api<{ scanned: number; relevant: number; jobsCreated: number; statusUpdates: number; errors: string[] }>("/api/gmail/sync", { method: "POST", json: { days } });
      toast.success(`Scanned ${r.scanned}, ${r.relevant} job-related, ${r.jobsCreated} new job(s), ${r.statusUpdates} status update(s)`);
      if (r.errors.length) toast.warning(`${r.errors.length} message(s) had errors`);
      await load();
    } catch (e) { toast.error((e as Error).message); await load(); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!confirm("Disconnect Gmail? Access is revoked at Google and stored tokens are deleted.")) return;
    try { await api("/api/gmail/disconnect", { method: "POST" }); toast.success("Gmail disconnected"); await load(); } catch (e) { toast.error((e as Error).message); }
  }

  if (error) return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error} <Button size="sm" variant="outline" className="ml-2" onClick={load}>Retry</Button></div>;
  if (!s) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Mail className="size-5" /><div><p className="font-medium">Gmail</p><p className="text-sm text-muted-foreground">{s.connected ? `Connected as ${s.accountEmail ?? "your account"}` : s.needsReauth ? "Connection expired: reconnect" : "Not connected"}</p></div></div>
          <div className="flex gap-2">
            {s.connected ? <Button variant="outline" onClick={disconnect}>Disconnect</Button> : <Button disabled={!s.configured} nativeButton={false} render={<a href="/api/gmail/connect" />}>{s.needsReauth ? "Reconnect Gmail" : "Connect Gmail"}</Button>}
          </div>
        </div>
        {!s.configured && <p className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">Google OAuth is not configured on the server (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET). In Google Cloud, enable the Gmail API and add the redirect URI <code>{s.redirectUri}</code>.</p>}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li><b>Read</b> (gmail.readonly): only mail matching job-search queries (job-board senders, interview/application/offer/rejection keywords, replies from people you emailed) is processed. Only subject, sender, a short snippet and extracted fields are stored; message bodies are never saved.</li>
          <li><b>Compose</b> (gmail.compose): creates drafts in your Gmail. Nothing is sent by this.</li>
          <li><b>Send</b> (gmail.send): used only when you approve and confirm a single email on the Email Outreach page.</li>
        </ul>
        {s.connected && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <label className="text-sm" htmlFor="gm-days">Look back</label>
            <select id="gm-days" className={selectCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[3, 7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
            <Button onClick={sync} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} /> {busy ? "Syncing…" : "Sync now"}</Button>
          </div>
        )}
      </div>

      {s.history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent syncs</h3>
          <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">When</th><th className="p-2">Status</th><th className="p-2">Scanned</th><th className="p-2">Job-related</th><th className="p-2">New jobs</th><th className="p-2">Notes</th></tr></thead>
            <tbody>{s.history.map((h) => <tr key={h.id} className="border-t"><td className="p-2 whitespace-nowrap">{new Date(h.startedAt).toLocaleString()}</td><td className="p-2"><Badge variant={h.status === "ok" ? "secondary" : h.status === "error" ? "destructive" : "outline"}>{h.status}</Badge></td><td className="p-2">{h.scanned}</td><td className="p-2">{h.relevant}</td><td className="p-2">{h.jobsCreated}</td><td className="max-w-xs truncate p-2 text-xs text-muted-foreground" title={h.error ?? ""}>{h.error ?? ""}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {msgs && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Classified messages ({s.classifiedMessages})</h3>
            <select className={selectCls} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category filter"><option value="">All categories</option>{CATS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
          {msgs.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet. Run a sync.</p> : (
            <ul className="space-y-1.5">{msgs.map((m) => (
              <li key={m.id} className="rounded-lg border p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="truncate font-medium">{m.subject || "(no subject)"}</span><Badge variant="outline">{m.category.replace(/_/g, " ")}</Badge></div>
                <p className="truncate text-xs text-muted-foreground">{m.fromAddress} · {m.receivedAt ? new Date(m.receivedAt).toLocaleDateString() : ""}{m.companyName ? ` · ${m.companyName}` : ""}{m.jobTitle ? ` · ${m.jobTitle}` : ""}</p>
                {m.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.snippet}</p>}
              </li>))}</ul>
          )}
        </div>
      )}
    </div>
  );
}
