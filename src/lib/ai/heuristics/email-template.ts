/** Deterministic email templates + assembly + anti-fabrication checks. Pure. Uses ONLY facts passed in. */
import { normalizeSkill } from "@/lib/utils/skills";

export type EmailKind = "direct_application" | "recruiter_outreach" | "hiring_manager_intro" | "follow_up" | "general_inquiry";

export type EmailFacts = {
  candidate: {
    fullName: string | null; headline: string | null; currentTitle: string | null; currentCompany: string | null; yearsExperience: number | null;
    education: string | null; graduationYear: number | null; phone: string | null; email: string | null; location: string | null;
    skills: string[]; projects: { name: string; description?: string; url?: string }[];
    portfolioUrl: string | null; linkedinUrl: string | null; githubUrl: string | null;
  };
  job: { title: string; company: string; location: string | null; workMode: string | null; requiredSkills: string[]; applyUrl: string | null };
  recruiter: { name: string | null; designation: string | null } | null;
  /** The resume that will actually be attached on draft/send; null => no attachment claim is made. */
  resume: { name: string; filename: string } | null;
  followUp?: { originalSubject: string | null; sentAt: Date | null } | null;
  footer: string;
};
export type EmailCore = { subject: string; body: string };
export type EmailDraft = EmailCore & { reminders: string[] };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const firstSentence = (s?: string) => (s ? (s.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/\.$/, "").slice(0, 160) : "");

export function greeting(f: EmailFacts): string {
  const n = f.recruiter?.name?.trim();
  return n ? `Hi ${n.split(/\s+/)[0]},` : "Hello Hiring Team,";
}

/** Candidate skills that the job explicitly lists (both sides from provided facts); falls back to the candidate's own top skills. */
export function relevantSkills(f: EmailFacts, max = 6): { skills: string[]; overlap: boolean } {
  const req = new Set(f.job.requiredSkills.map(normalizeSkill));
  const overlap = f.candidate.skills.filter((s) => req.has(normalizeSkill(s))).slice(0, max);
  if (overlap.length) return { skills: overlap, overlap: true };
  return { skills: f.candidate.skills.slice(0, Math.min(max, 5)), overlap: false };
}

function whoAmI(f: EmailFacts): string {
  const c = f.candidate;
  const parts: string[] = [];
  if (c.currentTitle && c.currentCompany) parts.push(`I'm currently working as ${c.currentTitle} at ${c.currentCompany}`);
  else if (c.currentTitle) parts.push(`I'm currently working as ${c.currentTitle}`);
  else if (c.headline) parts.push(`I'm a ${c.headline}`);
  let s = parts.join("");
  if (c.yearsExperience != null && s) s += `, with about ${Number.isInteger(c.yearsExperience) ? c.yearsExperience : c.yearsExperience.toFixed(1)} year${c.yearsExperience === 1 ? "" : "s"} of experience`;
  if (s) s += ".";
  if (c.education) s += `${s ? " " : ""}I hold ${/^(a|an)\s/i.test(c.education) ? "" : "a "}${c.education}${c.graduationYear ? ` (${c.graduationYear})` : ""}.`;
  return s;
}
function skillsLine(f: EmailFacts): string {
  const { skills, overlap } = relevantSkills(f);
  if (!skills.length) return "";
  return overlap ? `My experience with ${list(skills)} lines up with the skills listed for this role.` : `My core skills include ${list(skills)}.`;
}
function projectsLine(f: EmailFacts): string {
  const ps = f.candidate.projects.slice(0, 2);
  if (!ps.length) return "";
  return "Recent work includes " + list(ps.map((p) => (firstSentence(p.description) ? `${p.name} (${firstSentence(p.description)})` : p.name))) + ".";
}
const para = (...xs: string[]) => xs.filter(Boolean).join(" ");

