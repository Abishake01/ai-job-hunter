/** Pure extraction of structured fields from a Gmail message (body is used transiently and NEVER stored). */
import type { EmailCategory } from "@/lib/ai/heuristics/classify";
import { isJobBoardSender, senderDomain } from "@/lib/ai/heuristics/classify";

export type AlertJob = { title: string; company: string; location: string | null; url: string; platform: string; sourceJobId: string };
export type Extracted = {
  company?: string; title?: string; links?: string[];
  recruiter?: { name?: string; email?: string; designation?: string };
  jobs?: AlertJob[]; // job_alert only; used for job creation, not persisted wholesale
};

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const GENERIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "yahoo.in", "icloud.com", "proton.me", "protonmail.com"]);
const NOREPLY = /(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?@|mailer|bounce|alerts?@)/i;
const TRACKING = /^(utm_|trk|tracking|refid|ref$|midtoken|midsig|eid|trackingid|lipi|lici|otptoken|rcm|gclid|fbclid)/i;

const JOB_URL_PATTERNS: { re: RegExp; platform: string; id: (m: RegExpMatchArray) => string }[] = [
  { re: /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^\/?\s]*-)?(\d{6,})/i, platform: "linkedin", id: (m) => m[1] },
  { re: /naukri\.com\/job-listings-[^\s?]*?(\d{8,})/i, platform: "naukri", id: (m) => m[1] },
  { re: /indeed\.com\/(?:m\/)?(?:viewjob|rc\/clk)\?[^\s]*?jk=([a-f0-9]{8,})/i, platform: "indeed", id: (m) => m[1] },
  { re: /glassdoor\.[a-z.]+\/job-listing\/[^\s?]*?(\d{6,})/i, platform: "glassdoor", id: (m) => m[1] },
  { re: /wellfound\.com\/jobs\/(\d+)/i, platform: "wellfound", id: (m) => m[1] },
  { re: /foundit\.in\/job\/[^\s?]*?(\d{6,})/i, platform: "foundit", id: (m) => m[1] },
  { re: /instahyre\.com\/job-\d+|instahyre\.com\/candidate\/opportunities\/\??[^\s]*?(\d+)/i, platform: "instahyre", id: (m) => m[1] ?? m[0] },
  { re: /cutshort\.io\/job\/[^\s?]+/i, platform: "cutshort", id: (m) => m[0] },
  { re: /hirist\.(?:tech|com)\/j\/[^\s?]+/i, platform: "hirist", id: (m) => m[0] },
];

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;]+$/, "")))];
}

