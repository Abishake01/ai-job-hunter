import { route, parseBody } from "@/lib/utils/api";
import { createSavedSearch, listSavedSearches } from "@/lib/services/job.service";
import { savedSearchSchema } from "@/lib/validation/jobs";

export const GET = route(async (userId) => ({ items: await listSavedSearches(userId) }));
export const POST = route(async (userId, req) => {
  const b = await parseBody(req, savedSearchSchema);
  return Response.json(await createSavedSearch(userId, b.name, b.filters), { status: 201 });
});
