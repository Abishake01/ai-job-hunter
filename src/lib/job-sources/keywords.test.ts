import { describe, expect, it } from "vitest";
import { buildSearchKeywords, queryTerms } from "./keywords";

describe("buildSearchKeywords", () => {
  it("combines roles, title-worthy skills and explicit keywords; skips generic skills", () => {
    const k = buildSearchKeywords({ targetRoles: ["Backend Developer"], primarySkills: ["Python", "React.js", "Git", "HTML"], explicit: ["ai engineer"], yearsExperience: 3 });
    expect(k).toContain("backend developer"); expect(k).toContain("backend engineer"); expect(k).toContain("python developer"); expect(k).toContain("react engineer"); expect(k).toContain("ai engineer");
    expect(k.some((x) => x.includes("git") || x.includes("html"))).toBe(false);
    expect(k.some((x) => x.startsWith("junior"))).toBe(false);
  });
  it("adds junior/associate variants for entry-level profiles and caps the list", () => {
    const k = buildSearchKeywords({ targetRoles: ["Software Engineer"], primarySkills: ["Python"], yearsExperience: 0.5 });
    expect(k).toContain("junior software engineer"); expect(k).toContain("associate software developer");
    expect(buildSearchKeywords({ targetRoles: ["a developer", "b developer", "c developer"], primarySkills: ["python", "java", "go"], yearsExperience: 0 }, 5)).toHaveLength(5);
  });
  it("queryTerms drops junior variants", () => {
    expect(queryTerms(["python developer", "junior python developer", "backend engineer"], 5)).toEqual(["python developer", "backend engineer"]);
  });
});
