import { route } from "@/lib/utils/api";
import { disconnectGmail } from "@/lib/services/gmail.service";

export const POST = route(async (userId) => disconnectGmail(userId));
export const DELETE = POST;
