import { describe, expect, it } from "vitest";
import { evaluateSendGate, isUniqueViolation, makeSentKey, type SendGateInput } from "./send-gate";
import { assertSafeAddress, buildRawMessage, encodeHeader } from "./drafts";

const ok: SendGateInput = { status: "approved", confirm: true, gmailConnected: true, toEmail: "HR@Acme.com", unsubscribed: false, doNotContact: false, duplicateExists: false, jobId: "j1", kind: "direct_application" };
const code = (o: Partial<SendGateInput>) => { const r = evaluateSendGate({ ...ok, ...o }); return r.ok ? "ok" : r.code; };

describe("send gate", () => {
  it("allows only approved + confirm:true and builds a normalised sentKey", () => {
    const r = evaluateSendGate(ok);
    expect(r).toEqual({ ok: true, sentKey: "j1|direct_application|hr@acme.com" });
    expect(makeSentKey(null, "follow_up", " A@B.com ")).toBe("none|follow_up|a@b.com");
  });
  it("blocks unapproved statuses", () => {
    for (const s of ["draft", "gmail_draft_created", "failed"]) expect(code({ status: s })).toBe("not_approved");
  });
  it("requires explicit confirm === true", () => {
    for (const c of [undefined, false, "true", 1, null]) expect(code({ confirm: c })).toBe("no_confirm");
  });
  it("blocks duplicates and already-sent", () => {
    expect(code({ duplicateExists: true })).toBe("duplicate");
    expect(code({ status: "sent" })).toBe("duplicate");
  });
  it("blocks unsubscribed and do-not-contact recipients", () => {
    expect(code({ unsubscribed: true })).toBe("unsubscribed");
    expect(code({ doNotContact: true })).toBe("do_not_contact");
  });
  it("blocks without recipient or Gmail connection", () => {
    expect(code({ toEmail: null })).toBe("no_recipient");
    expect(code({ gmailConnected: false })).toBe("gmail_not_connected");
  });
  it("recognises unique violations across driver error shapes", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint "email_outreach_sent_key_uq"'))).toBe(true);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});

describe("raw message builder", () => {
  const dec = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  it("builds a plain message and encodes non-ASCII subjects", () => {
    const m = dec(buildRawMessage({ to: "a@b.com", subject: "Hello ₹", body: "Hi\nthere" }));
    expect(m).toContain("To: a@b.com");
    expect(m).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(encodeHeader("plain")).toBe("plain");
  });
  it("adds attachments as multipart/mixed", () => {
    const m = dec(buildRawMessage({ to: "a@b.com", subject: "s", body: "b", attachments: [{ filename: "cv.pdf", mimeType: "application/pdf", data: Buffer.from("PDF") }] }));
    expect(m).toContain("multipart/mixed");
    expect(m).toContain('filename="cv.pdf"');
  });
  it("rejects header injection", () => {
    expect(() => assertSafeAddress("a@b.com\r\nBcc: x@y.com")).toThrow();
    expect(dec(buildRawMessage({ to: "a@b.com", subject: "x\r\nBcc: evil@z.com", body: "b" }))).not.toMatch(/^Bcc:/m);
  });
});
