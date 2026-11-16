/**
 * Minimal Gmail abstraction. Everything that talks to Google goes through `GmailClient`, so sync/classification
 * logic can be unit-tested with a fake. The real implementation (googleapis) lives in `createGoogleGmailClient`.
 */
import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export type GmailMessage = {
  id: string; threadId: string | null; subject: string; from: string; snippet: string;
  receivedAt: Date | null;
  /** Plain-text body, held in memory ONLY for field extraction. Callers must never persist it. */
  bodyText: string;
};
export type OutgoingMail = { to: string; subject: string; body: string; attachments?: { filename: string; mimeType: string; data: Buffer }[]; threadId?: string | null };

export interface GmailClient {
  /** Message ids matching a Gmail search query (newest first). */
  search(query: string, max: number): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage | null>;
  /** Creates a DRAFT only (gmail.compose). Never sends. */
  createDraft(mail: OutgoingMail): Promise<{ draftId: string; messageId: string | null }>;
  /** Sends mail (gmail.send). Only called from the explicit approved-send action in email.service. */
  send(mail: OutgoingMail): Promise<{ messageId: string; threadId: string | null }>;
  /** Mailbox address, used to label the connected account. */
  profileEmail(): Promise<string | null>;
}

const header = (h: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) => h?.find((x) => x.name?.toLowerCase() === name)?.value ?? "";
const decode = (d?: string | null) => (d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");

function plainText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  for (const p of part.parts ?? []) { const t = plainText(p); if (t) return t; }
  if (part.mimeType === "text/html" && part.body?.data) return decode(part.body.data).replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, "\n$1\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
  return "";
}

export function createGoogleGmailClient(auth: OAuth2Client, buildRaw: (m: OutgoingMail) => string): GmailClient {
  const gm = google.gmail({ version: "v1", auth });
  return {
    async search(query, max) {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const r = await gm.users.messages.list({ userId: "me", q: query, maxResults: Math.min(100, max - ids.length), pageToken });
        for (const m of r.data.messages ?? []) if (m.id) ids.push(m.id);
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken && ids.length < max);
      return ids;
    },
    async getMessage(id) {
      const r = await gm.users.messages.get({ userId: "me", id, format: "full" });
      const h = r.data.payload?.headers;
      return {
        id, threadId: r.data.threadId ?? null, subject: header(h, "subject"), from: header(h, "from"), snippet: r.data.snippet ?? "",
        receivedAt: r.data.internalDate ? new Date(Number(r.data.internalDate)) : null, bodyText: plainText(r.data.payload),
      };
    },
    async createDraft(mail) {
      const r = await gm.users.drafts.create({ userId: "me", requestBody: { message: { raw: buildRaw(mail), threadId: mail.threadId ?? undefined } } });
      return { draftId: r.data.id ?? "", messageId: r.data.message?.id ?? null };
    },
    async send(mail) {
      const r = await gm.users.messages.send({ userId: "me", requestBody: { raw: buildRaw(mail), threadId: mail.threadId ?? undefined } });
      return { messageId: r.data.id ?? "", threadId: r.data.threadId ?? null };
    },
    async profileEmail() {
      const r = await gm.users.getProfile({ userId: "me" });
      return r.data.emailAddress ?? null;
    },
  };
}
