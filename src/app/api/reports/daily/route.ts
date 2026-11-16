import { z } from "zod";
import { route, parseQuery } from "@/lib/utils/api";
import { buildDailyReport, getLatestReport, listReports } from "@/lib/services/report.service";

const q = z.object({ live: z.enum(["true", "false"]).optional(), history: z.enum(["true", "false"]).optional() });
export const GET = route(async (userId, req) => {
  const f = parseQuery(req, q);
  if (f.history === "true") return { items: await listReports(userId) };
  if (f.live === "true") { const r = await buildDailyReport(userId); return { report: { reportDate: r.data.date, data: r.data, summaryText: r.summaryText, live: true } }; }
  return { report: await getLatestReport(userId) };
});
