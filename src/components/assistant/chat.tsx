"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Bot, Loader2, Send, User } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { SUGGESTED_COMMANDS } from "@/lib/services/assistant.logic";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScoreBadge } from "@/components/common/score-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { TaskProgress } from "@/components/dashboard/task-progress";
import type { AssistantResponse } from "@/lib/services/assistant.service";

type Msg = { role: "user"; text: string } | { role: "assistant"; res: AssistantResponse };

/** Minimal safe markdown: **bold**, _italic_, "- " bullets. No HTML injection (React text nodes only). */
function Md({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : p);
  return <div className="space-y-1">{text.split("\n").map((l, i) => l.startsWith("- ") ? <p key={i} className="pl-4 -indent-3">• {inline(l.slice(2))}</p> : l.trim() ? <p key={i}>{inline(l)}</p> : <div key={i} className="h-1" />)}</div>;
}

export function AssistantChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setMsgs((m) => [...m, { role: "user", text: t }]); setInput(""); setBusy(true);
    try { const res = await api<AssistantResponse>("/api/assistant/chat", { method: "POST", json: { message: t } }); setMsgs((m) => [...m, { role: "assistant", res }]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Assistant failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-3xl flex-col">
      <PageHeader title="AI Assistant" description="Ask about your jobs, contacts and follow-ups. Works without an LLM key (keyword routing); with one, requests are understood more flexibly. It only drafts emails." />
      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border p-4" aria-live="polite">
        {msgs.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground"><Bot className="mx-auto mb-2 size-8" />Try one of the suggestions below.</div>}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end gap-2"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</div><User className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden /></div>
        ) : (
          <div key={i} className="flex gap-2"><Bot className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
              <Md text={m.res.reply} />
              {m.res.jobs && m.res.jobs.length > 0 && <ul className="space-y-1.5">{m.res.jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2"><span className="min-w-0"><span className="block truncate font-medium">{j.title}</span><span className="text-xs text-muted-foreground">{j.company} · {j.location ?? "Unknown"}</span></span>
                  <span className="flex shrink-0 items-center gap-1.5"><StatusBadge status={j.status} /><ScoreBadge score={j.score} />{j.applyUrl && <a className="text-xs underline" href={j.applyUrl} target="_blank" rel="noopener noreferrer">Apply</a>}</span></li>))}</ul>}
              {m.res.contacts && m.res.contacts.length > 0 && <ul className="space-y-1.5">{m.res.contacts.map((c) => (
                <li key={c.id} className="rounded-lg border bg-card p-2"><p className="font-medium">{c.name ?? "Name unknown"}{c.designation ? ` · ${c.designation}` : ""}</p><p className="text-xs text-muted-foreground">{c.company} · {c.email ?? "email unknown"} · {c.verification}{c.sourceUrl && <> · <a className="underline" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">source</a></>}</p></li>))}</ul>}
              {m.res.email && <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Draft · To: {m.res.email.toEmail ?? "no recipient yet"}</p><p className="font-medium">{m.res.email.subject}</p><pre className="mt-1 whitespace-pre-wrap font-sans text-xs">{m.res.email.body}</pre></div>}
              {m.res.actions.map((a, k) => a.taskId ? <TaskProgress key={k} taskId={a.taskId} label={a.label} /> : a.href ? <Link key={k} href={a.href} className="mr-2 inline-block text-xs underline underline-offset-4">{a.label}</Link> : null)}
              <p className="text-[10px] text-muted-foreground">{m.res.tool ? `${m.res.tool} · ${m.res.engine === "llm" ? "AI-routed" : "keyword-routed"}` : "no matching tool"}</p>
            </div></div>))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Thinking…</p>}
        <div ref={end} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{SUGGESTED_COMMANDS.map((c) => <button key={c} type="button" onClick={() => send(c)} disabled={busy} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">{c}</button>)}</div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about your job hunt…" aria-label="Message" maxLength={1000} />
        <Button type="submit" disabled={busy || !input.trim()}><Send className="size-4" /><span className="sr-only">Send</span></Button>
      </form>
    </div>
  );
}
