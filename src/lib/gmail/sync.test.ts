import { describe, expect, it } from "vitest";
import type { GmailClient, GmailMessage } from "./client";
import { buildSyncQueries, looksLikeUnsubscribeRequest, runSync, statusForCategory, type ConversationRow, type SyncStore } from "./sync";

function msg(p: Partial<GmailMessage> & { id: string }): GmailMessage {
  return { threadId: "t-" + p.id, subject: "", from: "x@y.com", snippet: "", receivedAt: new Date("2026-01-01"), bodyText: "", ...p };
}
function fakeClient(messages: GmailMessage[]): GmailClient & { queries: string[]; fetched: string[] } {
  const queries: string[] = [], fetched: string[] = [];
  return {
    queries, fetched,
    async search(q) { queries.push(q); return messages.map((m) => m.id); },
    async getMessage(id) { fetched.push(id); return messages.find((m) => m.id === id) ?? null; },
    async createDraft() { throw new Error("must not draft"); }, async send() { throw new Error("must not send"); }, async profileEmail() { return "me@x.com"; },
  };
}
function fakeStore(over: Partial<SyncStore> = {}) {
  const saved: ConversationRow[] = [], statuses: [string, string][] = [], created: string[] = [], unsub: string[] = [];
  const store: SyncStore = {
    async hasConversation(id) { return saved.some((s) => s.gmailMessageId === id); },
    async knownRecipients() { return ["rec@acme.com"]; },
    async registerUnsubscribe(e) { unsub.push(e); return e === "rec@acme.com"; },
    async resolveAssociation() { return { jobId: "job1", companyId: "co1" }; },
    async saveConversation(r) { saved.push(r); },
    async createJobFromAlert(j) { created.push(j.sourceJobId); return { jobId: "j-" + j.sourceJobId, created: true }; },
    async applyStatus(jobId, s) { statuses.push([jobId, s]); return true; },
    async recordRecruiter() {}, async logReceived() {},
    ...over,
  };
  return { store, saved, statuses, created, unsub };
}

describe("sync", () => {
  it("builds targeted queries (never a blanket inbox query)", () => {
    const q = buildSyncQueries(7, ["rec@acme.com"]);
    expect(q.every((x) => /newer_than:7d/.test(x))).toBe(true);
    expect(q[0]).toContain("from:linkedin.com");
    expect(q[1]).toMatch(/interview/);
    expect(q[2]).toContain("from:(rec@acme.com)");
  });
  it("classifies, stores metadata only, and drops unrelated mail", async () => {
    const client = fakeClient([
      msg({ id: "1", subject: "Interview invitation: SDE at Acme", from: '"R K" <rk@acme.com>', snippet: "Please pick a slot", bodyText: "SECRET BODY CONTENT" }),
      msg({ id: "2", subject: "Your electricity bill", from: "billing@power.co", snippet: "due" }),
    ]);
    const { store, saved, statuses } = fakeStore();
    const r = await runSync(client, store, { days: 7 });
    expect(r).toMatchObject({ scanned: 2, relevant: 1, statusUpdates: 1 });
    expect(saved).toHaveLength(1);
    expect(saved[0].category).toBe("interview_invite");
    expect(JSON.stringify(saved[0])).not.toContain("SECRET BODY");
    expect(statuses).toEqual([["job1", "interview_scheduled"]]);
  });
  it("creates jobs from alerts and does not attach alerts to a job/status", async () => {
    const body = "Full Stack Dev\nAcme\nPune\nhttps://www.linkedin.com/jobs/view/3912345678\n";
    const client = fakeClient([msg({ id: "a", subject: "1 new job for you", from: "jobalerts-noreply@linkedin.com", bodyText: body })]);
    const { store, saved, created, statuses } = fakeStore();
    const r = await runSync(client, store, { days: 7 });
    expect(r.jobsCreated).toBe(1);
    expect(created).toEqual(["3912345678"]);
    expect(saved[0].jobId).toBeNull();
    expect(statuses).toEqual([]);
  });
  it("maps rejection/selection to statuses and is idempotent for known messages", async () => {
    expect(statusForCategory("rejection")).toBe("rejected");
    expect(statusForCategory("selection")).toBe("selected");
    expect(statusForCategory("job_alert")).toBeNull();
    const client = fakeClient([msg({ id: "r", subject: "Update on your application", from: "hr@acme.com", snippet: "Unfortunately we are not moving forward" })]);
    const { store, saved } = fakeStore();
    await runSync(client, store, { days: 7 });
    const second = await runSync(client, store, { days: 7 });
    expect(saved).toHaveLength(1);
    expect(second.scanned).toBe(0);
  });
  it("honours unsubscribe replies from people we emailed", async () => {
    expect(looksLikeUnsubscribeRequest("Re: Application", "unsubscribe")).toBe(true);
    expect(looksLikeUnsubscribeRequest("Re: Application", "Happy to chat")).toBe(false);
    const client = fakeClient([msg({ id: "u", subject: "Re: Backend role", from: "rec@acme.com", snippet: "Please unsubscribe me" })]);
    const { store, unsub, saved } = fakeStore();
    const r = await runSync(client, store, { days: 7 });
    expect(unsub).toEqual(["rec@acme.com"]);
    expect(r.unsubscribes).toBe(1);
    expect(saved).toHaveLength(0);
  });
  it("uses the LLM only for ambiguous mail and caps calls; failures discard", async () => {
    const msgs = [msg({ id: "x1", subject: "Hello", from: "a@b.org", snippet: "hmm" }), msg({ id: "x2", subject: "Hello2", from: "a@b.org" })];
    let calls = 0;
    const { store, saved } = fakeStore();
    await runSync(fakeClient(msgs), store, { days: 7, maxLlmCalls: 1, classifyWithLlm: async () => { calls++; return "recruiter_message"; } });
    expect(calls).toBe(1);
    expect(saved).toHaveLength(1);
    const f = fakeStore();
    await runSync(fakeClient(msgs), f.store, { days: 7, classifyWithLlm: async () => { throw new Error("down"); } });
    expect(f.saved).toHaveLength(0);
  });
  it("isolates per-message errors", async () => {
    const client = fakeClient([msg({ id: "e", subject: "Interview invitation", from: "a@acme.com" })]);
    const { store } = fakeStore({ saveConversation: async () => { throw new Error("db down"); } });
    const r = await runSync(client, store, { days: 7 });
    expect(r.errors[0]).toContain("db down");
  });
});
