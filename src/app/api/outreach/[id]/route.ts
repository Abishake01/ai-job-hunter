import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { deleteOutreach, getOutreach, updateOutreach } from "@/lib/services/email.service";

type Ctx = { params: Promise<{ id: string }> };
const patch = z.object({ subject: z.string().min(1).max(300).optional(), body: z.string().min(1).max(20000).optional(), toEmail: z.email().nullish(), toName: z.string().max(200).nullish() });
export const GET = route(async (userId, _req, ctx: Ctx) => ({ outreach: await getOutreach(userId, z.uuid().parse((await ctx.params).id)) }));
export const PATCH = route(async (userId, req, ctx: Ctx) => ({ outreach: await updateOutreach(userId, z.uuid().parse((await ctx.params).id), await parseBody(req, patch)) }));
export const DELETE = route(async (userId, _req, ctx: Ctx) => deleteOutreach(userId, z.uuid().parse((await ctx.params).id)));
