import { route } from "@/lib/utils/api";
import { getFacets } from "@/lib/services/job.service";

export const GET = route(async (userId) => getFacets(userId));
