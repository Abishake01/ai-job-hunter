import "server-only";
import { inngest } from "./client";
import { listEnabledWorkflowUsers } from "@/lib/services/cron.service";
import { enqueueTask, runTask } from "@/lib/services/tasks.service";

/** Executes a durable agent_tasks row (retries are handled by the task runner; Inngest adds a function-level retry on crash). */
export const runAgentTask = inngest.createFunction(
  { id: "run-agent-task", triggers: [{ event: "app/task.run" }], retries: 2, concurrency: { limit: 5 } },
  async ({ event, step }) => {
    const taskId = (event.data as { taskId: string }).taskId;
    const out = await step.run("run-task", async () => { const t = await runTask(taskId); return t ? { status: t.status } : { status: "already-claimed" }; });
    return out;
  },
);

/** Hourly fan-out: enqueue a daily workflow for every user whose configured local hour is now. Idempotent per user/day. */
export const scheduledDaily = inngest.createFunction(
  { id: "scheduled-daily-workflow", triggers: [{ cron: "0 * * * *" }], retries: 1, concurrency: { limit: 1 } },
  async ({ step }) => {
    const users = await step.run("find-users", () => listEnabledWorkflowUsers(new Date()));
    for (const u of users) await step.run(`enqueue-${u.userId}`, () => enqueueTask(u.userId, "daily_workflow", {}, { idempotencyKey: `daily:${u.date}`, run: false }).then((t) => t.taskId));
    return { users: users.length };
  },
);

export const discoverRequested = inngest.createFunction(
  { id: "discover-jobs-event", triggers: [{ event: "app/discover.requested" }], retries: 2, concurrency: { limit: 2, key: "event.data.userId" } },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };
    const t = await step.run("enqueue", () => enqueueTask(userId, "discover_jobs", {}, { run: false }));
    return step.run("run", async () => ({ status: (await runTask(t.taskId))?.status }));
  },
);

export const syncRequested = inngest.createFunction(
  { id: "sync-gmail-event", triggers: [{ event: "app/gmail.sync.requested" }], retries: 2, concurrency: { limit: 2, key: "event.data.userId" } },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };
    const t = await step.run("enqueue", () => enqueueTask(userId, "sync_gmail", {}, { run: false }));
    return step.run("run", async () => ({ status: (await runTask(t.taskId))?.status }));
  },
);

export const allFunctions = [runAgentTask, scheduledDaily, discoverRequested, syncRequested];
