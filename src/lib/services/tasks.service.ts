import "server-only";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentTasks } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { backoffMs, STALE_RUNNING_MS } from "./tasks.logic";

export type TaskRow = typeof agentTasks.$inferSelect;
export type TaskStep = { name: string; status: string; detail?: string; at: string };
export type TaskCtx = {
  userId: string; taskId: string; payload: Record<string, unknown>; attempt: number;
  /** Runs fn as a recorded step. Failure is recorded and rethrown unless `isolate` is true (then returns undefined). */
  step: <T>(name: string, fn: () => Promise<T>, opts?: { isolate?: boolean; detail?: (r: T) => string | undefined }) => Promise<T | undefined>;
};
type Handler = (ctx: TaskCtx) => Promise<Record<string, unknown>>;

export const TASK_TYPES = ["discover_jobs", "sync_gmail", "daily_workflow", "match_jobs", "find_contacts", "detect_followups"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

const handlers: Record<string, () => Promise<Handler>> = {
  discover_jobs: async () => {
    const { runDiscovery } = await import("@/lib/services/discovery.service");
    return async (c) => ({ discovery: await c.step("discover", () => runDiscovery(c.userId, { sources: c.payload.sources as string[] | undefined })) });
  },
  sync_gmail: async () => {
    const { syncGmail } = await import("@/lib/services/gmail.service");
    return async (c) => ({ sync: await c.step("sync_gmail", () => syncGmail(c.userId, { days: c.payload.days as number | undefined })) });
  },
  match_jobs: async () => {
    const { matchJobs } = await import("@/lib/services/matching.service");
    return async (c) => ({ match: await c.step("match", () => matchJobs(c.userId, { onlyUnmatched: c.payload.onlyUnmatched !== false, limit: c.payload.limit as number | undefined })) });
  },
  find_contacts: async () => {
    const { findContactsForJob } = await import("@/lib/services/recruiter.service");
    return async (c) => ({ contacts: await c.step("find_contacts", () => findContactsForJob(c.userId, String(c.payload.jobId))) as unknown });
  },
  detect_followups: async () => {
    const { detectFollowUps } = await import("@/lib/services/application.service");
    return async (c) => ({ followUps: await c.step("detect_followups", () => detectFollowUps(c.userId)) });
  },
  daily_workflow: async () => {
    const { runDailyWorkflow } = await import("@/lib/services/workflow.service");
    return async (c) => ({ workflow: await runDailyWorkflow(c.userId, { onStep: (s) => c.step(s.name, async () => s, { detail: () => s.detail }) }) });
  },
};

export function inngestEnabled() { return !!(process.env.INNGEST_EVENT_KEY || process.env.INNGEST_SIGNING_KEY); }

export type EnqueueOpts = { idempotencyKey?: string; maxAttempts?: number; scheduledFor?: Date; /** default true: dispatch execution (after()/Inngest). */ run?: boolean };

/**
 * Creates a durable agent_tasks row. If `idempotencyKey` already exists for this user, returns the existing task (no duplicate).
 * Execution is dispatched out-of-band (Inngest when configured, otherwise Next `after()`), so it never depends on the request staying open.
 */
export async function enqueueTask(userId: string, type: string, payload: Record<string, unknown> = {}, opts: EnqueueOpts = {}): Promise<{ taskId: string; created: boolean; status: string }> {
  if (!handlers[type]) throw new HttpError(400, `Unknown task type "${type}"`);
  const key = opts.idempotencyKey ? `${userId}:${opts.idempotencyKey}` : null;
  const [row] = await db.insert(agentTasks).values({ userId, type, payload, idempotencyKey: key, maxAttempts: opts.maxAttempts ?? 3, scheduledFor: opts.scheduledFor ?? new Date() }).onConflictDoNothing({ target: agentTasks.idempotencyKey }).returning();
  if (!row) {
    const [existing] = await db.select().from(agentTasks).where(eq(agentTasks.idempotencyKey, key!));
    return { taskId: existing.id, created: false, status: existing.status };
  }
  if (opts.run !== false) await dispatchTask(row.id);
  return { taskId: row.id, created: true, status: row.status };
}

export async function dispatchTask(taskId: string) {
  if (inngestEnabled()) {
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({ name: "app/task.run", data: { taskId } });
      return;
    } catch (e) { console.error("[tasks] inngest dispatch failed, falling back to after()", e); }
  }
  const run = () => runTask(taskId).catch((e) => console.error("[tasks] run failed", e));
  try {
    const { after } = await import("next/server");
    after(run);
  } catch { void run(); }
}

