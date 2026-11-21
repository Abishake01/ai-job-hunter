import { describe, expect, it } from "vitest";
import { computeCompleteness } from "./completeness";

const full = { fullName: "A B", phone: "1", headline: "h", summary: "s", location: "Chennai", education: "BE", yearsExperience: 0, targetRoles: ["Backend Developer"], preferredLocations: ["Chennai"], workModes: ["remote"], expectedSalaryMin: 45000, githubUrl: "https://github.com/x", primarySkills: ["Python", "React", "SQL"], projectCount: 1, hasResume: true };

describe("computeCompleteness", () => {
  it("is 100% for a full profile (0 years experience still counts as filled)", () => {
    const c = computeCompleteness(full);
    expect(c.percent).toBe(100); expect(c.complete).toBe(true); expect(c.missing).toEqual([]);
  });
  it("lists what is missing and routes the resume item to the resume tab", () => {
    const c = computeCompleteness({ ...full, phone: "  ", hasResume: false, primarySkills: ["Python"] });
    expect(c.complete).toBe(false);
    expect(c.missing.map((m) => m.key).sort()).toEqual(["phone", "resume", "skills"]);
    expect(c.missing.find((m) => m.key === "resume")?.tab).toBe("resume");
    expect(c.percent).toBeLessThan(100);
  });
  it("is 0% for an empty profile", () => expect(computeCompleteness({}).percent).toBe(0));
});
