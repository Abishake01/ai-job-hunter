import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, emailConversations, emailOutreach, gmailSyncHistory, jobs, userIntegrations } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { decryptJson, encryptJson } from "@/lib/utils/crypto";
import { createOAuthClient, GMAIL_SCOPES, isGmailOAuthConfigured, redirectUri } from "@/lib/gmail/oauth";
import { createGoogleGmailClient, type GmailClient } from "@/lib/gmail/client";
import { buildRawMessage } from "@/lib/gmail/drafts";
import { runSync, type SyncResult, type SyncStore } from "@/lib/gmail/sync";
import { EMAIL_CATEGORIES, type EmailCategory } from "@/lib/ai/heuristics/classify";
import { CLASSIFY_SYSTEM, classifyOutputSchema, classifyPrompt } from "@/lib/ai/prompts/gmail-classify";
import { generateStructured, isLlmConfigured } from "@/lib/ai/llm";
import { logActivity } from "@/lib/services/activity.service";
import { setJobStatus } from "@/lib/services/application.service";
import { upsertDiscoveredJob } from "@/lib/services/job.service";
import { upsertRecruiter } from "@/lib/services/recruiter.service";
import type { NormalizedJob } from "@/lib/job-sources/types";

type Tokens = { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string; token_type?: string | null };

async function getRow(userId: string) {
  const [r] = await db.select().from(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, "gmail")));
  return r ?? null;
}

async function saveTokens(userId: string, tokens: Tokens, accountEmail?: string | null) {
  const row = await getRow(userId);
  const prev = row?.secretsEnc ? decryptJson<Tokens>(row.secretsEnc) : {};
  const merged: Tokens = { ...prev, ...Object.fromEntries(Object.entries(tokens).filter(([, v]) => v != null)) }; // refresh_token is only sent on first consent: keep old
  const values = { secretsEnc: encryptJson(merged), scopes: (merged.scope ?? GMAIL_SCOPES.join(" ")).split(/\s+/).filter(Boolean), expiresAt: merged.expiry_date ? new Date(merged.expiry_date) : null, status: "connected" as const, ...(accountEmail ? { accountEmail } : {}) };
  await db.insert(userIntegrations).values({ userId, provider: "gmail", ...values }).onConflictDoUpdate({ target: [userIntegrations.userId, userIntegrations.provider], set: values });
}

/** Called by /api/gmail/callback after the CSRF state check. */
export async function completeOAuth(userId: string, code: string) {
  const oauth = createOAuthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token && !(await getRow(userId))?.secretsEnc) throw new HttpError(400, "Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.");
  oauth.setCredentials(tokens);
  const granted = (tokens.scope ?? "").split(/\s+/);
  const missing = GMAIL_SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) throw new HttpError(400, "Please grant all requested Gmail permissions (read, drafts, send).");
  const email = await createGoogleGmailClient(oauth, buildRawMessage).profileEmail();
  await saveTokens(userId, tokens, email);
  return { accountEmail: email };
}

/** Authorised Gmail client with automatic token refresh (refreshed tokens are re-encrypted and persisted). */
export async function getGmailClient(userId: string): Promise<GmailClient | null> {
  const row = await getRow(userId);
  if (!row?.secretsEnc || row.status === "revoked") return null;
  const oauth = createOAuthClient();
  oauth.setCredentials(decryptJson<Tokens>(row.secretsEnc));
  oauth.on("tokens", (t) => { void saveTokens(userId, t).catch((e) => console.error("[gmail] token persist failed", e)); });
  return createGoogleGmailClient(oauth, buildRawMessage);
}

/** Maps Google API auth failures to a "needs reconnect" status so the UI can prompt the user. */
export async function markIfAuthError(userId: string, e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (/invalid_grant|invalid_client|Invalid Credentials|unauthorized_client|401/.test(msg)) {
    await db.update(userIntegrations).set({ status: "needs_reauth" }).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, "gmail")));
  }
}

export async function isGmailConnected(userId: string) {
  const r = await getRow(userId);
  return !!r?.secretsEnc && r.status === "connected";
}

export async function getGmailStatus(userId: string) {
  const row = await getRow(userId);
  const history = await db.select().from(gmailSyncHistory).where(eq(gmailSyncHistory.userId, userId)).orderBy(desc(gmailSyncHistory.startedAt)).limit(10);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(emailConversations).where(eq(emailConversations.userId, userId));
  return {
    configured: isGmailOAuthConfigured(), redirectUri: redirectUri(),
    connected: !!row?.secretsEnc && row.status === "connected", needsReauth: row?.status === "needs_reauth",
    accountEmail: row?.accountEmail ?? null, scopes: row?.scopes ?? [], connectedAt: row?.createdAt ?? null,
    lastSync: history[0] ?? null, history, classifiedMessages: n,
  };
}

