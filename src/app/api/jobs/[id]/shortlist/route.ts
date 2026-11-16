import { z } from "zod";
import { route } from "@/lib/utils/api";
import { setShortlisted } from "@/lib/services/job.service";

type Ctx = { params: Promise<{ id: string }> };
/** POST {shortlisted?: boolean}; omitted toggles. */
export const POST = route(async (userId, req, ctx: Ctx) => {
  const text = await req.text();
  const body = text ? z.object({ shortlisted: z.boolean().optional() }).parse(JSON.parse(text)) : {};
  return setShortlisted(userId, (await ctx.params).id, body.shortlisted);
});
