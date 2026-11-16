import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { findContactsForJob } from "@/lib/services/recruiter.service";

export const maxDuration = 60;
export const POST = route(async (userId, req) => findContactsForJob(userId, (await parseBody(req, z.object({ jobId: z.uuid() }))).jobId));
