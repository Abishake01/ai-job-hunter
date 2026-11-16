import { z } from "zod";
import { route } from "@/lib/utils/api";
import { removeUnsubscribe } from "@/lib/services/email.service";

type Ctx = { params: Promise<{ id: string }> };
export const DELETE = route(async (userId, _req, ctx: Ctx) => removeUnsubscribe(userId, z.uuid().parse((await ctx.params).id)));
