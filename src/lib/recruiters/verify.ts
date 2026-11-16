/** Verification labelling for recruiter contacts (pure). "verified" is ONLY ever produced from a provider's deliverable verdict. */

export type Verification = "verified" | "public" | "inferred" | "unknown";
export type SourceType = "job_ad" | "company_site" | "gmail" | "public_profile" | "manual" | "pattern";
export type EmailProvider = "hunter" | "zerobounce";

/** Label before any provider check. Never returns "verified". */
export function baselineVerification(source: SourceType): Verification {
  switch (source) {
    case "job_ad": case "company_site": case "public_profile": return "public"; // found on a public page
    case "pattern": return "inferred";                                          // clearly labelled guess
    case "gmail": case "manual": default: return "unknown";                     // observed/entered, not independently verified
  }
}

/**
 * Applies a provider result: true => "verified"; false => downgraded to "unknown" (undeliverable);
 * null/undefined (no provider / inconclusive) => keeps the existing label, except a stale "verified" (no fresh proof) drops to "unknown".
 */
export function computeVerification(current: Verification, provider: boolean | null | undefined): Verification {
  if (provider === true) return "verified";
  if (provider === false) return "unknown";
  return current === "verified" ? "unknown" : current;
}

/** Maps a provider API payload to deliverable true/false/null(inconclusive). */
export function providerResultToDeliverable(provider: EmailProvider, json: unknown): boolean | null {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  if (provider === "hunter") {
    const d = j.data as { status?: string; result?: string } | undefined;
    const s = d?.status ?? d?.result;
    if (s === "valid" || s === "deliverable") return true;
    if (s === "invalid" || s === "undeliverable") return false;
    return null; // accept_all, webmail, unknown, disposable => inconclusive
  }
  const s = j.status;
  if (s === "valid") return true;
  if (s === "invalid" || s === "spamtrap" || s === "abuse" || s === "do_not_mail") return false;
  return null; // catch-all, unknown
}

const GENERIC_LOCALS = new Set(["info", "hr", "careers", "career", "jobs", "job", "contact", "hello", "hi", "support", "admin", "recruitment", "recruiting", "talent", "hiring", "people", "team", "office", "mail", "enquiry", "enquiries", "sales", "help"]);
export const isGenericMailbox = (email: string) => GENERIC_LOCALS.has(email.split("@")[0].toLowerCase());
export const isNoReply = (email: string) => /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer-daemon|postmaster|bounce)/i.test(email.split("@")[0]);

const clean = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
export type EmailPattern = "first.last" | "first_last" | "firstlast" | "first" | "flast" | "firstl" | "last.first";
function render(p: EmailPattern, first: string, last: string): string | null {
  if (!first) return null;
  if (p === "first") return first;
  if (!last) return null;
  switch (p) {
    case "first.last": return `${first}.${last}`;
    case "first_last": return `${first}_${last}`;
    case "firstlast": return `${first}${last}`;
    case "flast": return `${first[0]}${last}`;
    case "firstl": return `${first}${last[0]}`;
    case "last.first": return `${last}.${first}`;
  }
}
const PATTERNS: EmailPattern[] = ["first.last", "first_last", "firstlast", "flast", "firstl", "last.first", "first"];

/** Detects which pattern an observed (public) name+email pair follows; null if none matches. */
export function detectPattern(name: string, email: string): EmailPattern | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const first = clean(parts[0]), last = clean(parts[parts.length - 1]);
  const local = email.split("@")[0].toLowerCase();
  return PATTERNS.find((p) => render(p, first, last) === local) ?? null;
}

/**
 * Clearly-labelled guess: only possible when a PUBLIC name+email pair on the same domain reveals the company's pattern.
 * Returns null otherwise (we never guess from nothing).
 */
export function inferEmail(targetName: string, domain: string, observed: { name?: string | null; email: string }[]): { email: string; pattern: EmailPattern; basedOn: string } | null {
  const d = domain.toLowerCase();
  const parts = targetName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const first = clean(parts[0]), last = clean(parts[parts.length - 1]);
  for (const o of observed) {
    if (!o.name || !o.email.toLowerCase().endsWith("@" + d) || isGenericMailbox(o.email)) continue;
    const p = detectPattern(o.name, o.email);
    if (!p) continue;
    const local = render(p, first, last);
    if (local && `${local}@${d}` !== o.email.toLowerCase()) return { email: `${local}@${d}`, pattern: p, basedOn: o.email };
  }
  return null;
}
