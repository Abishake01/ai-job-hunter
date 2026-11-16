/** Deterministic (rule-based) classification of job-related email METADATA. Pure: no I/O, no server-only imports. */

export const EMAIL_CATEGORIES = ["job_alert", "recruiter_message", "interview_invite", "application_ack", "rejection", "selection", "follow_up"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export type ClassifyInput = { subject: string; from: string; snippet?: string };
export type ClassifyResult = { category: EmailCategory | null; confidence: "high" | "medium" | "low"; reason: string };

/** Known job-board sender domains (alerts/notifications come from these). */
export const JOB_BOARD_DOMAINS = [
  "linkedin.com", "naukri.com", "indeed.com", "glassdoor.com", "wellfound.com", "angel.co", "foundit.in", "monster.com",
  "instahyre.com", "cutshort.io", "hirist.tech", "hirist.com", "iimjobs.com", "internshala.com", "unstop.com", "ziprecruiter.com", "shine.com", "apna.co",
];

const has = (text: string, patterns: RegExp[]) => patterns.find((p) => p.test(text));

const REJECTION = [/unfortunately/i, /not (?:be )?moving forward/i, /regret to (?:inform|tell)/i, /(?:decided|chosen) to (?:move|proceed) (?:forward )?with (?:other|another)/i, /other candidates/i, /not (?:been )?selected/i, /will not be proceeding/i, /decided not to (?:proceed|move forward)/i, /position has been filled/i, /unable to (?:offer|move forward)/i];
const SELECTION = [/pleased to offer/i, /happy to offer/i, /excited to offer/i, /offer letter/i, /job offer/i, /offer of employment/i, /you(?:'ve| have) been selected/i, /congratulations.{0,60}(?:offer|selected|join)/i, /welcome (?:aboard|to the team)/i];
const ACK = [/thank(?:s| you) for applying/i, /application (?:has been |was )?(?:received|submitted|sent)/i, /we(?:'ve| have) received your application/i, /successfully applied/i, /your application (?:to|for|was sent)/i, /thanks for your interest in/i, /application confirmation/i];
const INTERVIEW = [/\binterview\b/i, /schedule a (?:call|chat|meeting|discussion)/i, /(?:technical|coding|hr|screening|assessment) (?:round|call|test|assessment)/i, /invite you to (?:an? )?(?:interview|call|discuss)/i, /your availability/i, /online assessment/i];
const ALERT_SUBJECT = [/job alert/i, /new jobs?\b/i, /jobs? (?:for you|matching|recommended)/i, /recommended jobs?/i, /\b\d+ new (?:jobs?|openings)/i, /is hiring/i, /jobs? you may (?:like|be interested)/i, /top job picks/i, /(?:apply now|hiring now)/i];
const FOLLOW_UP = [/following up/i, /follow-?up on/i, /checking in on your/i, /just checking in/i, /any update on/i, /status of your application/i];
const RECRUITER = [/opportunity/i, /your profile/i, /\bhiring for\b/i, /\brecruiter\b/i, /\btalent acquisition\b/i, /open(?:ing)? (?:position|role)/i, /we(?:'re| are) looking for/i, /exciting role/i, /career opportunity/i];
const RECRUITER_SENDER = [/recruit/i, /talent/i, /\bhr[@.\-_ ]/i, /careers?[@.\-_ ]/i, /hiring/i, /people ?team/i, /jobs@/i];

/** Domain part of an address like `Name <a@b.com>` or `a@b.com`; null if none. */
export function senderDomain(from: string): string | null {
  const m = from.match(/@([a-z0-9.\-]+)/i);
  return m ? m[1].toLowerCase() : null;
}
export function isJobBoardSender(from: string): boolean {
  const d = senderDomain(from);
  return !!d && JOB_BOARD_DOMAINS.some((b) => d === b || d.endsWith("." + b));
}

/**
 * Rule-based classification using subject + sender + snippet only.
 * Precedence: rejection > selection > acknowledgement > interview > alert > follow-up > recruiter.
 * Job-board alert subjects from known boards are checked first so "interview tips" digest mails are not misread.
 * Returns category null (=> discard or ask the LLM) when nothing matches.
 */
export function classifyByRules(input: ClassifyInput): ClassifyResult {
  const subject = input.subject ?? "";
  const text = `${subject}\n${input.snippet ?? ""}`;
  const board = isJobBoardSender(input.from);

  if (board) {
    const alertHit = has(subject, ALERT_SUBJECT);
    if (alertHit && !has(subject, ACK) && !has(subject, REJECTION)) return { category: "job_alert", confidence: "high", reason: `job-board sender + subject matches ${alertHit}` };
  }
  let p: RegExp | undefined;
  if ((p = has(text, REJECTION))) return { category: "rejection", confidence: has(subject, REJECTION) ? "high" : "medium", reason: `matches ${p}` };
  if ((p = has(text, SELECTION))) return { category: "selection", confidence: has(subject, SELECTION) ? "high" : "medium", reason: `matches ${p}` };
  if ((p = has(text, ACK))) return { category: "application_ack", confidence: has(subject, ACK) ? "high" : "medium", reason: `matches ${p}` };
  if ((p = has(text, INTERVIEW))) {
    // Job-board digests often mention "interview"; require a non-board sender or an explicit invite phrase.
    if (!board || /invite|schedule|round|assessment/i.test(text)) return { category: "interview_invite", confidence: has(subject, INTERVIEW) ? "high" : "medium", reason: `matches ${p}` };
  }
  if (board && (p = has(text, ALERT_SUBJECT))) return { category: "job_alert", confidence: "medium", reason: `job-board sender + ${p}` };
  if ((p = has(text, FOLLOW_UP))) return { category: "follow_up", confidence: "medium", reason: `matches ${p}` };
  if (!board && ((p = has(text, RECRUITER)) || has(input.from, RECRUITER_SENDER))) {
    const hit = has(text, RECRUITER) ?? has(input.from, RECRUITER_SENDER);
    return { category: "recruiter_message", confidence: has(text, RECRUITER) && has(input.from, RECRUITER_SENDER) ? "medium" : "low", reason: `recruiter-like: ${hit}` };
  }
  return { category: null, confidence: "low", reason: "no rule matched" };
}
