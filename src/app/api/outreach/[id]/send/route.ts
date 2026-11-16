import { z } from "zod";
import { route } from "@/lib/utils/api";
import { sendOutreach } from "@/lib/services/email.service";

type Ctx = { params: Promise<{ id: string }> };
/**
 * Step 2 of 2: the only send endpoint (single email; there is no bulk send). Requires status=approved AND body {confirm:true}.
 * Uses the gmail.send scope solely here.
 */
export const POST = route(async (userId, req, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  return { outreach: await sendOutreach(userId, z.uuid().parse((await ctx.params).id), b?.confirm) };
});
