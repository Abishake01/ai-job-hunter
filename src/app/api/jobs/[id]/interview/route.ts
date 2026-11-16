import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { setInterview } from "@/lib/services/application.service";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ interview: z.object({ date: z.string().max(64).optional(), mode: z.string().max(100).optional(), link: z.string().max(500).optional(), notes: z.string().max(3000).optional() }).nullable() });
const handler = route(async (userId, req, ctx: Ctx) => setInterview(userId, (await ctx.params).id, (await parseBody(req, body)).interview));
export const PUT = handler;
export const POST = handler;
