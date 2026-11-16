import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/utils/cron-auth";
import { handleError } from "@/lib/utils/api";
import { listConnectedGmailUsers, syncGmail } from "@/lib/services/gmail.service";
import { listEnabledWorkflowUsers } from "@/lib/services/cron.service";

export const maxDuration = 300;
/** Cron (Bearer CRON_SECRET): syncs Gmail for users with Gmail connected AND the daily workflow enabled. Per-user failures are isolated. */
export async function GET(req: Request) {
  try {
    verifyCron(req);
    const enabled = new Set((await listEnabledWorkflowUsers(new Date(), { onlyDue: false })).map((u) => u.userId));
    const results: { userId: string; ok: boolean; relevant?: number; error?: string }[] = [];
    for (const userId of await listConnectedGmailUsers()) {
      if (!enabled.has(userId)) continue;
      try { const r = await syncGmail(userId, { days: 3 }); results.push({ userId, ok: true, relevant: r.relevant }); }
      catch (e) { results.push({ userId, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }); }
    }
    return NextResponse.json({ users: results.length, results });
  } catch (e) { return handleError(e); }
}
export const POST = GET;
