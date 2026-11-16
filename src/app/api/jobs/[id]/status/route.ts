import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { JOB_STATUSES } from "@/lib/db/schema";
import { setJobStatus } from "@/lib/services/application.service";

const body = z.object({ status: z.enum(JOB_STATUSES), note: z.string().max(2000).nullish() });
type Ctx = { params: Promise<{ id: string }> };
const handler = route(async (userId, req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await parseBody(req, body);
  return { job: await setJobStatus(userId, id, b.status, b.note) };
});
export const PATCH = handler;
export const PUT = handler;
export const POST = handler;
