import "server-only";
import { z, type ZodType } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userIntegrations } from "@/lib/db/schema";
import { decryptJson } from "@/lib/utils/crypto";
import { getSettings } from "@/lib/services/profile.service";

export class LlmNotConfiguredError extends Error {
  constructor() { super("No LLM provider configured. Add an API key in Settings → AI provider."); }
}

type Cfg = { provider: "openai" | "groq" | "anthropic" | "openai_compatible"; model: string; apiKey: string; baseUrl: string | null };

/** Resolves provider config: user's stored (encrypted) key first, then env fallback. Returns null if none. */
export async function getLlmConfig(userId: string): Promise<Cfg | null> {
  const settings = await getSettings(userId);
  const { provider, model, baseUrl } = settings.llm;
  const [row] = await db.select().from(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, "llm")));
  let apiKey: string | undefined;
  if (row?.secretsEnc) apiKey = decryptJson<{ apiKey?: string }>(row.secretsEnc).apiKey;
  apiKey ??= provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return { provider, model, apiKey, baseUrl };
}
export async function isLlmConfigured(userId: string) { return (await getLlmConfig(userId)) !== null; }

async function callRaw(cfg: Cfg, system: string, user: string, signal?: AbortSignal): Promise<string> {
  if (cfg.provider === "anthropic") {
    const r = await fetch((cfg.baseUrl ?? "https://api.anthropic.com") + "/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return j.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
  }
  const base = cfg.baseUrl ?? (cfg.provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");
  const send = () => fetch(base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST", signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  let r = await send();
  // Free tiers (e.g. Groq) rate-limit per minute: wait briefly once and retry. Exhausted credit/quota is not retried.
  if (r.status === 429) {
    const body = await r.clone().text();
    if (!/insufficient_quota|credit_balance/i.test(body)) {
      const wait = Math.min(8, Math.max(1, Number(r.headers.get("retry-after")) || 2));
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await send();
    }
  }
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error("Model did not return JSON");
}

/**
 * Structured generation validated by Zod; one automatic repair retry.
 * Throws LlmNotConfiguredError when no provider is set — callers must then use their deterministic fallback.
 */
export async function generateStructured<T>(userId: string, opts: { system: string; prompt: string; schema: ZodType<T> }): Promise<{ data: T; model: string }> {
  const cfg = await getLlmConfig(userId);
  if (!cfg) throw new LlmNotConfiguredError();
  const shape = JSON.stringify(z.toJSONSchema(opts.schema as never));
  const system = `${opts.system}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${shape}\nNever invent facts; use null/empty for unknown values.`;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 60_000);
    try {
      const raw = await callRaw(cfg, system, attempt ? `${opts.prompt}\n\nYour previous reply was invalid (${lastErr}). Return valid JSON only.` : opts.prompt, ac.signal);
      return { data: opts.schema.parse(extractJson(raw)), model: cfg.model };
    } catch (e) { lastErr = e instanceof Error ? e.message.slice(0, 200) : "error"; if (attempt) throw e; }
    finally { clearTimeout(t); }
  }
  throw new Error(lastErr);
}

export async function testLlm(userId: string) {
  const r = await generateStructured(userId, { system: "You are a health check.", prompt: 'Return {"ok":true}', schema: z.object({ ok: z.boolean() }) });
  return { ok: r.data.ok, model: r.model };
}

const NON_CHAT = /(whisper|tts|embed|guard|moderation|transcri|speech|image|dall-e|vision-preview|rerank)/i;

/** Lists chat-capable model ids the user's saved key can access (provider /models endpoint). */
export async function listModels(userId: string): Promise<string[]> {
  const cfg = await getLlmConfig(userId);
  if (!cfg) throw new LlmNotConfiguredError();
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20_000);
  try {
    const anthropic = cfg.provider === "anthropic";
    const base = anthropic ? (cfg.baseUrl ?? "https://api.anthropic.com") + "/v1" : (cfg.baseUrl ?? (cfg.provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
    const r = await fetch(base + "/models", {
      signal: ac.signal,
      headers: anthropic ? { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!r.ok) throw new Error(`Could not list models (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { data?: { id: string }[] };
    return (j.data ?? []).map((m) => m.id).filter((id) => !NON_CHAT.test(id)).sort();
  } finally { clearTimeout(t); }
}