async function appendStep(taskId: string, steps: TaskStep[]) {
  await db.update(agentTasks).set({ steps }).where(eq(agentTasks.id, taskId));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Claims and executes a task with retries + backoff. Safe to call twice (atomic claim). Stale "running" tasks (crashed runner) are re-claimable.
 */
export async function runTask(taskId: string, opts: { backoffBaseMs?: number } = {}): Promise<TaskRow | null> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const [claimed] = await db.update(agentTasks).set({ status: "running", startedAt: new Date(), error: null })
    .where(and(eq(agentTasks.id, taskId), or(eq(agentTasks.status, "queued"), and(eq(agentTasks.status, "running"), lt(agentTasks.startedAt, staleBefore))))).returning();
  if (!claimed) return null;
  const loader = handlers[claimed.type];
  const steps: TaskStep[] = Array.isArray(claimed.steps) ? [...claimed.steps] : [];
  const rec = async (name: string, status: string, detail?: string) => { steps.push({ name, status, detail, at: new Date().toISOString() }); await appendStep(taskId, steps); };
  let attempts = claimed.attempts;
  let lastErr = "";
  while (attempts < claimed.maxAttempts) {
    attempts++;
    await db.update(agentTasks).set({ attempts, status: "running" }).where(eq(agentTasks.id, taskId));
    await rec(`attempt ${attempts}`, "running");
    try {
      if (!claimed.userId) throw new Error("Task has no user");
      const handler = await loader();
      const ctx: TaskCtx = {
        userId: claimed.userId, taskId, payload: claimed.payload, attempt: attempts,
        step: async (name, fn, o) => {
          try {
            const r = await fn();
            const st = (r as { status?: string } | undefined)?.status;
            await rec(name, st === "failed" || st === "skipped" ? st : "ok", o?.detail?.(r) ?? summarize(r));
            return r;
          } catch (e) {
            await rec(name, "failed", msg(e));
            if (o?.isolate) return undefined;
            throw e;
          }
        },
      };
      const result = await handler(ctx);
      const [done] = await db.update(agentTasks).set({ status: "succeeded", result: JSON.parse(JSON.stringify(result ?? {})), finishedAt: new Date(), error: null }).where(eq(agentTasks.id, taskId)).returning();
      return done;
    } catch (e) {
      lastErr = msg(e);
      await rec(`attempt ${attempts}`, "failed", lastErr);
      if (attempts < claimed.maxAttempts) await sleep(backoffMs(attempts, opts.backoffBaseMs));
    }
  }
  const [failed] = await db.update(agentTasks).set({ status: "failed", error: lastErr, finishedAt: new Date() }).where(eq(agentTasks.id, taskId)).returning();
  return failed;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
function summarize(r: unknown): string | undefined {
  if (r == null) return undefined;
  if (typeof r === "object") { try { return JSON.stringify(r).slice(0, 300); } catch { return undefined; } }
  return String(r).slice(0, 300);
}

export async function getTask(userId: string, id: string) {
  const [t] = await db.select().from(agentTasks).where(and(eq(agentTasks.id, id), eq(agentTasks.userId, userId)));
  if (!t) throw new HttpError(404, "Task not found");
  return t;
}

export async function listTasks(userId: string, f: { status?: string; type?: string; page?: number; pageSize?: number } = {}) {
  const page = f.page ?? 1, pageSize = Math.min(f.pageSize ?? 20, 100);
  const where = and(eq(agentTasks.userId, userId), f.status ? eq(agentTasks.status, f.status) : undefined, f.type ? eq(agentTasks.type, f.type) : undefined);
  const items = await db.select().from(agentTasks).where(where).orderBy(desc(agentTasks.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(agentTasks).where(where);
  const counts = await db.select({ status: agentTasks.status, n: sql<number>`count(*)::int` }).from(agentTasks).where(eq(agentTasks.userId, userId)).groupBy(agentTasks.status);
  return { items, total: n, page, pageSize, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
}

/** Failed/cancelled task → queued again (attempts reset) and dispatched. */
export async function retryTask(userId: string, id: string) {
  const t = await getTask(userId, id);
  if (!["failed", "cancelled"].includes(t.status)) throw new HttpError(409, `Task is ${t.status}; only failed/cancelled tasks can be retried`);
  await db.update(agentTasks).set({ status: "queued", attempts: 0, error: null, finishedAt: null, idempotencyKey: null }).where(eq(agentTasks.id, id));
  await dispatchTask(id);
  return getTask(userId, id);
}

export async function cancelTask(userId: string, id: string) {
  const t = await getTask(userId, id);
  if (!["queued", "running"].includes(t.status)) throw new HttpError(409, `Task is already ${t.status}`);
  await db.update(agentTasks).set({ status: "cancelled", finishedAt: new Date() }).where(eq(agentTasks.id, id));
  return getTask(userId, id);
}

/** Re-dispatches queued tasks that never started and stale running ones (called by cron). */
export async function resumePendingTasks(limit = 20) {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const rows = await db.select({ id: agentTasks.id }).from(agentTasks)
    .where(or(and(eq(agentTasks.status, "queued"), lt(agentTasks.scheduledFor, new Date(Date.now() - 30_000))), and(eq(agentTasks.status, "running"), lt(agentTasks.startedAt, staleBefore)))).limit(limit);
  for (const r of rows) await dispatchTask(r.id);
  return rows.length;
}
