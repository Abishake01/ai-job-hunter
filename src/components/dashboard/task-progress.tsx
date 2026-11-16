"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, MinusCircle, RotateCw } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";

type Step = { name: string; status: string; detail?: string; at: string };
export type TaskDto = { id: string; type: string; status: string; steps: Step[]; error: string | null; attempts: number; maxAttempts: number; result: Record<string, unknown> | null };

/** Polls /api/tasks/[id] every 2s until the task reaches a terminal state. Task survives page reloads server-side. */
export function TaskProgress({ taskId, onDone, label }: { taskId: string; onDone?: (t: TaskDto) => void; label?: string }) {
  const [task, setTask] = useState<TaskDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const { task: t } = await api<{ task: TaskDto }>(`/api/tasks/${taskId}`);
        if (stop) return;
        setTask(t);
        if (["succeeded", "failed", "cancelled"].includes(t.status)) { done.current?.(t); return; }
      } catch (e) { if (!stop) setErr(e instanceof Error ? e.message : "Failed to load task"); }
      timer = setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [taskId]);

  const retry = async () => { try { await api(`/api/tasks/${taskId}`, { method: "POST", json: { action: "retry" } }); window.location.reload(); } catch (e) { setErr(e instanceof Error ? e.message : "Retry failed"); } };
  if (err && !task) return <p className="text-sm text-destructive" role="alert">{err}</p>;
  if (!task) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Starting…</p>;
  const running = task.status === "queued" || task.status === "running";
  const steps = task.steps.filter((s) => !s.name.startsWith("attempt"));
  return (
    <div className="rounded-lg border p-3 text-sm" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          {running ? <Loader2 className="size-4 animate-spin" /> : task.status === "succeeded" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleAlert className="size-4 text-destructive" />}
          {label ?? task.type.replace(/_/g, " ")} · {task.status}{task.attempts > 1 ? ` (attempt ${task.attempts}/${task.maxAttempts})` : ""}
        </span>
        {task.status === "failed" && <Button size="sm" variant="outline" onClick={retry}><RotateCw className="size-3" /> Retry</Button>}
      </div>
      <ul className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-muted-foreground">
            {s.status === "failed" ? <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" /> : s.status === "skipped" ? <MinusCircle className="mt-0.5 size-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />}
            <span><span className="font-medium text-foreground">{s.name}</span>{s.detail ? ` — ${s.detail}` : ""}</span>
          </li>
        ))}
        {running && steps.length === 0 && <li className="text-muted-foreground">Waiting for the first step…</li>}
      </ul>
      {task.error && <p className="mt-2 text-destructive">{task.error}</p>}
    </div>
  );
}
