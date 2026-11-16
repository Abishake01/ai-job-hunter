import { describe, expect, it } from "vitest";
import { cleanUrl, extractAlertJobs, extractFields, extractRecruiter, parseFrom, parseSubjectRoleCompany } from "./extract";

describe("extraction", () => {
  it("parses From headers", () => {
    expect(parseFrom('"Priya S" <Priya@Acme.com>')).toEqual({ name: "Priya S", email: "priya@acme.com" });
    expect(parseFrom("a@b.co")).toEqual({ email: "a@b.co" });
  });
  it("strips tracking params", () => {
    expect(cleanUrl("https://x.com/jobs/1?utm_source=a&trk=b&keep=1#frag")).toBe("https://x.com/jobs/1?keep=1");
  });
  it("extracts role and company from subjects", () => {
    expect(parseSubjectRoleCompany("Your application for Backend Developer at Acme Corp")).toMatchObject({ title: "Backend Developer", company: "Acme Corp" });
    expect(parseSubjectRoleCompany("Thank you for applying to Globex!")).toMatchObject({ company: "Globex" });
    expect(parseSubjectRoleCompany("Lunch tomorrow?")).toEqual({});
  });
  it("extracts job entries from a LinkedIn-style alert and skips unparseable links", () => {
    const body = `Your job alert for Full Stack Developer\n\nFull Stack Developer\nAcme Corp\nBengaluru, Karnataka, India\nView job: https://www.linkedin.com/comm/jobs/view/3912345678/?trackingId=abc\n\nPython Engineer\nGlobex · Remote\nhttps://www.linkedin.com/jobs/view/3999999999\n\nhttps://www.linkedin.com/jobs/view/1111111111`;
    const jobs = extractAlertJobs(body);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ title: "Full Stack Developer", company: "Acme Corp", location: "Bengaluru, Karnataka, India", platform: "linkedin", sourceJobId: "3912345678" });
    expect(jobs[0].url).not.toContain("trackingId");
    expect(jobs[1]).toMatchObject({ title: "Python Engineer", company: "Globex" });
  });
  it("extracts recruiter details only when explicitly present", () => {
    const r = extractRecruiter('"Priya Sharma" <priya@acme.com>', "Hi,\nWe'd like to talk.\n\nPriya Sharma\nTechnical Recruiter\nAcme");
    expect(r).toEqual({ email: "priya@acme.com", name: "Priya Sharma", designation: "Technical Recruiter" });
    expect(extractRecruiter("Acme <no-reply@acme.com>", "x")).toBeUndefined();
    expect(extractRecruiter("LinkedIn <jobs@linkedin.com>", "x")).toBeUndefined();
    expect(extractRecruiter("<a@acme.com>", "no signature here")).toEqual({ email: "a@acme.com" });
  });
  it("extractFields does not store alert jobs under recruiter and drops unsubscribe links", () => {
    const f = extractFields({ subject: "Interview invitation: SDE at Acme", from: '"Ravi K" <ravi@acme.com>', body: "Join: https://meet.example.com/x\nunsubscribe https://acme.com/unsubscribe", category: "interview_invite" });
    expect(f.links).toEqual(["https://meet.example.com/x"]);
    expect(f.company).toBeTruthy();
    expect(f.recruiter?.email).toBe("ravi@acme.com");
  });
});
