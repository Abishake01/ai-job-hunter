import { NextResponse } from "next/server";
import { after } from "next/server";
import { verifyCron } from "@/lib/utils/cron-auth";
import { listEnabledWorkflowUsers } from "@/lib/services/cron.service";
import { enqueueTask, resumePendingTasks } from "@/lib/services/tasks.service";
import { handleError } from "@/lib/utils/api";

export const maxDuration = 300;
/**
 * Vercel Cron target (Authorization: Bearer CRON_SECRET). Enqueues one daily_workflow task per enabled user, idempotent per user/day,
 * and re-dispatches stuck tasks. Pass ?due=1 to only include users whose configured local hour is now.
 */
export async function GET(req: Request) {
  try {
    verifyCron(req);
    const due = new URL(req.url).searchParams.get("due") === "1";
    const users = await listEnabledWorkflowUsers(new Date(), { onlyDue: due });
    const tasks: string[] = [];
    for (const u of users) tasks.push((await enqueueTask(u.userId, "daily_workflow", {}, { idempotencyKey: `daily:${u.date}` })).taskId);
    after(() => resumePendingTasks().then(() => undefined, () => undefined));
    return NextResponse.json({ users: users.length, tasks });
  } catch (e) { return handleError(e); }
}
export const POST = GET;
