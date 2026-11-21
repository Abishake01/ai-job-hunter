import { route } from "@/lib/utils/api";
import { getProfileCompleteness } from "@/lib/services/completeness.service";

export const GET = route(async (userId) => getProfileCompleteness(userId));
