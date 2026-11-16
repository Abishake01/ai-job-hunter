import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { compareResumes } from "@/lib/services/resume.service";

/** POST { otherId } → compares this resume with another of the user's resumes. */
export const POST = route(async (userId, req, ctx: { params: Promise<{ id: string }> }) => {
  const { otherId } = await parseBody(req, z.object({ otherId: z.string().uuid() }));
  return compareResumes(userId, (await ctx.params).id, otherId);
});
