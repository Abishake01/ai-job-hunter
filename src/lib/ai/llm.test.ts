import { describe, it, expect } from "vitest";
import { settingsSchema } from "@/lib/validation/settings";

describe("LLM provider settings", () => {
  it("accepts groq as a provider", () => {
    const s = settingsSchema.parse({ llm: { provider: "groq", model: "llama-3.3-70b-versatile", baseUrl: null } });
    expect(s.llm.provider).toBe("groq");
  });
  it("rejects unknown providers", () => {
    expect(() => settingsSchema.parse({ llm: { provider: "nope", model: "x", baseUrl: null } })).toThrow();
  });
});
