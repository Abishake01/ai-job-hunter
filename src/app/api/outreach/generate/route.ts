import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { generateEmail } from "@/lib/services/email.service";
import { EMAIL_KINDS } from "@/lib/db/schema";

export const maxDuration = 90;
const body = z.object({ jobId: z.uuid(), kind: z.enum(EMAIL_KINDS), recruiterId: z.uuid().nullish(), resumeId: z.uuid().nullish(), extraInstructions: z.string().max(500).nullish(), regenerate: z.boolean().optional() });
/** Creates a DRAFT only. */
export const POST = route(async (userId, req) => ({ outreach: await generateEmail(userId, await parseBody(req, body)) }));
