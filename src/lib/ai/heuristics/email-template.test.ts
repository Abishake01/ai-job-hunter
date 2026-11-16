import { describe, expect, it } from "vitest";
import { assembleEmail, findUnsupportedClaims, templateEmail, type EmailFacts, type EmailKind } from "./email-template";
import { buildEmailPrompt, EMAIL_SYSTEM } from "../prompts/email";

const FOOTER = 'If you\'d rather not hear from me, just reply "unsubscribe" and I won\'t contact you again.';
const full: EmailFacts = {
  candidate: { fullName: "Asha Rao", headline: "Full stack developer", currentTitle: "Associate Software Engineer", currentCompany: "TruConsent", yearsExperience: 1, education: "B.E. Computer Science and Engineering", graduationYear: 2026, phone: "+91 90000 00000", email: null, location: "Chennai", skills: ["Python", "FastAPI", "React.js", "PostgreSQL"], projects: [{ name: "JobTracker", description: "Tracks applications end to end. Built with Next.js." }], portfolioUrl: "https://asha.dev", linkedinUrl: "https://linkedin.com/in/asha", githubUrl: "https://github.com/asha" },
  job: { title: "Backend Developer", company: "Acme", location: "Remote", workMode: "remote", requiredSkills: ["python", "FastAPI", "Kubernetes"], applyUrl: "https://acme.com/jobs/1" },
  recruiter: { name: "Priya Sharma", designation: "Recruiter" },
  resume: { name: "Backend CV", filename: "asha_backend.pdf" }, followUp: { originalSubject: "Application for Backend Developer at Acme", sentAt: new Date("2026-03-01") }, footer: FOOTER,
};
const bare: EmailFacts = { ...full, candidate: { ...full.candidate, fullName: null, headline: null, currentTitle: null, currentCompany: null, yearsExperience: null, education: null, graduationYear: null, phone: null, skills: [], projects: [], portfolioUrl: null, linkedinUrl: null, githubUrl: null }, recruiter: null, resume: null, job: { ...full.job, requiredSkills: [], applyUrl: null } };
const KINDS: EmailKind[] = ["direct_application", "recruiter_outreach", "hiring_manager_intro", "follow_up", "general_inquiry"];

describe("email templates", () => {
  for (const k of KINDS) {
    it(`${k}: includes resume line, links, footer and passes the fabrication audit`, () => {
      const d = templateEmail(k, full);
      expect(d.subject.length).toBeGreaterThan(3);
      expect(d.body).toContain("I've attached my resume (asha_backend.pdf)");
      for (const u of [full.candidate.portfolioUrl, full.candidate.linkedinUrl, full.candidate.githubUrl]) expect(d.body).toContain(u!);
      expect(d.body.trimEnd().endsWith(FOOTER)).toBe(true);
      expect(d.body).toContain("Hi Priya,");
      expect(findUnsupportedClaims(`${d.subject}\n${d.body}`, full)).toEqual([]);
    });
    it(`${k}: with no profile data invents nothing and reminds about the resume`, () => {
      const d = templateEmail(k, bare);
      expect(d.body).not.toMatch(/years?|TruConsent|Python|JobTracker|₹|attached/i);
      expect(d.body).toContain("Hello Hiring Team,");
      expect(d.reminders.join(" ")).toMatch(/resume/i);
      expect(d.body).toContain(FOOTER);
      expect(findUnsupportedClaims(d.body, bare)).toEqual([]);
    });
  }
  it("only claims skills the candidate has and highlights job overlap", () => {
    const d = templateEmail("direct_application", full);
    expect(d.body).toMatch(/Python and FastAPI/);
    expect(d.body).not.toContain("Kubernetes");
    expect(d.body).toContain("1 year of experience");
  });
  it("follow-up references the original email", () => {
    const d = templateEmail("follow_up", full);
    expect(d.subject).toBe("Re: Application for Backend Developer at Acme");
    expect(d.body).toContain("2026-03-01");
  });
  it("assembleEmail adds the footer and an attachment line only with a resume", () => {
    const a = assembleEmail({ subject: "S", body: "Body" }, full);
    expect(a.body).toContain("Best regards,\nAsha Rao");
    expect(assembleEmail({ subject: "S", body: "Body" }, bare).body).not.toMatch(/attached my resume/);
  });
});

describe("anti-fabrication audit", () => {
  it("flags invented experience, salary, URLs and emails", () => {
    const bad = findUnsupportedClaims("I have 5 years of experience, expecting 12 LPA. See https://evil.example and mail x@y.com", full);
    expect(bad.length).toBeGreaterThanOrEqual(4);
  });
  it("accepts profile-backed claims", () => {
    expect(findUnsupportedClaims("I have 1 year of experience. See https://asha.dev", full)).toEqual([]);
  });
});

describe("LLM prompt", () => {
  it("states the facts-only rules and carries the facts", () => {
    expect(EMAIL_SYSTEM).toMatch(/ONLY facts/);
    expect(EMAIL_SYSTEM).toMatch(/NEVER invent/);
    const p = buildEmailPrompt("direct_application", full, "resume text", "keep it short");
    expect(p).toContain("Backend Developer");
    expect(p).toContain("keep it short");
    expect(p).not.toContain("unsubscribe");
  });
});
