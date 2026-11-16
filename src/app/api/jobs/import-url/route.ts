import { z } from "zod";
import { route, parseBody, HttpError } from "@/lib/utils/api";
import { importFromUrl } from "@/lib/job-sources/import-url";
import { HttpFailure } from "@/lib/job-sources/http";
import { createManualJob } from "@/lib/services/job.service";
import { jobInputSchema } from "@/lib/validation/jobs";

export const maxDuration = 30;
const schema = z.object({
  url: z.string().trim().url().max(2000),
  /** false (default): return a preview only. true: save, applying optional user edits in `overrides`. */
  save: z.boolean().optional(),
  overrides: jobInputSchema.partial().optional(),
});

export const POST = route(async (userId, req) => {
  const { url, save, overrides } = await parseBody(req, schema);
  let r;
  try { r = await importFromUrl(url); } catch (e) {
    if (e instanceof HttpFailure) throw new HttpError(e.status >= 400 && e.status < 600 ? (e.status === 0 ? 502 : e.status) : 502, e.message);
    throw e;
  }
  const j = r.job;
  const preview = {
    title: j.title, company: j.company, description: j.description, location: j.location, workMode: j.workMode, jobType: j.jobType,
    salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryCurrency: j.salaryCurrency, salaryText: j.salaryText,
    experienceMin: j.experienceMin, experienceMax: j.experienceMax, experienceText: j.experienceText,
    postedAt: j.postedAt?.toISOString() ?? null, deadline: j.deadline?.toISOString() ?? null, applyUrl: j.applyUrl, skills: j.requiredSkills,
  };
  if (!save) return { preview, method: r.method, missing: r.missing, closed: r.closed };
  const input = jobInputSchema.parse({ ...preview, ...(overrides ?? {}) });
  const { jobId } = await createManualJob(userId, input, { source: "import-url", sourceUrl: url });
  return Response.json({ jobId, method: r.method, missing: r.missing }, { status: 201 });
});
