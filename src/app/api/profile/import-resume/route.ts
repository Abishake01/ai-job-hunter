import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { importProfileFromResume } from "@/lib/services/resume-import.service";

export const maxDuration = 60;
/** POST {resumeId?} → fills EMPTY profile fields from the resume (default resume when omitted). */
export const POST = route(async (userId, req) => {
  const b = await parseBody(req, z.object({ resumeId: z.string().uuid().optional() }).default({}));
  return importProfileFromResume(userId, b.resumeId);
});
