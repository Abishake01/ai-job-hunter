import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/utils/cron-auth";
import { handleError } from "@/lib/utils/api";
import { listEnabledWorkflowUsers } from "@/lib/services/cron.service";
import { enqueueTask } from "@/lib/services/tasks.service";

export const maxDuration = 300;
/** Cron (Bearer CRON_SECRET): queues a discover_jobs task per user with the daily workflow enabled (idempotent per user per hour). */
export async function GET(req: Request) {
  try {
    verifyCron(req);
    const users = await listEnabledWorkflowUsers(new Date(), { onlyDue: false });
    const hour = new Date().toISOString().slice(0, 13);
    const tasks: string[] = [];
    for (const u of users) {
      try { tasks.push((await enqueueTask(u.userId, "discover_jobs", {}, { idempotencyKey: `discover-cron:${hour}` })).taskId); } catch (e) { console.error("[cron/discover-jobs]", u.userId, e); }
    }
    return NextResponse.json({ users: users.length, tasks });
  } catch (e) { return handleError(e); }
}
export const POST = GET;
