import { describe, expect, it } from "vitest";
import {
  detectJobType, detectWorkMode, extractSkills, htmlToText, makeFingerprint, matchesKeywords, normalizeCompany, normalizeUrl,
  parseExperience, parseJobText, parseSalary, isRecent, expandRoleKeywords, buildJob,
} from "./normalize";
import { parseRobots, robotsAllows } from "./http";

describe("normalizeUrl", () => {
  it("strips tracking, hash, www, trailing slash and sorts params", () => {
    expect(normalizeUrl("https://www.Example.com/jobs/123/?utm_source=x&b=2&a=1#apply")).toBe("example.com/jobs/123?a=1&b=2");
  });
  it("keeps meaningful ids like gh_jid", () => {
    expect(normalizeUrl("https://stripe.com/jobs/search?gh_jid=8172487&gh_src=abc")).toBe("stripe.com/jobs/search?gh_jid=8172487");
  });
  it("rejects non-http and junk", () => {
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeUrl("nonsense")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
});

describe("makeFingerprint", () => {
  it("is stable across company suffixes, casing and (m/f/d) markers", () => {
    const a = makeFingerprint("Acme Technologies Pvt. Ltd.", "Backend Engineer (m/f/d)", "Bengaluru, India");
    const b = makeFingerprint("ACME", "backend  engineer", "bengaluru");
    expect(a).toBe(b);
  });
  it("buckets any remote location together", () => {
    expect(makeFingerprint("X", "Dev", "Remote — USA")).toBe(makeFingerprint("X", "Dev", "Remote"));
  });
  it("differs for different roles/locations", () => {
    expect(makeFingerprint("X", "Software Engineer (Backend)", "Pune")).not.toBe(makeFingerprint("X", "Software Engineer (Frontend)", "Pune"));
    expect(makeFingerprint("X", "Dev", "Pune")).not.toBe(makeFingerprint("X", "Dev", "Delhi"));
  });
  it("normalizeCompany keeps non-suffix names", () => { expect(normalizeCompany("Stripe, Inc.")).toBe("stripe"); });
});

describe("parseExperience", () => {
  it("parses ranges", () => {
    expect(parseExperience("Requires 2-4 years of experience in Python")).toMatchObject({ experienceMin: 2, experienceMax: 4 });
    expect(parseExperience("Experience: 3 to 5 yrs")).toMatchObject({ experienceMin: 3, experienceMax: 5 });
  });
  it("parses open-ended", () => {
    expect(parseExperience("5+ years of experience required")).toMatchObject({ experienceMin: 5, experienceMax: null });
    expect(parseExperience("minimum 2 years experience")).toMatchObject({ experienceMin: 2 });
  });
  it("handles freshers and months", () => {
    expect(parseExperience("Freshers welcome")).toMatchObject({ experienceMin: 0 });
    expect(parseExperience("6 months of experience")).toMatchObject({ experienceMin: 0.5 });
  });
  it("ignores years that are not about experience", () => {
    expect(parseExperience("Founded 10 years ago. We are a growing team.").experienceText).toBeNull();
    expect(parseExperience("").experienceMin).toBeNull();
  });
});

describe("parseSalary", () => {
  it("converts LPA ranges to monthly INR", () => {
    const s = parseSalary("Salary: ₹6-8 LPA");
    expect(s).toMatchObject({ salaryMin: 50000, salaryMax: 66667, salaryCurrency: "INR" });
  });
  it("single LPA / lakhs", () => {
    expect(parseSalary("CTC 12 LPA")).toMatchObject({ salaryMin: 100000, salaryMax: 100000 });
    expect(parseSalary("4.8 lakhs per annum")).toMatchObject({ salaryMin: 40000 });
  });
  it("explicit monthly INR", () => {
    expect(parseSalary("₹45,000 - ₹60,000 per month")).toMatchObject({ salaryMin: 45000, salaryMax: 60000, salaryCurrency: "INR" });
    expect(parseSalary("INR 30k - 40k / month")).toMatchObject({ salaryMin: 30000, salaryMax: 40000 });
  });
  it("annual foreign currency -> monthly", () => {
    expect(parseSalary("$85k - $155k")).toMatchObject({ salaryMin: 7083, salaryMax: 12917, salaryCurrency: "USD" });
    expect(parseSalary("$120,000 per year")).toMatchObject({ salaryMin: 10000 });
  });
  it("ambiguous amounts stay Unknown (never invented)", () => {
    const s = parseSalary("₹50,000 - 60,000");
    expect(s.salaryMin).toBeNull();
    expect(s.salaryText).toBeTruthy();
    expect(parseSalary("$40 per hour").salaryMin).toBeNull();
    expect(parseSalary("competitive salary")).toEqual({ salaryMin: null, salaryMax: null, salaryCurrency: null, salaryText: null });
  });
});

describe("work mode / job type", () => {
  it("detects modes", () => {
    expect(detectWorkMode("This is a hybrid role in Pune")).toBe("hybrid");
    expect(detectWorkMode("Fully remote, work from home")).toBe("remote");
    expect(detectWorkMode("On-site at our Chennai office")).toBe("onsite");
    expect(detectWorkMode("Remote or on-site")).toBeNull();
    expect(detectWorkMode("Nothing here")).toBeNull();
  });
  it("detects job types", () => {
    expect(detectJobType("Software Engineering Intern")).toBe("internship");
    expect(detectJobType("6 month contract")).toBe("contract");
    expect(detectJobType("Full-time")).toBe("full_time");
    expect(detectJobType("Engineer")).toBeNull();
  });
  it("parseJobText combines", () => {
    const r = parseJobText("Backend dev, hybrid, 2-4 years of experience, ₹6-8 LPA, full time");
    expect(r).toMatchObject({ workMode: "hybrid", experienceMin: 2, experienceMax: 4, salaryCurrency: "INR", jobType: "full_time" });
    expect(parseJobText("nothing")).toEqual({});
  });
});

describe("skills / keywords / age", () => {
  it("extracts vocabulary skills, splits optional", () => {
    const filler = "We build products. ".repeat(20);
    const s = extractSkills(`${filler} You know Python, FastAPI, React.js and PostgreSQL. ${filler} Nice to have: Kubernetes and Docker`);
    expect(s.required).toEqual(expect.arrayContaining(["python", "fastapi", "react", "postgresql"]));
    expect(s.optional).toEqual(expect.arrayContaining(["kubernetes", "docker"]));
    expect(s.required).not.toContain("java");
  });
  it("does not confuse java and javascript", () => {
    expect(extractSkills("javascript only").required).toEqual(["javascript"]);
  });
  it("keyword matching incl. fullstack variants", () => {
    const kws = expandRoleKeywords(["Full Stack Developer"]);
    expect(kws).toContain("full stack engineer");
    expect(matchesKeywords({ title: "Senior FullStack Engineer", description: null }, [], kws)).toBe(true);
    expect(matchesKeywords({ title: "Account Executive", description: "sell" }, [], kws)).toBe(false);
    expect(matchesKeywords({ title: "x", description: null }, [], [])).toBe(true);
  });
  it("isRecent keeps unknown dates", () => {
    const now = new Date("2026-01-30");
    expect(isRecent(null, 7, now)).toBe(true);
    expect(isRecent(new Date("2026-01-20"), 7, now)).toBe(false);
    expect(isRecent(new Date("2026-01-28"), 7, now)).toBe(true);
  });
  it("htmlToText decodes and structures", () => {
    expect(htmlToText("<p>A &amp; B</p><ul><li>one</li><li>two</li></ul>")).toBe("A & B\n\n- one\n- two");
  });
  it("buildJob never overrides structured values and leaves unknowns null", () => {
    const j = buildJob({ title: "Dev", company: "X", description: "We pay 2-4 years experience", location: null, postedAt: null, applyUrl: null, source: "t", sourceJobId: "1", sourceUrl: null, discoveredAt: new Date() }, { experienceMin: 9 });
    expect(j.experienceMin).toBe(9);
    expect(j.salaryMin).toBeNull();
    expect(j.workMode).toBeNull();
  });
});

describe("robots.txt", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: aijobhunter\nDisallow: /nope\n");
  it("uses the specific group when present", () => {
    expect(robotsAllows(rules, "/nope/x")).toBe(false);
    expect(robotsAllows(rules, "/private")).toBe(true);
  });
  it("longest match wins within the wildcard group", () => {
    const r = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok");
    expect(robotsAllows(r, "/private/x")).toBe(false);
    expect(robotsAllows(r, "/private/ok/1")).toBe(true);
    expect(robotsAllows(r, "/public")).toBe(true);
  });
});
