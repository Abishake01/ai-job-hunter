import { describe, it, expect } from "vitest";
import { extractSkillsFromText } from "./skills";

describe("extractSkillsFromText", () => {
  it("finds whole-word skills and aliases", () => {
    const r = extractSkillsFromText("We use Python, FastAPI and React.js with Postgres on AWS. Node.js a plus.");
    expect(r).toEqual(expect.arrayContaining(["Python", "FastAPI", "React", "PostgreSQL", "AWS", "Node.js"]));
  });
  it("does not match substrings", () => {
    expect(extractSkillsFromText("Javascripty rusty")).toEqual([]);
    expect(extractSkillsFromText("Familiar with Java.")).toContain("Java");
    expect(extractSkillsFromText("javascript only")).not.toContain("Java");
  });
  it("supports extra candidate skills", () => {
    expect(extractSkillsFromText("knowledge of Zephyr OS", ["Zephyr OS"])).toContain("Zephyr OS");
  });
});