/** Revokes the grant at Google (best effort) and deletes stored tokens. Synced metadata is kept unless the user deletes data. */
export async function disconnectGmail(userId: string) {
  const row = await getRow(userId);
  if (row?.secretsEnc) {
    try {
      const t = decryptJson<Tokens>(row.secretsEnc);
      const tok = t.refresh_token ?? t.access_token;
      if (tok) await createOAuthClient().revokeToken(tok);
    } catch (e) { console.warn("[gmail] revoke failed (token deleted locally anyway)", e instanceof Error ? e.message : e); }
  }
  await db.delete(userIntegrations).where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, "gmail")));
  return { disconnected: true };
}

// ---------------- sync ----------------
const normCompany = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const GMAIL_THREAD_URL = (t: string) => `https://mail.google.com/mail/u/0/#all/${t}`;

/** Exported for runtime tests with a fake GmailClient. */
export function makeStore(userId: string): SyncStore {
  return {
    async hasConversation(id) {
      const [r] = await db.select({ id: emailConversations.id }).from(emailConversations).where(and(eq(emailConversations.userId, userId), eq(emailConversations.gmailMessageId, id))).limit(1);
      return !!r;
    },
    async knownRecipients() {
      const rows = await db.selectDistinct({ e: emailOutreach.toEmail }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.status, "sent")));
      return rows.map((r) => r.e).filter((e): e is string => !!e);
    },
    async registerUnsubscribe(fromEmail, reason) {
      const email = fromEmail.toLowerCase();
      const [sent] = await db.select({ id: emailOutreach.id }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), sql`lower(${emailOutreach.toEmail}) = ${email}`)).limit(1);
      if (!sent) return false;
      const { addUnsubscribe } = await import("@/lib/services/email.service");
      await addUnsubscribe(userId, email, reason);
      return true;
    },
    async resolveAssociation({ threadId, company, title, fromAddress }) {
      if (threadId) {
        const [o] = await db.select({ jobId: emailOutreach.jobId }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.gmailThreadId, threadId))).limit(1);
        if (o?.jobId) { const [j] = await db.select({ companyId: jobs.companyId }).from(jobs).where(and(eq(jobs.id, o.jobId), eq(jobs.userId, userId))); return { jobId: o.jobId, companyId: j?.companyId ?? null }; }
        const [c] = await db.select({ jobId: emailConversations.jobId, companyId: emailConversations.companyId }).from(emailConversations).where(and(eq(emailConversations.userId, userId), eq(emailConversations.gmailThreadId, threadId), sql`${emailConversations.companyId} is not null`)).limit(1);
        if (c) return { jobId: c.jobId, companyId: c.companyId };
      }
      let companyId: string | null = null;
      if (company) {
        const n = normCompany(company);
        const [c] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.userId, userId), sql`(${companies.normalizedName} = ${n} or regexp_replace(lower(${companies.name}), '[^a-z0-9]', '', 'g') = ${n})`)).limit(1);
        companyId = c?.id ?? null;
      }
      if (!companyId) {
        const domain = fromAddress.split("@")[1]?.toLowerCase();
        if (domain) { const [c] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.userId, userId), eq(companies.domain, domain))).limit(1); companyId = c?.id ?? null; }
      }
      if (!companyId) return { jobId: null, companyId: null };
      const cj = await db.select({ id: jobs.id, title: jobs.title, status: jobs.status }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.companyId, companyId))).orderBy(desc(jobs.updatedAt));
      const t = title?.toLowerCase();
      const byTitle = t ? cj.find((j) => j.title.toLowerCase().includes(t) || t.includes(j.title.toLowerCase())) : undefined;
      if (byTitle) return { jobId: byTitle.id, companyId };
      const engaged = cj.filter((j) => ["applied", "cold_email_drafted", "email_sent", "follow_up_required", "interview_scheduled"].includes(j.status));
      return { jobId: engaged.length === 1 ? engaged[0].id : cj.length === 1 ? cj[0].id : null, companyId };
    },
    async saveConversation(r) {
      await db.insert(emailConversations).values({ userId, ...r, extracted: JSON.parse(JSON.stringify(r.extracted)) }).onConflictDoNothing();
    },
    async createJobFromAlert(a) {
      const now = new Date();
      const nj: NormalizedJob = {
        title: a.title, company: a.company, description: null, requiredSkills: [], experienceMin: null, experienceMax: null, experienceText: null,
        salaryMin: null, salaryMax: null, salaryCurrency: null, salaryText: null, location: a.location, workMode: null, jobType: null, postedAt: null,
        applyUrl: a.url, source: a.platform, sourceJobId: a.sourceJobId, sourceUrl: a.url, discoveredAt: now,
      };
      return upsertDiscoveredJob(userId, nj, { platform: a.platform });
    },
    async applyStatus(jobId, status, note) {
      const [j] = await db.select({ status: jobs.status }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
      if (!j || j.status === "selected" || j.status === status) return false;
      try { await setJobStatus(userId, jobId, status, note); return true; } catch { return false; } // invalid transition => leave as is
    },
    async recordRecruiter({ companyId, jobId, recruiter, threadId }) {
      if (!threadId || !recruiter.email) return;
      await upsertRecruiter(userId, { companyId, jobId, name: recruiter.name ?? null, designation: recruiter.designation ?? null, email: recruiter.email, source: { url: GMAIL_THREAD_URL(threadId), type: "gmail", note: "Sender of a Gmail message" } });
    },
    async logReceived(jobId, title, detail, meta) { await logActivity(userId, jobId, "email_received", title, detail, meta); },
  };
}

