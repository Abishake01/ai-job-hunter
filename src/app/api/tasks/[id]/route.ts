import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { cancelTask, getTask, retryTask } from "@/lib/services/tasks.service";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (userId, _req, ctx: Ctx) => ({ task: await getTask(userId, (await ctx.params).id) }));
/** POST {action: "retry" | "cancel"} */
export const POST = route(async (userId, req, ctx: Ctx) => {
  const { action } = await parseBody(req, z.object({ action: z.enum(["retry", "cancel"]) }));
  const { id } = await ctx.params;
  return { task: action === "retry" ? await retryTask(userId, id) : await cancelTask(userId, id) };
});
