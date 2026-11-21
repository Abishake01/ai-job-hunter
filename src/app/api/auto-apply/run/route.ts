import { route } from "@/lib/utils/api";
import { runAutoApply } from "@/lib/services/auto-apply.service";

export const maxDuration = 300;
/** Manual trigger ("Run auto-apply now"). Still requires auto-apply enabled + 100% profile + Gmail. */
export const POST = route(async (userId) => runAutoApply(userId));
