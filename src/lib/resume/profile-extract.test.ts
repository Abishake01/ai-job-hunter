import { describe, expect, it } from "vitest";
import { extractProfileHeuristic, monthsOfExperience } from "./profile-extract";

const RESUME = `ABISHAKE T
Chennai, Tamil Nadu | 7305707379 | abishake381@gmail.com
linkedin.com/in/abishake-t | github.com/Abishake01

SUMMARY
Full-stack engineer who builds AI-powered web apps with Python and React.

EXPERIENCE
Associate Software Engineer
TruConsent  Jan 2026 - Present
• Built consent management APIs using FastAPI and PostgreSQL
• Integrated LLM APIs into the product
Software Intern | Acme Labs | Jun 2025 - Dec 2025
• Developed React dashboards

EDUCATION
B.E. Computer Science and Engineering, Anna University 2022 - 2026

SKILLS
Python, FastAPI, Django, React.js, TypeScript, PostgreSQL, AWS, Git

PROJECTS
ShopConnect CRM | Tech: Next.js, MongoDB, Node.js
• Field sales CRM with demo login and Atlas deployment
Reels Notes
• Expo and Express app for saving reels with notes
`;

describe("extractProfileHeuristic", () => {
  const p = extractProfileHeuristic(RESUME, new Date("2026-11-21"));
  it("reads contact and identity", () => {
    expect(p.fullName).toBe("Abishake T"); expect(p.email).toBe("abishake381@gmail.com"); expect(p.phone).toBe("7305707379");
    expect(p.githubUrl).toBe("https://github.com/Abishake01"); expect(p.linkedinUrl).toBe("https://linkedin.com/in/abishake-t"); expect(p.location).toMatch(/Chennai/);
  });
  it("reads summary, education, graduation year, skills", () => {
    expect(p.summary).toMatch(/Full-stack engineer/); expect(p.education).toMatch(/B\.E\./); expect(p.graduationYear).toBe(2026);
    expect(p.skills.primary).toEqual(expect.arrayContaining(["Python", "FastAPI", "React", "PostgreSQL"]));
  });
  it("parses experience, current role and years from dates only", () => {
    expect(p.experience.length).toBe(2);
    expect(p.experience[0]).toMatchObject({ title: "Associate Software Engineer", company: "TruConsent", end: "Present" });
    expect(p.experience[1]).toMatchObject({ title: "Software Intern", company: "Acme Labs" });
    expect(p.currentTitle).toBe("Associate Software Engineer"); expect(p.currentCompany).toBe("TruConsent");
    expect(p.yearsExperience).toBe(1.5); // Jun-Dec 2025 (7m) + Jan-Nov 2026 (11m) = 18m
    expect(p.headline).toMatch(/^Associate Software Engineer \(/);
  });
  it("parses projects with tech", () => {
    expect(p.projects.map((x) => x.name)).toEqual(["ShopConnect CRM", "Reels Notes"]);
    expect(p.projects[0].tech).toEqual(expect.arrayContaining(["Next.js", "MongoDB"]));
  });
  it("returns nulls for text with nothing recognisable (no invention)", () => {
    const e = extractProfileHeuristic("lorem ipsum dolor sit amet");
    expect(e.yearsExperience).toBeNull(); expect(e.experience).toEqual([]); expect(e.education).toBeNull(); expect(e.summary).toBeNull();
  });
});
describe("monthsOfExperience", () => {
  it("merges overlapping ranges", () => expect(monthsOfExperience([{ start: "Jan 2025", end: "Jun 2025" }, { start: "Apr 2025", end: "Aug 2025" }])).toBe(8));
});