/** Kind-specific message (greeting + paragraphs), before resume line/signature/footer. */
export function renderTemplate(kind: EmailKind, f: EmailFacts): EmailCore {
  const { title, company } = f.job;
  const g = greeting(f);
  const posting = f.job.applyUrl ? `The posting I'm referring to: ${f.job.applyUrl}` : "";
  const profile = para(whoAmI(f), skillsLine(f), projectsLine(f));
  switch (kind) {
    case "direct_application":
      return { subject: `Application for ${title} at ${company}`, body: [g, para(`I'd like to apply for the ${title} position at ${company}.`, posting), profile, "I'd welcome the opportunity to discuss how I can contribute. Thank you for your time and consideration."].filter(Boolean).join("\n\n") };
    case "recruiter_outreach":
      return { subject: `${title} opening at ${company}`, body: [g, para(`I came across the ${title} opening at ${company} and wanted to reach out directly.`, posting), profile, "If it's a fit, I'd be glad to share more details or set up a short call. Thank you for your time."].filter(Boolean).join("\n\n") };
    case "hiring_manager_intro":
      return { subject: `Interested in the ${title} role on your team`, body: [g, para(`I'm reaching out about the ${title} role at ${company}.`, posting), profile, "I'd appreciate a few minutes of your time to learn more about the team's needs. Thank you."].filter(Boolean).join("\n\n") };
    case "follow_up": {
      const when = f.followUp?.sentAt ? ` on ${f.followUp.sentAt.toISOString().slice(0, 10)}` : "";
      const ref = f.followUp?.originalSubject ? ` ("${f.followUp.originalSubject}")` : "";
      return { subject: f.followUp?.originalSubject ? `Re: ${f.followUp.originalSubject}` : `Following up: ${title} at ${company}`, body: [g, `I wanted to follow up on my earlier email${when}${ref} about the ${title} role at ${company}. I remain interested and would be happy to provide anything else you need.`, "Thank you for your time."].join("\n\n") };
    }
    case "general_inquiry":
      return { subject: `Interest in opportunities at ${company}`, body: [g, `I'm interested in opportunities at ${company}, including the ${title} role.${f.job.applyUrl ? ` ${posting}` : ""}`, profile, "If there is a suitable opening now or in the future, I'd be grateful to be considered. Thank you."].filter(Boolean).join("\n\n") };
  }
}

export function signature(f: EmailFacts): string {
  const c = f.candidate;
  const lines = [c.fullName ?? "", c.phone ? `Phone: ${c.phone}` : "", c.portfolioUrl ? `Portfolio: ${c.portfolioUrl}` : "", c.linkedinUrl ? `LinkedIn: ${c.linkedinUrl}` : "", c.githubUrl ? `GitHub: ${c.githubUrl}` : ""].filter(Boolean);
  return ["Best regards,", ...lines].join("\n");
}

/** Adds resume line (only when a resume will really be attached), signature with profile links, and the unsubscribe footer. */
export function assembleEmail(core: EmailCore, f: EmailFacts): EmailDraft {
  const reminders: string[] = [];
  const parts = [core.body.trim()];
  if (f.resume) parts.push(`I've attached my resume (${f.resume.filename}) for your reference.`);
  else reminders.push("No resume is selected: attach your resume before sending (nothing is attached automatically).");
  parts.push(signature(f));
  if (f.footer.trim()) parts.push(`--\n${f.footer.trim()}`);
  if (!f.candidate.fullName) reminders.push("Your name is missing from your profile, so the signature has no name.");
  if (!f.candidate.portfolioUrl && !f.candidate.linkedinUrl && !f.candidate.githubUrl) reminders.push("Add portfolio/LinkedIn/GitHub links to your profile to include them in the signature.");
  return { subject: core.subject.trim().slice(0, 200), body: parts.join("\n\n"), reminders };
}

export const templateEmail = (kind: EmailKind, f: EmailFacts): EmailDraft => assembleEmail(renderTemplate(kind, f), f);

/**
 * Anti-fabrication audit of generated text against the supplied facts. Returns the list of unsupported claims
 * (empty = OK): experience-year counts not equal to the profile's, salary/currency amounts, unknown URLs/emails.
 */
export function findUnsupportedClaims(text: string, f: EmailFacts, extraAllowed: string[] = []): string[] {
  const issues: string[] = [];
  const years = f.candidate.yearsExperience;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi)) {
    const n = Number(m[1]);
    if (years == null || (Math.abs(n - years) > 0.5 && !extraAllowed.some((a) => a.includes(m[0])))) issues.push(`experience claim "${m[0]}"`);
  }
  if (/(?:₹|rs\.?\s?\d|inr\s?\d|\$\s?\d|\b\d+(?:\.\d+)?\s?(?:lpa|lakhs?|k\s*\/\s*month|per month))/i.test(text)) issues.push("salary/currency amount");
  const allowedUrls = [f.candidate.portfolioUrl, f.candidate.linkedinUrl, f.candidate.githubUrl, f.job.applyUrl, ...f.candidate.projects.map((p) => p.url), ...extraAllowed].filter(Boolean).map((u) => String(u).replace(/\/$/, "").toLowerCase());
  for (const m of text.matchAll(/https?:\/\/[^\s)>\]]+/gi)) {
    const u = m[0].replace(/[.,;]+$/, "").replace(/\/$/, "").toLowerCase();
    if (!allowedUrls.includes(u)) issues.push(`unknown URL ${m[0]}`);
  }
  const allowedEmails = [f.candidate.email, ...extraAllowed].filter(Boolean).map((e) => String(e).toLowerCase());
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) if (!allowedEmails.includes(m[0].toLowerCase())) issues.push(`unknown email ${m[0]}`);
  return issues;
}
