/**
 * Gmail sync orchestration. Pure w.r.t. infrastructure: talks to Gmail via `GmailClient` and to persistence via `SyncStore`,
 * so it can be tested with fakes. Only messages matching targeted search queries are ever fetched; only metadata,
 * a short snippet and extracted fields are persisted (never the body).
 */
import type { GmailClient, GmailMessage } from "./client";
import { classifyMessage } from "./classify";
import { extractFields, parseFrom, type AlertJob, type Extracted } from "./extract";
import { JOB_BOARD_DOMAINS, type EmailCategory, type ClassifyInput } from "@/lib/ai/heuristics/classify";

export const SYNC_KEYWORDS = ["interview", "application", "unfortunately", "recruiter", "job alert", "offer letter", "shortlisted", "hiring", "your profile", "opportunity", "assessment", "thank you for applying", "next steps"];

/** Targeted Gmail search queries: job-board senders, and job-search keywords in subjects. Unrelated mail never matches. */
export function buildSyncQueries(days: number, recipients: string[] = []): string[] {
  const d = Math.max(1, Math.min(90, Math.floor(days)));
  const senders = JOB_BOARD_DOMAINS.map((x) => `from:${x}`).join(" OR ");
  const kws = SYNC_KEYWORDS.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
  const qs = [`newer_than:${d}d (${senders})`, `newer_than:${d}d subject:(${kws}) -category:promotions -category:social`];
  // Replies from people WE emailed (so unsubscribe requests / recruiter replies are seen) - still a narrow, targeted query.
  const rec = recipients.filter((r) => /^[^\s()"]+@[^\s()"]+$/.test(r)).slice(0, 40);
  if (rec.length) qs.push(`newer_than:${d}d from:(${rec.join(" OR ")})`);
  return qs;
}

