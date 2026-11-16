import { describe, expect, it } from "vitest";
import { JOB_STATUSES } from "@/lib/db/schema";
import { detectFollowUpJobIds, needsFollowUp, validateTransition } from "./application.logic";

describe("validateTransition", () => {
  it("rejects unknown statuses", () => { expect(validateTransition("discovered", "bogus").ok).toBe(false); expect(validateTransition("weird", "applied").ok).toBe(false); });
  it("same status is a no-op", () => { expect(validateTransition("applied", "applied")).toEqual({ ok: true, noop: true }); });
  it("allows normal pipeline moves", () => { expect(validateTransition("discovered", "shortlisted")).toEqual({ ok: true, noop: false }); expect(validateTransition("shortlisted", "applied").ok).toBe(true); });
  it("blocks Selected from an untouched job", () => { expect(validateTransition("discovered", "selected").ok).toBe(false); expect(validateTransition("interview_scheduled", "selected").ok).toBe(true); });
  it("follow-up needs engagement", () => { expect(validateTransition("discovered", "follow_up_required").ok).toBe(false); expect(validateTransition("email_sent", "follow_up_required").ok).toBe(true); });
  it("allows reopening terminal jobs", () => { expect(validateTransition("rejected", "shortlisted").ok).toBe(true); });
  it("every status is a valid target from applied or discovered where allowed", () => { for (const s of JOB_STATUSES) expect(typeof validateTransition("applied", s).ok).toBe("boolean"); });
});

describe("follow-up detection", () => {
  const sentAt = new Date("2026-11-02T10:00:00Z"); // Monday
  const sent = { jobId: "j1", sentAt };
  it("not due before N business days", () => { expect(needsFollowUp(sent, [], new Date("2026-11-06T10:00:00Z"), 5)).toBe(false); });
  it("due after N business days with no reply", () => { expect(needsFollowUp(sent, [], new Date("2026-11-09T10:00:00Z"), 5)).toBe(true); });
  it("weekends do not count", () => { expect(needsFollowUp(sent, [], new Date("2026-11-08T10:00:00Z"), 5)).toBe(false); });
  it("a later reply cancels it", () => {
    const r = [{ jobId: "j1", receivedAt: new Date("2026-11-04T00:00:00Z"), category: "recruiter_message" }];
    expect(needsFollowUp(sent, r, new Date("2026-11-20T00:00:00Z"), 5)).toBe(false);
  });
  it("ignores replies before the send, other jobs, and non-reply categories", () => {
    const r = [{ jobId: "j1", receivedAt: new Date("2026-11-01T00:00:00Z"), category: "recruiter_message" }, { jobId: "j2", receivedAt: new Date("2026-11-04T00:00:00Z"), category: "rejection" }, { jobId: "j1", receivedAt: new Date("2026-11-04T00:00:00Z"), category: "job_alert" }];
    expect(needsFollowUp(sent, r, new Date("2026-11-20T00:00:00Z"), 5)).toBe(true);
  });
  it("dedupes per job using the latest send", () => {
    const ids = detectFollowUpJobIds([sent, { jobId: "j1", sentAt: new Date("2026-11-10T10:00:00Z") }, { jobId: "j2", sentAt }], [], new Date("2026-11-12T00:00:00Z"), 5);
    expect(ids).toEqual(["j2"]);
  });
});
