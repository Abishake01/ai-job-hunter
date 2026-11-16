import { z } from "zod";
import { route } from "@/lib/utils/api";
import { syncGmail } from "@/lib/services/gmail.service";

export const maxDuration = 120;
const body = z.object({ days: z.number().int().min(1).max(90).optional() });
export const POST = route(async (userId, req) => {
  const json = await req.json().catch(() => ({}));
  return syncGmail(userId, body.parse(json ?? {}));
});
