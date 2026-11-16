import "server-only";
import { db } from "@/lib/db";
import { candidateProfiles } from "@/lib/db/schema";
import { settingsSchema } from "@/lib/validation/settings";
import { dateInTz } from "./report.logic";
import { isWorkflowDue } from "./cron.logic";

/** Users with dailyWorkflow.enabled whose local hour matches now (when `onlyDue`), plus their local date. */
export async function listEnabledWorkflowUsers(now: Date, opts: { onlyDue?: boolean } = { onlyDue: true }) {
  const rows = await db.select({ userId: candidateProfiles.userId, settings: candidateProfiles.settings }).from(candidateProfiles);
  const out: { userId: string; date: string }[] = [];
  for (const r of rows) {
    const s = settingsSchema.parse(r.settings ?? {}).dailyWorkflow;
    if (!s.enabled) continue;
    if (opts.onlyDue && !isWorkflowDue(now, s.hour, s.timezone)) continue;
    out.push({ userId: r.userId, date: dateInTz(now, s.timezone) });
  }
  return out;
}
