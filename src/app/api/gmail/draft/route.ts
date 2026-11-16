import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { createGmailDraft } from "@/lib/services/email.service";

/** Creates a Gmail DRAFT for an outreach (never sends). */
export const POST = route(async (userId, req) => ({ outreach: await createGmailDraft(userId, (await parseBody(req, z.object({ outreachId: z.uuid() }))).outreachId) }));
