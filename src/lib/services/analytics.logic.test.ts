import { describe, expect, it } from "vitest";
import { countBy, interviewConversion, orderStatuses, pct, responseRate, roleBucket, weekStart, weeklyBuckets } from "./analytics.logic";
import { backoffMs } from "./tasks.logic";
import { dateInTz, formatReportSummary } from "./report.logic";
import { isWorkflowDue } from "./cron.logic";

describe("analytics aggregations", () => {
  it("countBy sorts desc and labels unknown", () => {
    expect(countBy([{ s: "a" }, { s: "b" }, { s: "a" }, { s: null }], (x) => x.s)).toEqual([{ name: "a", value: 2 }, { name: "b", value: 1 }, { name: "Unknown", value: 1 }]);
  });
  it("pct returns null for zero denominator", () => { expect(pct(1, 0)).toBeNull(); expect(pct(1, 3)).toBe(33.3); });
  it("roleBucket", () => {
    expect(roleBucket("Senior Full Stack Developer")).toBe("Full Stack");
    expect(roleBucket("Python Backend Engineer")).toBe("Python");
    expect(roleBucket("Machine Learning Engineer")).toBe("AI / ML");
    expect(roleBucket("Barista")).toBe("Other");
  });
  it("weekStart is Monday", () => { expect(weekStart(new Date("2026-11-15T12:00:00Z"))).toBe("2026-11-09"); expect(weekStart(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16"); });
  it("weeklyBuckets zero-fills 12 weeks and counts", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    const w = weeklyBuckets({ discovered: [new Date("2026-11-10T00:00:00Z"), new Date("2026-11-16T01:00:00Z"), new Date("2020-01-01")], applied: [], emailsSent: [new Date("2026-11-17T00:00:00Z")] }, now, 12);
    expect(w).toHaveLength(12);
    expect(w[11]).toMatchObject({ week: "2026-11-16", discovered: 1, emailsSent: 1 });
    expect(w[10]).toMatchObject({ week: "2026-11-09", discovered: 1 });
    expect(w.reduce((a, p) => a + p.discovered, 0)).toBe(2);
  });
  it("responseRate", () => {
    const sent = [{ jobId: "a", sentAt: new Date("2026-11-01") }, { jobId: "b", sentAt: new Date("2026-11-01") }];
    const r = responseRate(sent, [{ jobId: "a", receivedAt: new Date("2026-11-03"), category: "recruiter_message" }, { jobId: "b", receivedAt: new Date("2026-10-30"), category: "recruiter_message" }]);
    expect(r).toEqual({ sent: 2, replied: 1, rate: 50 });
    expect(responseRate([], []).rate).toBeNull();
  });
  it("interviewConversion", () => {
    expect(interviewConversion({ applied: 6, interview_scheduled: 2, selected: 1, rejected: 1 })).toEqual({ interviews: 3, engaged: 10, rate: 30 });
    expect(interviewConversion({}).rate).toBeNull();
  });
  it("orderStatuses includes all 11 in order", () => { const o = orderStatuses({ applied: 2 }); expect(o).toHaveLength(11); expect(o[3]).toEqual({ name: "applied", value: 2 }); });
});

describe("tasks/report/cron helpers", () => {
  it("backoff grows and caps", () => { expect(backoffMs(1)).toBe(1000); expect(backoffMs(2)).toBe(4000); expect(backoffMs(10)).toBe(60000); });
  it("dateInTz", () => { expect(dateInTz(new Date("2026-11-16T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-17"); });
  it("isWorkflowDue", () => { expect(isWorkflowDue(new Date("2026-11-16T03:30:00Z"), 9, "Asia/Kolkata")).toBe(true); expect(isWorkflowDue(new Date("2026-11-16T04:30:00Z"), 9, "Asia/Kolkata")).toBe(false); });
  it("report summary pluralizes and never claims sending", () => {
    const s = formatReportSummary({ date: "2026-11-16", newJobs: 1, matchedJobs: 0, excellentMatches: 0, goodMatches: 0, contactsFound: 2, draftsCreated: 1, pendingFollowUps: 0, applicationsTotal: 0, interviews: 0, topMatches: [], workflow: [{ name: "fetch", status: "failed", detail: "boom" }] });
    expect(s).toContain("1 new job discovered"); expect(s).toContain("nothing is sent automatically"); expect(s).toContain("fetch (boom)");
  });
});
