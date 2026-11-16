import { z } from "zod";
import { route } from "@/lib/utils/api";
import { startDiscoveryTask } from "@/lib/services/discovery.service";

/** POST {sources?: string[]} -> queues a discover_jobs task via the task runner; returns {taskId}. Poll /api/tasks/[id]. */
export const POST = route(async (userId, req) => {
  const text = await req.text();
  const body = text ? z.object({ sources: z.array(z.string().max(40)).max(20).optional() }).parse(JSON.parse(text)) : {};
  const r = await startDiscoveryTask(userId, body.sources);
  return { taskId: r.taskId, created: r.created, status: r.status };
});
