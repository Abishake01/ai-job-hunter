import { route } from "@/lib/utils/api";
import { checkAvailability } from "@/lib/services/availability.service";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 30;
export const POST = route(async (userId, _req, ctx: Ctx) => checkAvailability(userId, (await ctx.params).id));
