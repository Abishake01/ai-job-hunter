import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { deleteSecret, getKeyStatus, saveSecret, updateSettings, getSettings } from "@/lib/services/settings.service";

const provider = z.enum(["hunter", "zerobounce"]);

async function status(userId: string) {
  const [settings, hunter, zerobounce] = await Promise.all([getSettings(userId), getKeyStatus(userId, "hunter"), getKeyStatus(userId, "zerobounce")]);
  return { provider: settings.emailVerification.provider, hunter, zerobounce };
}
/** Never returns keys. */
export const GET = route(async (userId) => status(userId));

export const PUT = route(async (userId, req) => {
  const b = await parseBody(req, z.object({ provider: z.enum(["none", "hunter", "zerobounce"]), apiKey: z.string().trim().min(6).max(300).optional() }));
  if (b.provider !== "none" && b.apiKey) await saveSecret(userId, b.provider, b.apiKey);
  await updateSettings(userId, { emailVerification: { provider: b.provider } });
  return status(userId);
});

export const DELETE = route(async (userId, req) => {
  const { provider: p } = Object.fromEntries(new URL(req.url).searchParams) as { provider?: string };
  const prov = provider.parse(p);
  await deleteSecret(userId, prov);
  const s = await getSettings(userId);
  if (s.emailVerification.provider === prov) await updateSettings(userId, { emailVerification: { provider: "none" } });
  return status(userId);
});
