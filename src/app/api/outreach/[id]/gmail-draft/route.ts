import { z } from "zod";
import { route } from "@/lib/utils/api";
import { createGmailDraft } from "@/lib/services/email.service";

type Ctx = { params: Promise<{ id: string }> };
/** Creates a Gmail DRAFT (never sends). */
export const POST = route(async (userId, _req, ctx: Ctx) => ({ outreach: await createGmailDraft(userId, z.uuid().parse((await ctx.params).id)) }));
