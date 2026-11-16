import { route } from "@/lib/utils/api";
import { getOverview } from "@/lib/services/analytics.service";

export const GET = route(async (userId) => getOverview(userId));