/** Strips tracking query params and fragments. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch { return raw; }
}

export function parseFrom(from: string): { name?: string; email?: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim().toLowerCase() };
  const e = from.match(/[^\s<>]+@[^\s<>]+/);
  return { email: e ? e[0].toLowerCase() : undefined };
}

function companyFromSender(from: string): string | undefined {
  const { name, email } = parseFrom(from);
  const d = email?.split("@")[1];
  if (d && !GENERIC_DOMAINS.has(d) && !isJobBoardSender(from)) {
    const parts = d.split(".");
    const base = parts.length > 2 && ["co", "com", "org", "net"].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
    if (base && !["mail", "email", "notifications", "greenhouse", "lever", "ashbyhq", "workable", "smartrecruiters", "myworkday", "icims"].includes(base)) return base.charAt(0).toUpperCase() + base.slice(1);
  }
  if (name && !/recruit|hr\b|talent|careers|jobs|team|hiring|noreply|no-reply/i.test(name) && isJobBoardSender(from) === false && name.split(" ").length <= 3 && /team|inc|ltd|labs|technologies|systems|solutions/i.test(name)) return name.replace(/\s*(?:team|careers)$/i, "").trim();
  return undefined;
}

/** "Your application to Software Engineer at Acme", "Thank you for applying to Acme", "Interview: Backend Developer at Acme". */
export function parseSubjectRoleCompany(subject: string): { title?: string; company?: string } {
  const clean = subject.replace(/^(?:re|fwd?):\s*/i, "").trim();
  let m = clean.match(/(?:application|applying|applied|interview|invitation|offer)(?:\s+(?:to|for|with|from))?\s*[:\-–]?\s*(?:the\s+)?(.{3,80}?)\s+(?:role|position)?\s*(?:at|with|@)\s+([A-Z0-9][\w&.' \-]{1,50}?)(?:\s*[!.|\-–(]|$)/i);
  if (m) return { title: m[1].trim(), company: m[2].trim() };
  m = clean.match(/(?:thank(?:s| you) for (?:applying|your (?:application|interest))(?: to| at| with| in)?|application (?:received|to|for)|your application (?:to|with|at))\s+(?:the\s+)?([A-Z0-9][\w&.' \-]{1,50}?)(?:\s*[!.|\-–:(]|$)/i);
  if (m) return { company: m[1].trim() };
  return {};
}

export const DESIGNATION_RE = /\b((?:senior |sr\.? |lead |principal )?(?:technical |tech |it |campus |talent )?(?:recruiter|recruitment (?:manager|consultant|executive)|talent acquisition(?: (?:specialist|partner|manager|lead|executive))?|hr (?:manager|executive|business partner|generalist)|human resources(?: manager)?|engineering manager|hiring manager|head of (?:talent|people|engineering)))\b/i;

/** Signature-based recruiter details. Only returns fields that are explicitly present. */
export function extractRecruiter(from: string, body: string): Extracted["recruiter"] | undefined {
  const { name, email } = parseFrom(from);
  if (!email || NOREPLY.test(email) || isJobBoardSender(from)) return undefined;
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let designation: string | undefined;
  for (const l of lines.slice(-25)) { // signature lives at the end
    if (l.length > 90) continue;
    const m = l.match(DESIGNATION_RE);
    if (m) { designation = m[1].replace(/\s+/g, " "); break; }
  }
  const out: NonNullable<Extracted["recruiter"]> = { email };
  if (name && !/^[\w.+-]+@/.test(name)) out.name = name;
  if (designation) out.designation = designation;
  return out;
}

function matchJobUrl(url: string): { platform: string; sourceJobId: string } | null {
  for (const p of JOB_URL_PATTERNS) { const m = url.match(p.re); if (m) return { platform: p.platform, sourceJobId: p.id(m) }; }
  return null;
}

/**
 * Parses job-board alert mails: for each job link, the preceding up-to-3 text lines are `title / company / location`.
 * Anything not clearly parseable is skipped (never guessed).
 */
export function extractAlertJobs(body: string, max = 25): AlertJob[] {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const out: AlertJob[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const urls = lines[i].match(URL_RE); // String.match with /g is stateless
    if (!urls) continue;
    for (const raw of urls) {
      const hit = matchJobUrl(raw);
      if (!hit || seen.has(`${hit.platform}:${hit.sourceJobId}`)) continue;
      const prev: string[] = [];
      for (let k = i - 1; k >= 0 && prev.length < 3 && i - k <= 8; k--) {
        const l = lines[k];
        if (!l) { if (prev.length >= 2) break; continue; }
        if (/https?:\/\//i.test(l)) break; // another link = previous entry boundary
        if (/^(view|apply|see|easy apply)\b/i.test(l)) continue;
        prev.unshift(l);
      }
      if (prev.length < 2) continue;
      const [title, company, location] = prev.length === 3 ? prev : [prev[0], prev[1], undefined];
      if (title.length > 120 || company.length > 80) continue;
      seen.add(`${hit.platform}:${hit.sourceJobId}`);
      out.push({ title, company: company.replace(/\s*[·•|].*$/, "").trim(), location: location ? location.replace(/\s*[·•|].*$/, "").trim() : null, url: cleanUrl(raw), platform: hit.platform, sourceJobId: hit.sourceJobId });
      if (out.length >= max) return out;
    }
  }
  return out;
}

export type ExtractInput = { subject: string; from: string; snippet?: string; body?: string; category: EmailCategory };

export function extractFields(m: ExtractInput): Extracted {
  const body = m.body ?? m.snippet ?? "";
  const links = extractUrls(body).map(cleanUrl).filter((u) => !/unsubscribe|optout|preferences|mailto:/i.test(u)).slice(0, 5);
  const out: Extracted = {};
  if (links.length) out.links = links;
  if (m.category === "job_alert") {
    const jobs = extractAlertJobs(body);
    if (jobs.length) out.jobs = jobs;
    return out;
  }
  const sr = parseSubjectRoleCompany(m.subject);
  const company = sr.company ?? companyFromSender(m.from);
  if (company) out.company = company;
  if (sr.title) out.title = sr.title;
  const r = extractRecruiter(m.from, body);
  if (r && ["recruiter_message", "interview_invite", "follow_up", "selection"].includes(m.category)) out.recruiter = r;
  return out;
}

export { senderDomain };
