import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userIntegrations } from "@/lib/db/schema";
import { route, parseBody, HttpError } from "@/lib/utils/api";
import { encryptJson } from "@/lib/utils/crypto";

const PROVIDERS = ["adzuna", "jooble"] as const;

/** GET -> {adzuna:{configured, appId}, jooble:{configured}}. Keys are never returned. */
export const GET = route(async (userId) => {
  const rows = await db.select().from(userIntegrations).where(eq(userIntegrations.userId, userId));
  const find = (p: string) => rows.find((r) => r.provider === p);
  const az = find("adzuna");
  return {
    adzuna: { configured: !!az?.secretsEnc, appId: typeof az?.config?.app_id === "string" ? az.config.app_id : null },
    jooble: { configured: !!find("jooble")?.secretsEnc },
  };
});

const putSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("adzuna"), appId: z.string().trim().min(1).max(100), appKey: z.string().trim().min(1).max(200) }),
  z.object({ provider: z.literal("jooble"), apiKey: z.string().trim().min(1).max(200) }),
]);
/** PUT: save a key encrypted (AES-GCM) in user_integrations. */
export const PUT = route(async (userId, req) => {
  const b = await parseBody(req, putSchema);
  const secrets = b.provider === "adzuna" ? { appKey: b.appKey } : { apiKey: b.apiKey };
  const config = b.provider === "adzuna" ? { app_id: b.appId } : {};
  await db.insert(userIntegrations).values({ userId, provider: b.provider, secretsEnc: encryptJson(secrets), config, status: "connected" })
    .onConflictDoUpdate({ target: [userIntegrations.userId, userIntegrations.provider], set: { secretsEnc: encryptJson(secrets), config, status: "connected" } });
  return { ok: true };
});

export const DELETE = route(async (userId, req) => {
  const p = new URL(req.url).searchParams.get("provider");
  if (!PROVIDERS.includes(p as never)) throw new HttpError(400, "Unknown provider");
  await db.delete(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, p!)));
  return { ok: true };
});
