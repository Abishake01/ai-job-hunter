import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { analyzeResume, analyzeText, getDefaultResume } from "@/lib/services/resume.service";
import { HttpError } from "@/lib/utils/api";

/** POST { resumeId? } (defaults to the default resume) or { text } for an ad-hoc, unsaved analysis. */
export const POST = route(async (userId, req) => {
  const b = await parseBody(req, z.object({ resumeId: z.string().uuid().optional(), text: z.string().max(60_000).optional() }));
  if (b.text) return analyzeText(userId, b.text);
  const id = b.resumeId ?? (await getDefaultResume(userId))?.id;
  if (!id) throw new HttpError(400, "Upload a resume first");
  return analyzeResume(userId, id);
});
