import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { setFollowUpDate } from "@/lib/services/application.service";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ date: z.coerce.date().nullable(), note: z.string().max(1000).nullish() });
const handler = route(async (userId, req, ctx: Ctx) => { const b = await parseBody(req, body); return setFollowUpDate(userId, (await ctx.params).id, b.date, b.note); });
export const PUT = handler;
export const POST = handler;
