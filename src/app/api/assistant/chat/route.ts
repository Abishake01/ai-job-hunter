import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { chat } from "@/lib/services/assistant.service";

export const maxDuration = 60;
export const POST = route(async (userId, req) => chat(userId, (await parseBody(req, z.object({ message: z.string().min(1).max(1000) }))).message));
