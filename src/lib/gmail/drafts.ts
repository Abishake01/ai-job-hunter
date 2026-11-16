/** RFC 5322 message construction for Gmail drafts/sends (pure). */
import type { OutgoingMail } from "./client";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const wrap76 = (s: string) => s.replace(/(.{76})/g, "$1\r\n");
/** RFC 2047 encoded-word for non-ASCII header values. Rejects CR/LF (header injection). */
export function encodeHeader(v: string): string {
  const clean = v.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}
export function assertSafeAddress(addr: string): string {
  const a = addr.trim();
  if (!/^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/.test(a)) throw new Error(`Invalid recipient address`);
  return a;
}

/** Builds the base64url `raw` payload for gmail.users.drafts.create / messages.send. */
export function buildRawMessage(m: OutgoingMail): string {
  const to = assertSafeAddress(m.to);
  const head = [`To: ${to}`, `Subject: ${encodeHeader(m.subject)}`, "MIME-Version: 1.0"];
  const encBody = wrap76(Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"));
  const textHeaders = ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64"];
  if (!m.attachments?.length) return b64url(Buffer.from([...head, ...textHeaders, "", encBody, ""].join("\r\n"), "utf8"));
  const boundary = `jh_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const parts = [`--${boundary}`, [...textHeaders, "", encBody].join("\r\n")];
  for (const a of m.attachments) {
    const fn = a.filename.replace(/[^\w.\- ]/g, "_");
    parts.push(`--${boundary}`, [`Content-Type: ${a.mimeType}; name="${fn}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${fn}"`, "", wrap76(a.data.toString("base64"))].join("\r\n"));
  }
  parts.push(`--${boundary}--`, "");
  return b64url(Buffer.from([...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n"), "utf8"));
}
