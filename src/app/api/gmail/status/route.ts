import { route } from "@/lib/utils/api";
import { getGmailStatus } from "@/lib/services/gmail.service";

export const GET = route(async (userId) => getGmailStatus(userId));
