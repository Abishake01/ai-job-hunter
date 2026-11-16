import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { approveOutreach } from "@/lib/services/email.service";

type Ctx = { params: Promise<{ id: string }> };
/** Step 1 of 2. Body must be {confirm:true}. Approval does NOT send. */
export const POST = route(async (userId, req, ctx: Ctx) => {
  const b = await parseBody(req, z.object({ confirm: z.literal(true) }));
  return { outreach: await approveOutreach(userId, z.uuid().parse((await ctx.params).id), b.confirm) };
});
