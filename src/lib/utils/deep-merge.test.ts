import { describe, it, expect } from "vitest";
import { deepMerge } from "./deep-merge";
import { settingsSchema, defaultSettings } from "@/lib/validation/settings";

describe("deepMerge", () => {
  it("merges nested objects, replaces arrays, skips undefined", () => {
    const base = { a: { x: 1, y: 2 }, list: [1, 2], keep: true };
    const out = deepMerge(base, { a: { y: 9 }, list: [3], keep: undefined });
    expect(out).toEqual({ a: { x: 1, y: 9 }, list: [3], keep: true });
    expect(base.a.y).toBe(2); // not mutated
  });
  it("ignores prototype pollution keys", () => {
    const out = deepMerge({}, JSON.parse('{"__proto__":{"polluted":true},"ok":1}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(out).toEqual({ ok: 1 });
  });
  it("partial settings merge validates through settingsSchema", () => {
    const merged = deepMerge(defaultSettings() as unknown as Record<string, unknown>, { thresholds: { excellent: 90 }, dailyWorkflow: { enabled: true, steps: { draftEmails: false } } });
    const s = settingsSchema.parse(merged);
    expect(s.thresholds).toEqual({ excellent: 90, good: 60 });
    expect(s.dailyWorkflow.enabled).toBe(true);
    expect(s.dailyWorkflow.steps).toMatchObject({ draftEmails: false, fetchJobs: true });
    expect(s.llm.model).toBe("gpt-4o-mini");
    expect(() => settingsSchema.parse(deepMerge(merged, { thresholds: { excellent: 500 } }))).toThrow();
  });
});
