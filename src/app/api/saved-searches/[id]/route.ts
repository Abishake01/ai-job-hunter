import { route, parseBody } from "@/lib/utils/api";
import { deleteSavedSearch, updateSavedSearch } from "@/lib/services/job.service";
import { savedSearchSchema } from "@/lib/validation/jobs";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (userId, req, ctx: Ctx) => updateSavedSearch(userId, (await ctx.params).id, await parseBody(req, savedSearchSchema.partial())));
export const DELETE = route(async (userId, _req, ctx: Ctx) => { await deleteSavedSearch(userId, (await ctx.params).id); return { ok: true }; });
