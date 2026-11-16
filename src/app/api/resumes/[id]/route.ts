import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { deleteResume, getResume, updateResume } from "@/lib/services/resume.service";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (userId, _req, ctx: Ctx) => getResume(userId, (await ctx.params).id));
export const PATCH = route(async (userId, req, ctx: Ctx) => {
  const patch = await parseBody(req, z.object({ name: z.string().trim().min(1).max(120).optional(), isDefault: z.literal(true).optional() }));
  return updateResume(userId, (await ctx.params).id, patch);
});
export const DELETE = route(async (userId, _req, ctx: Ctx) => { await deleteResume(userId, (await ctx.params).id); return { ok: true }; });
