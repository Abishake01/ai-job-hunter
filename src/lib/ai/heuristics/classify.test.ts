import { describe, expect, it } from "vitest";
import { classifyByRules } from "./classify";

const c = (subject: string, from = "x@acme.com", snippet = "") => classifyByRules({ subject, from, snippet }).category;

describe("classifyByRules", () => {
  it("detects rejections before interview mentions", () => {
    expect(c("Update on your application", "hr@acme.com", "Unfortunately we will not be moving forward after the interview")).toBe("rejection");
    expect(c("Your application to Acme", "jobs@acme.com", "We regret to inform you")).toBe("rejection");
  });
  it("detects selection/offers", () => {
    expect(c("Offer letter - Software Engineer", "hr@acme.com")).toBe("selection");
    expect(c("Congratulations! We are pleased to offer you the role")).toBe("selection");
  });
  it("detects interview invites", () => {
    expect(c("Interview invitation: Backend Developer")).toBe("interview_invite");
    expect(c("Next steps", "talent@acme.com", "Please share your availability for a technical round")).toBe("interview_invite");
  });
  it("detects application acknowledgements", () => {
    expect(c("Thank you for applying to Acme")).toBe("application_ack");
    expect(c("Application received", "no-reply@greenhouse.io")).toBe("application_ack");
  });
  it("detects job alerts from job boards only", () => {
    expect(c("5 new jobs for Full Stack Developer in Bengaluru", "jobalerts-noreply@linkedin.com")).toBe("job_alert");
    expect(c("Job alert: Python Developer", "alerts@naukri.com")).toBe("job_alert");
    expect(c("Job alert: Python Developer", "someone@random.org")).not.toBe("job_alert");
  });
  it("does not misread job-board digests mentioning interviews", () => {
    expect(c("New jobs for you + interview tips", "jobs-listings@linkedin.com")).toBe("job_alert");
  });
  it("detects recruiter outreach and follow-ups", () => {
    expect(c("Exciting opportunity at Acme", "priya@acme.com", "I came across your profile")).toBe("recruiter_message");
    expect(c("Following up on my last note", "priya@acme.com")).toBe("follow_up");
  });
  it("returns null for unrelated mail", () => {
    expect(classifyByRules({ subject: "Your electricity bill", from: "billing@power.co", snippet: "Amount due" }).category).toBeNull();
    expect(c("Weekend sale 50% off", "promo@shop.com")).toBeNull();
  });
});
