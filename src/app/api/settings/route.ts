import { z } from "zod";
import { route, parseBody, HttpError } from "@/lib/utils/api";
import { getSettings, updateSettings } from "@/lib/services/settings.service";

export const GET = route(async (userId) => getSettings(userId));
/** Partial deep-merge: only the provided keys change; objects merge, arrays replace. Result is validated by settingsSchema. */
const save = route(async (userId, req) => {
  const patch = await parseBody(req, z.record(z.string(), z.unknown()));
  if (!Object.keys(patch).length) throw new HttpError(400, "Empty settings patch");
  return updateSettings(userId, patch);
});
export const PATCH = save;
export const PUT = save;
