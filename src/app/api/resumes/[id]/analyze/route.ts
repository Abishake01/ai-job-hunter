import { route } from "@/lib/utils/api";
import { analyzeResume } from "@/lib/services/resume.service";

export const POST = route(async (userId, _req, ctx: { params: Promise<{ id: string }> }) => analyzeResume(userId, (await ctx.params).id));
