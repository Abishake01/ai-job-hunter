"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Radar } from "lucide-react";
import { api } from "@/lib/utils/fetcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskProgress, type TaskDto } from "@/components/dashboard/task-progress";

interface DiscoverySummary { fetched?: number; new?: number; duplicates?: number; expired?: number; perSource?: Record<string, { status: string; message?: string }> }

/** Queues a discovery task via /api/discovery/scan and shows live progress. */
export function ScanNowButton({ onDone, variant = "outline", sources }: { onDone?: () => void; variant?: "default" | "outline"; sources?: string[] }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);

  const start = async () => {
    setStarting(true); setSummary(null);
    try {
      const r = await api<{ taskId: string }>("/api/discovery/scan", { method: "POST", json: sources ? { sources } : {} });
      setTaskId(r.taskId); setOpen(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not start scan"); }
    finally { setStarting(false); }
  };
  const finished = (t: TaskDto) => {
    const d = (t.result as { discovery?: DiscoverySummary } | null)?.discovery ?? null;
    setSummary(d);
    if (t.status === "succeeded") { toast.success(d ? `Scan complete: ${d.new ?? 0} new, ${d.duplicates ?? 0} duplicates` : "Scan complete"); onDone?.(); }
    else toast.error(t.error ?? "Scan failed");
  };

  return (
    <>
      <Button variant={variant} onClick={start} disabled={starting}>{starting ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}Scan Now</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Job scan</DialogTitle>
            <DialogDescription>Fetching from your enabled sources (public APIs and company boards only).</DialogDescription>
          </DialogHeader>
          {taskId && <TaskProgress taskId={taskId} label="Job scan" onDone={finished} />}
          {summary && (
            <div className="space-y-1 text-sm">
              <p><b>{summary.fetched ?? 0}</b> fetched · <b>{summary.new ?? 0}</b> new · <b>{summary.duplicates ?? 0}</b> duplicates · <b>{summary.expired ?? 0}</b> closed</p>
              <ul className="text-muted-foreground">
                {Object.entries(summary.perSource ?? {}).map(([k, v]) => <li key={k}>{k}: {v.status}{v.message ? ` — ${v.message}` : ""}</li>)}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