/** True when a reply asks to stop receiving mail (we promise to honour this in the footer). */
export function looksLikeUnsubscribeRequest(subject: string, snippet: string): boolean {
  const t = `${subject}\n${snippet}`.toLowerCase().replace(/^\s*re:\s*/, "");
  return /(^|\n|\s)(unsubscribe|stop emailing|do not contact|don't contact|remove me from|please stop)\b/.test(t.slice(0, 400));
}

export function statusForCategory(c: EmailCategory): "interview_scheduled" | "rejected" | "selected" | null {
  return c === "interview_invite" ? "interview_scheduled" : c === "rejection" ? "rejected" : c === "selection" ? "selected" : null;
}

export type ConversationRow = {
  gmailMessageId: string; gmailThreadId: string | null; category: EmailCategory; subject: string; fromAddress: string; snippet: string;
  receivedAt: Date | null; extracted: { company?: string; title?: string; links?: string[]; recruiter?: Extracted["recruiter"] };
  jobId: string | null; companyId: string | null;
};
export interface SyncStore {
  hasConversation(gmailMessageId: string): Promise<boolean>;
  /** Addresses we have emailed (used to target reply search & to honour unsubscribe replies). */
  knownRecipients(): Promise<string[]>;
  /** Adds the sender to the unsubscribe list / do-not-contact when it is an address we emailed. Returns true if registered. */
  registerUnsubscribe(fromEmail: string, reason: string): Promise<boolean>;
  resolveAssociation(a: { threadId: string | null; company?: string; title?: string; fromAddress: string }): Promise<{ jobId: string | null; companyId: string | null }>;
  saveConversation(row: ConversationRow): Promise<void>;
  /** Creates/dedupes a job from a parsed alert entry (backed by upsertDiscoveredJob). */
  createJobFromAlert(job: AlertJob): Promise<{ jobId: string; created: boolean }>;
  /** Applies a status change with guard rails; returns whether it changed. Must not throw for invalid transitions. */
  applyStatus(jobId: string, status: "interview_scheduled" | "rejected" | "selected", note: string): Promise<boolean>;
  /** Records a recruiter contact seen in a mail (provenance = the Gmail thread). */
  recordRecruiter(a: { companyId: string; jobId: string | null; recruiter: NonNullable<Extracted["recruiter"]>; threadId: string | null }): Promise<void>;
  logReceived(jobId: string, title: string, detail: string | null, meta: Record<string, unknown>): Promise<void>;
}

export type SyncOptions = { days: number; maxMessages?: number; classifyWithLlm?: (i: ClassifyInput) => Promise<EmailCategory | null>; maxLlmCalls?: number };
export type SyncResult = { unsubscribes: number; scanned: number; relevant: number; jobsCreated: number; alertsParsed: number; statusUpdates: number; errors: string[] };

export async function runSync(client: GmailClient, store: SyncStore, opts: SyncOptions): Promise<SyncResult> {
  const res: SyncResult = { unsubscribes: 0, scanned: 0, relevant: 0, jobsCreated: 0, alertsParsed: 0, statusUpdates: 0, errors: [] };
  const max = opts.maxMessages ?? 200;
  const ids = new Set<string>();
  let recipients: string[] = [];
  try { recipients = await store.knownRecipients(); } catch { /* optional */ }
  for (const q of buildSyncQueries(opts.days, recipients)) {
    try { for (const id of await client.search(q, max)) ids.add(id); } catch (e) { res.errors.push(`search: ${msg(e)}`); }
    if (ids.size >= max) break;
  }
  let llmLeft = opts.maxLlmCalls ?? 20;
  const llm = opts.classifyWithLlm ? async (i: ClassifyInput) => (llmLeft-- > 0 ? opts.classifyWithLlm!(i) : null) : undefined;

  for (const id of [...ids].slice(0, max)) {
    try {
      if (await store.hasConversation(id)) continue;
      const m = await client.getMessage(id);
      if (!m) continue;
      res.scanned++;
      const fromEmail = parseFrom(m.from).email;
      if (fromEmail && looksLikeUnsubscribeRequest(m.subject, m.snippet) && (await store.registerUnsubscribe(fromEmail, "Requested via email reply"))) { res.unsubscribes++; continue; }
      const c = await classifyMessage({ subject: m.subject, from: m.from, snippet: m.snippet }, llm);
      if (!c.category) continue; // not job related: discarded, nothing stored
      res.relevant++;
      await handle(m, c.category, store, res);
    } catch (e) { res.errors.push(`${id}: ${msg(e)}`); }
  }
  return res;
}

async function handle(m: GmailMessage, category: EmailCategory, store: SyncStore, res: SyncResult) {
  const ex = extractFields({ subject: m.subject, from: m.from, snippet: m.snippet, body: m.bodyText, category });
  let { jobId, companyId } = await store.resolveAssociation({ threadId: m.threadId, company: ex.company, title: ex.title, fromAddress: parseFrom(m.from).email ?? m.from });
  if (category === "job_alert") {
    for (const aj of ex.jobs ?? []) {
      res.alertsParsed++;
      try { const r = await store.createJobFromAlert(aj); if (r.created) res.jobsCreated++; } catch (e) { res.errors.push(`alert job "${aj.title}": ${msg(e)}`); }
    }
    jobId = null; companyId = null;
  }
  // Persist metadata + extracted fields only (jobs[] from alerts are turned into job rows, not stored here; no body).
  await store.saveConversation({
    gmailMessageId: m.id, gmailThreadId: m.threadId, category, subject: m.subject.slice(0, 300), fromAddress: m.from.slice(0, 300), snippet: m.snippet.slice(0, 300),
    receivedAt: m.receivedAt, jobId, companyId,
    extracted: { company: ex.company, title: ex.title, links: ex.links, recruiter: ex.recruiter },
  });
  if (jobId) {
    await store.logReceived(jobId, `Email received: ${labelOf(category)}`, m.subject.slice(0, 200), { category, gmailMessageId: m.id });
    const st = statusForCategory(category);
    if (st && (await store.applyStatus(jobId, st, `Detected from Gmail: "${m.subject.slice(0, 120)}"`))) res.statusUpdates++;
  }
  if (companyId && ex.recruiter?.email) await store.recordRecruiter({ companyId, jobId, recruiter: ex.recruiter, threadId: m.threadId });
}

const labelOf = (c: EmailCategory) => c.replace(/_/g, " ");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
