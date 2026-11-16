import { route, parseBody, parseQuery } from "@/lib/utils/api";
import { createManualJob, searchJobs } from "@/lib/services/job.service";
import { jobFiltersSchema, jobInputSchema } from "@/lib/validation/jobs";

export const GET = route(async (userId, req) => searchJobs(userId, parseQuery(req, jobFiltersSchema)));
/** Manual create. Duplicate => 409 {error, existingJobId}. */
export const POST = route(async (userId, req) => {
  const input = await parseBody(req, jobInputSchema);
  const { jobId } = await createManualJob(userId, input);
  return Response.json({ jobId }, { status: 201 });
});
