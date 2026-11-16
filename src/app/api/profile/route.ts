import { route, parseBody } from "@/lib/utils/api";
import { profileSchema } from "@/lib/validation/profile";
import { getProfileView, updateProfile } from "@/lib/services/settings.service";

export const GET = route(async (userId) => getProfileView(userId));
const save = route(async (userId, req) => updateProfile(userId, await parseBody(req, profileSchema)));
export const PUT = save;
export const PATCH = save;
