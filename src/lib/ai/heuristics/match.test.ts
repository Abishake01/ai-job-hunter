import { describe, it, expect } from "vitest";
import { scoreMatch, categorize, roleRelevance, type CandidateInput, type JobInput } from "./match";

const T = { excellent: 80, good: 60 };
const cand: CandidateInput = {
  skills: ["Python", "FastAPI", "Django", "React.js", "TypeScript", "PostgreSQL", "AWS"],
  targetRoles: ["Full Stack Developer", "Python Developer", "Backend Developer", "Software Engineer"], currentTitle: "Associate Software Engineer",
  yearsExperience: 1, education: "B.E. Computer Science and Engineering", workModes: ["remote", "hybrid", "onsite"], jobTypes: ["full_time"],
  includeInternshipsContract: true, preferredLocations: ["India", "Remote"], expectedSalaryMin: 45000, expectedSalaryMax: 60000, currency: "INR",
};
const job = (o: Partial<JobInput> = {}): JobInput => ({
  title: "Python Backend Developer", description: null, location: "Bengaluru, India", workMode: "hybrid", jobType: "full_time", salaryMin: 50000, salaryMax: 70000, salaryCurrency: "INR",
  experienceMin: 0, experienceMax: 2, skills: [{ name: "Python", required: true }, { name: "FastAPI", required: true }, { name: "Docker", required: false }], ...o,
});

describe("categorize", () => {
  it("uses thresholds", () => {
    expect(categorize(80, T)).toBe("excellent"); expect(categorize(79, T)).toBe("good");
    expect(categorize(60, T)).toBe("good"); expect(categorize(59, T)).toBe("low");
    expect(categorize(70, { excellent: 90, good: 70 })).toBe("good");
  });
});

describe("roleRelevance", () => {
  it("scores close titles high and unrelated low", () => {
    expect(roleRelevance("Python Backend Developer", cand.targetRoles)).toBeGreaterThan(0.7);
    expect(roleRelevance("Full-Stack Engineer", cand.targetRoles)).toBeGreaterThan(0.7);
    expect(roleRelevance("Senior Accountant", cand.targetRoles)).toBeLessThan(0.2);
  });
});

describe("scoreMatch", () => {
  it("excellent when skills, salary, location all fit", () => {
    const r = scoreMatch(cand, job(), T);
    expect(r.matchingSkills).toEqual(["Python", "FastAPI"]);
    expect(r.optionalMissingSkills).toEqual(["Docker"]);
    expect(r.missingSkills).toEqual([]);
    expect(r.details.salaryFit.status).toBe("within");
    expect(r.details.experienceFit.status).toBe("fits");
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.details.worthApplying).toBe(true);
  });
  it("required skills weigh more than optional", () => {
    const missReq = scoreMatch(cand, job({ skills: [{ name: "Python", required: true }, { name: "Go", required: true }] }), T);
    const missOpt = scoreMatch(cand, job({ skills: [{ name: "Python", required: true }, { name: "Go", required: false }] }), T);
    expect(missOpt.score).toBeGreaterThan(missReq.score);
    expect(missReq.missingSkills).toEqual(["Go"]);
  });
  it("aliases match (React.js == react)", () => {
    const r = scoreMatch(cand, job({ skills: [{ name: "react", required: true }, { name: "Postgres", required: true }] }), T);
    expect(r.matchingSkills).toHaveLength(2);
  });
  it("unknown inputs are neutral and labelled Unknown, never invented", () => {
    const r = scoreMatch(cand, job({ salaryMin: null, salaryMax: null, experienceMin: null, experienceMax: null, location: null, workMode: null, skills: [] }), T);
    expect(r.details.salaryFit.status).toBe("unknown");
    expect(r.details.salaryFit.detail).toMatch(/Unknown/);
    expect(r.details.experienceFit.status).toBe("unknown");
    expect(r.details.locationFit.status).toBe("unknown");
    expect(r.details.workModeFit.status).toBe("unknown");
    expect(r.details.mismatchReasons.join(" ")).toMatch(/Unknown/);
    expect(r.breakdown.salary).toBe(5); expect(r.breakdown.experience).toBe(7.5);
    expect(r.breakdown.skills).toBe(22.5);
  });
  it("candidate years unknown => experience unknown, not assumed", () => {
    const r = scoreMatch({ ...cand, yearsExperience: null }, job({ experienceMin: 5, experienceMax: 8 }), T);
    expect(r.details.experienceFit.status).toBe("unknown");
  });
  it("experience fits / stretch / below", () => {
    expect(scoreMatch(cand, job({ experienceMin: 1 }), T).details.experienceFit.status).toBe("fits");
    expect(scoreMatch(cand, job({ experienceMin: 2 }), T).details.experienceFit.status).toBe("stretch");
    const below = scoreMatch(cand, job({ experienceMin: 5, experienceMax: 8 }), T);
    expect(below.details.experienceFit.status).toBe("below");
    expect(below.details.worthApplying).toBe(false);
  });
  it("salary below / above / different currency", () => {
    expect(scoreMatch(cand, job({ salaryMin: 20000, salaryMax: 25000 }), T).details.salaryFit.status).toBe("below");
    expect(scoreMatch(cand, job({ salaryMin: 90000, salaryMax: 120000 }), T).details.salaryFit.status).toBe("above");
    expect(scoreMatch(cand, job({ salaryCurrency: "USD" }), T).details.salaryFit.status).toBe("unknown");
  });
  it("work mode mismatch is flagged", () => {
    const r = scoreMatch({ ...cand, workModes: ["remote"] }, job({ workMode: "onsite" }), T);
    expect(r.details.workModeFit.status).toBe("mismatch");
    expect(r.details.worthApplying).toBe(false);
  });
  it("remote job matches location", () => {
    const r = scoreMatch(cand, job({ workMode: "remote", location: "Worldwide" }), T);
    expect(r.details.locationFit.status).toBe("match");
  });
  it("internship excluded when user opted out", () => {
    const r = scoreMatch({ ...cand, includeInternshipsContract: false }, job({ jobType: "internship" }), T);
    expect(r.details.mismatchReasons.join(" ")).toMatch(/internship/);
    expect(r.details.worthApplying).toBe(false);
  });
  it("education: masters-only requirement is below for a bachelor's holder", () => {
    const r = scoreMatch(cand, job({ description: "Master's degree is required." }), T);
    expect(r.details.educationFit.status).toBe("below");
  });
  it("unrelated job scores low", () => {
    const r = scoreMatch(cand, job({ title: "Senior Accountant", skills: [{ name: "Tally", required: true }, { name: "GST", required: true }], experienceMin: 6, location: "Paris", workMode: "onsite" }), T);
    expect(categorize(r.score, T)).toBe("low");
  });
  it("score is bounded and thresholds drive category", () => {
    const r = scoreMatch(cand, job(), { excellent: 99, good: 95 });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