async function llmClassifier(userId: string) {
  if (!(await isLlmConfigured(userId))) return undefined;
  return async (i: { subject: string; from: string; snippet?: string }): Promise<EmailCategory | null> => {
    const { data } = await generateStructured(userId, { system: CLASSIFY_SYSTEM, prompt: classifyPrompt(i), schema: classifyOutputSchema });
    return (EMAIL_CATEGORIES as readonly string[]).includes(data.category) ? (data.category as EmailCategory) : null;
  };
}

/** Targeted sync: only messages matching job-search queries are fetched; metadata only is stored. */
export async function syncGmail(userId: string, opts: { days?: number } = {}): Promise<SyncResult & { historyId: string }> {
  const client = await getGmailClient(userId);
  if (!client) throw new HttpError(409, "Gmail is not connected");
  const days = Math.max(1, Math.min(90, opts.days ?? 14));
  const [h] = await db.insert(gmailSyncHistory).values({ userId }).returning();
  try {
    const res = await runSync(client, makeStore(userId), { days, classifyWithLlm: await llmClassifier(userId) });
    const fatal = res.errors.length > 0 && res.scanned === 0 && res.relevant === 0 && res.errors.every((e) => e.startsWith("search:"));
    await db.update(gmailSyncHistory).set({ finishedAt: new Date(), status: fatal ? "error" : "ok", scanned: res.scanned, relevant: res.relevant, jobsCreated: res.jobsCreated, error: res.errors.length ? res.errors.slice(0, 5).join(" | ") : null }).where(eq(gmailSyncHistory.id, h.id));
    if (fatal) { await markIfAuthError(userId, new Error(res.errors[0])); throw new HttpError(502, `Gmail sync failed: ${res.errors[0]}`); }
    return { ...res, historyId: h.id };
  } catch (e) {
    if (!(e instanceof HttpError)) {
      await db.update(gmailSyncHistory).set({ finishedAt: new Date(), status: "error", error: (e instanceof Error ? e.message : "error").slice(0, 300) }).where(eq(gmailSyncHistory.id, h.id));
      await markIfAuthError(userId, e);
    }
    throw e;
  }
}

export async function listMessages(userId: string, f: { category?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, f.page ?? 1), pageSize = Math.min(100, f.pageSize ?? 25);
  const where = and(eq(emailConversations.userId, userId), f.category ? eq(emailConversations.category, f.category) : undefined);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(emailConversations).where(where);
  const items = await db.select({
    id: emailConversations.id, category: emailConversations.category, subject: emailConversations.subject, fromAddress: emailConversations.fromAddress, snippet: emailConversations.snippet,
    receivedAt: emailConversations.receivedAt, extracted: emailConversations.extracted, jobId: emailConversations.jobId, jobTitle: jobs.title, companyName: companies.name, gmailThreadId: emailConversations.gmailThreadId,
  }).from(emailConversations).leftJoin(jobs, eq(jobs.id, emailConversations.jobId)).leftJoin(companies, eq(companies.id, emailConversations.companyId))
    .where(where).orderBy(desc(emailConversations.receivedAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, total: n, page, pageSize };
}

/** Users with Gmail connected (for /api/cron/sync-gmail). */
export async function listConnectedGmailUsers(): Promise<string[]> {
  const rows = await db.select({ userId: userIntegrations.userId }).from(userIntegrations).where(and(eq(userIntegrations.provider, "gmail"), eq(userIntegrations.status, "connected")));
  return rows.map((r) => r.userId);
}
