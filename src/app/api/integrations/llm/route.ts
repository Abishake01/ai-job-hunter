import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { deleteSecret, getLlmStatus, saveSecret, updateSettings } from "@/lib/services/settings.service";
import { testLlm, LlmNotConfiguredError } from "@/lib/ai/llm";

const body = z.object({
  provider: z.enum(["openai", "groq", "anthropic", "openai_compatible"]).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  apiKey: z.string().trim().min(8).max(500).optional(),
});

/** Never returns the key: only { configured, source, provider, model, baseUrl }. */
export const GET = route(async (userId) => getLlmStatus(userId));

const save = route(async (userId, req) => {
  const b = await parseBody(req, body);
  const llm: Record<string, unknown> = {};
  if (b.provider) llm.provider = b.provider;
  if (b.model) llm.model = b.model;
  if (b.baseUrl !== undefined) llm.baseUrl = b.baseUrl;
  if (Object.keys(llm).length) await updateSettings(userId, { llm });
  if (b.apiKey) await saveSecret(userId, "llm", b.apiKey, {});
  return getLlmStatus(userId);
});
export const PUT = save;
export const PATCH = save;

export const DELETE = route(async (userId) => { await deleteSecret(userId, "llm"); return getLlmStatus(userId); });

/** Test the saved configuration with a tiny structured call. */
export const POST = route(async (userId) => {
  try { const r = await testLlm(userId); return { ok: r.ok, model: r.model }; }
  catch (e) {
    if (e instanceof LlmNotConfiguredError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message.replace(/(sk-|key[=:]\s*)[\w-]+/gi, "$1***").slice(0, 300) : "Test failed" };
  }
});
