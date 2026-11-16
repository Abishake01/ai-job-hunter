import { route } from "@/lib/utils/api";
import { getTimeline } from "@/lib/services/application.service";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (userId, _req, ctx: Ctx) => ({ items: await getTimeline(userId, (await ctx.params).id) }));
