import { route, parseBody } from "@/lib/utils/api";
import { deleteJob, getJobDetail, updateJob } from "@/lib/services/job.service";
import { jobPatchSchema } from "@/lib/validation/jobs";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (userId, _req, ctx: Ctx) => getJobDetail(userId, (await ctx.params).id));
export const PATCH = route(async (userId, req, ctx: Ctx) => {
  const patch = await parseBody(req, jobPatchSchema);
  const { postedAt, deadline, ...rest } = patch;
  await updateJob(userId, (await ctx.params).id, {
    ...rest,
    ...(postedAt !== undefined ? { postedAt: postedAt ? new Date(postedAt) : null } : {}),
    ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
  });
  return getJobDetail(userId, (await ctx.params).id);
});
export const DELETE = route(async (userId, _req, ctx: Ctx) => { await deleteJob(userId, (await ctx.params).id); return { ok: true }; });
