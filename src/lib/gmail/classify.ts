import { classifyByRules, type ClassifyInput, type EmailCategory } from "@/lib/ai/heuristics/classify";

export type Classified = { category: EmailCategory | null; engine: "rules" | "llm" | "none"; reason: string };

/**
 * Rules first (deterministic, free). Only when no rule matches AND an LLM classifier is supplied is the model asked —
 * with subject/sender/snippet only (never the body). `null` category => message is discarded.
 */
export async function classifyMessage(input: ClassifyInput, llm?: (i: ClassifyInput) => Promise<EmailCategory | null>): Promise<Classified> {
  const r = classifyByRules(input);
  if (r.category) return { category: r.category, engine: "rules", reason: r.reason };
  if (llm) {
    try { const c = await llm(input); if (c) return { category: c, engine: "llm", reason: "llm" }; } catch { /* LLM unavailable => discard */ }
  }
  return { category: null, engine: "none", reason: r.reason };
}
