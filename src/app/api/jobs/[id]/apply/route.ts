import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { getApplication, markApplied } from "@/lib/services/application.service";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ method: z.enum(["company_site", "email", "portal", "referral", "other"]).default("other"), resumeId: z.uuid().nullish(), notes: z.string().max(2000).nullish(), appliedAt: z.coerce.date().optional() });
/** Records that YOU applied (the app never submits applications). 409 if already applied. */
export const POST = route(async (userId, req, ctx: Ctx) => {
  const { id } = await ctx.params;
  return { application: await markApplied(userId, id, await parseBody(req, body)) };
});
export const GET = route(async (userId, _req, ctx: Ctx) => ({ application: await getApplication(userId, (await ctx.params).id) }));
