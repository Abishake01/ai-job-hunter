import { route } from "@/lib/utils/api";
import { listOutreachFollowUps } from "@/lib/services/email.service";

export const GET = route(async (userId) => ({ items: await listOutreachFollowUps(userId) }));
