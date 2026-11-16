import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { matchJob, matchJobs } from "@/lib/services/matching.service";

const body = z.union([
  z.object({ jobId: z.string().uuid() }),
  z.object({ all: z.literal(true), onlyUnmatched: z.boolean().optional(), limit: z.number().int().min(1).max(1000).optional() }),
]);
export const maxDuration = 300;
export const POST = route(async (userId, req) => {
  const b = await parseBody(req, body);
  return "jobId" in b ? matchJob(userId, b.jobId) : matchJobs(userId, { onlyUnmatched: b.onlyUnmatched, limit: b.limit });
});
