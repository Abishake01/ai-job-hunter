import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateProfiles, candidateSkills, skills, userIntegrations } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { settingsSchema, defaultSettings, type Settings } from "@/lib/validation/settings";
import type { ProfileInput } from "@/lib/validation/profile";
import { deepMerge } from "@/lib/utils/deep-merge";
import { encryptJson } from "@/lib/utils/crypto";
import { normalizeSkill } from "@/lib/utils/skills";
import { getProfile, getSettings } from "./profile.service";

export { getSettings };

async function ensureProfileRow(userId: string) {
  const existing = await getProfile(userId);
  if (existing) return existing;
  const [row] = await db.insert(candidateProfiles).values({ userId, settings: defaultSettings() }).onConflictDoNothing().returning();
  return row ?? (await getProfile(userId))!;
}

/** Validates a merged settings object; throws HttpError 400 with a readable message. */
export function validateSettings(merged: unknown): Settings {
  const r = settingsSchema.safeParse(merged);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  if (r.data.thresholds.good >= r.data.thresholds.excellent) throw new HttpError(400, "thresholds: 'good' must be lower than 'excellent'");
  return r.data;
}

/** Deep-merges a partial settings patch into the stored settings, validates, persists, returns the full settings. */
export async function updateSettings(userId: string, patch: Record<string, unknown>): Promise<Settings> {
  const p = await ensureProfileRow(userId);
  const current = settingsSchema.parse(p.settings ?? {});
  const next = validateSettings(deepMerge(current as unknown as Record<string, unknown>, patch));
  await db.update(candidateProfiles).set({ settings: next }).where(eq(candidateProfiles.userId, userId));
  return next;
}

export async function getCandidateSkills(userId: string): Promise<{ primary: string[]; additional: string[]; ai: string[] }> {
  const rows = await db.select({ name: skills.name, level: candidateSkills.level }).from(candidateSkills).innerJoin(skills, eq(skills.id, candidateSkills.skillId)).where(eq(candidateSkills.userId, userId));
  const pick = (l: string) => rows.filter((r) => r.level === l).map((r) => r.name).sort((a, b) => a.localeCompare(b));
  return { primary: pick("primary"), additional: pick("additional"), ai: pick("ai") };
}

export async function getProfileView(userId: string) {
  const profile = await ensureProfileRow(userId);
  const { settings: _s, ...rest } = profile; void _s;
  return { profile: rest, skills: await getCandidateSkills(userId) };
}

async function replaceSkills(userId: string, level: "primary" | "additional", names: string[]) {
  const unique = new Map<string, string>();
  for (const n of names) { const k = normalizeSkill(n); if (k && !unique.has(k)) unique.set(k, n.trim()); }
  const ids: string[] = [];
  for (const [normalized, name] of unique) {
    const [s] = await db.insert(skills).values({ name, normalized }).onConflictDoUpdate({ target: skills.normalized, set: { normalized } }).returning();
    ids.push(s.id);
  }
  const existing = await db.select({ skillId: candidateSkills.skillId }).from(candidateSkills).where(and(eq(candidateSkills.userId, userId), eq(candidateSkills.level, level)));
  const stale = existing.map((e) => e.skillId).filter((id) => !ids.includes(id));
  if (stale.length) await db.delete(candidateSkills).where(and(eq(candidateSkills.userId, userId), eq(candidateSkills.level, level), inArray(candidateSkills.skillId, stale)));
  for (const skillId of ids) {
    await db.insert(candidateSkills).values({ userId, skillId, level }).onConflictDoUpdate({ target: [candidateSkills.userId, candidateSkills.skillId], set: { level } });
  }
}

export async function updateProfile(userId: string, input: ProfileInput) {
  await ensureProfileRow(userId);
  const { skills: sk, ...cols } = input;
  const set = Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length) await db.update(candidateProfiles).set(set).where(eq(candidateProfiles.userId, userId));
  if (sk) {
    // a skill listed as primary must not also appear as additional
    const prim = new Set(sk.primary.map(normalizeSkill));
    await replaceSkills(userId, "primary", sk.primary);
    await replaceSkills(userId, "additional", sk.additional.filter((s) => !prim.has(normalizeSkill(s))));
  }
  return getProfileView(userId);
}

// ---------- integrations (API keys, encrypted; never returned) ----------
export type SecretProvider = "llm" | "hunter" | "zerobounce";

export async function getIntegration(userId: string, provider: string) {
  const [row] = await db.select().from(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)));
  return row ?? null;
}

export async function saveSecret(userId: string, provider: SecretProvider, apiKey: string, config: Record<string, unknown> = {}) {
  const secretsEnc = encryptJson({ apiKey });
  await db.insert(userIntegrations).values({ userId, provider, secretsEnc, config, status: "connected" })
    .onConflictDoUpdate({ target: [userIntegrations.userId, userIntegrations.provider], set: { secretsEnc, config, status: "connected" } });
}

export async function deleteSecret(userId: string, provider: SecretProvider) {
  await db.delete(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)));
}

export async function getLlmStatus(userId: string) {
  const settings = await getSettings(userId);
  const row = await getIntegration(userId, "llm");
  const saved = !!row?.secretsEnc;
  const env = !!(settings.llm.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : settings.llm.provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY);
  return { configured: saved || env, source: saved ? "saved" : env ? "env" : null, provider: settings.llm.provider, model: settings.llm.model, baseUrl: settings.llm.baseUrl };
}

export async function getKeyStatus(userId: string, provider: "hunter" | "zerobounce") {
  const row = await getIntegration(userId, provider);
  return { configured: !!row?.secretsEnc, updatedAt: row?.updatedAt ?? null };
}
