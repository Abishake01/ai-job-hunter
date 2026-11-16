import { route } from "@/lib/utils/api";
import { enqueueTask } from "@/lib/services/tasks.service";

/** Starts the daily workflow as a durable task (one per user per minute; double-clicks return the same task). */
export const POST = route(async (userId) => {
  const t = await enqueueTask(userId, "daily_workflow", {}, { idempotencyKey: `manual-workflow:${Math.floor(Date.now() / 60_000)}` });
  return { taskId: t.taskId, created: t.created, status: t.status };
});
