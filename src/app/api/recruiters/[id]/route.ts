import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { deleteRecruiter, getRecruiter, updateRecruiter } from "@/lib/services/recruiter.service";

type Ctx = { params: Promise<{ id: string }> };
const patch = z.object({ name: z.string().max(200).nullish(), designation: z.string().max(200).nullish(), email: z.email().nullish(), profileUrl: z.url().nullish(), notes: z.string().max(2000).nullish(), doNotContact: z.boolean().optional() });
export const GET = route(async (userId, _req, ctx: Ctx) => ({ recruiter: await getRecruiter(userId, z.uuid().parse((await ctx.params).id)) }));
export const PATCH = route(async (userId, req, ctx: Ctx) => ({ recruiter: await updateRecruiter(userId, z.uuid().parse((await ctx.params).id), await parseBody(req, patch)) }));
export const DELETE = route(async (userId, _req, ctx: Ctx) => deleteRecruiter(userId, z.uuid().parse((await ctx.params).id)));
