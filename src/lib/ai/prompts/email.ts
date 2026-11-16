import { z } from "zod";
import type { EmailFacts, EmailKind } from "@/lib/ai/heuristics/email-template";

export const emailOutputSchema = z.object({ subject: z.string().min(3).max(200), body: z.string().min(20).max(2500) });

export const EMAIL_SYSTEM = `You write short, professional job-outreach emails on behalf of a job seeker.
STRICT RULES (anti-fabrication):
- Use ONLY facts present in the FACTS JSON (profile, resume excerpt, job, company, recruiter). If something is not there, do not mention it.
- NEVER invent: years of experience, employers, projects, skills, achievements, metrics, salary, referrals, mutual connections, dates, or claims about the company that are not in FACTS.
- Do not state salary figures. Do not include any URL or email address that is not in FACTS.
- Mention only skills the candidate actually has (FACTS.candidate.skills). Highlight those that the job lists (FACTS.job.requiredSkills) when present.
- If the recipient's name is unknown, greet with "Hello Hiring Team,".
- Do NOT write a signature, resume-attachment sentence, links list or unsubscribe footer: they are appended automatically. End with a brief closing sentence only.
- Plain text, 90-160 words, no emojis, no placeholders like [Name].`;

const KIND_GUIDE: Record<EmailKind, string> = {
  direct_application: "A direct job application email to the company's hiring/recruiting address.",
  recruiter_outreach: "A short introduction to a recruiter about this specific opening.",
  hiring_manager_intro: "A concise introduction to the hiring manager about this role.",
  follow_up: "A polite follow-up to an earlier email on this role (FACTS.followUp). Do not claim anything new.",
  general_inquiry: "A general inquiry about opportunities at the company.",
};

export function buildEmailPrompt(kind: EmailKind, facts: EmailFacts, resumeExcerpt: string | null, extra?: string | null): string {
  const f = { ...facts, footer: undefined, followUp: facts.followUp ? { originalSubject: facts.followUp.originalSubject, sentAt: facts.followUp.sentAt?.toISOString().slice(0, 10) ?? null } : null };
  return `Write this email: ${KIND_GUIDE[kind]}\n\nFACTS:\n${JSON.stringify(f)}\n\nRESUME EXCERPT (facts source, may be null):\n${resumeExcerpt ? resumeExcerpt.slice(0, 3500) : "null"}\n${extra ? `\nUSER INSTRUCTIONS (must not violate the rules above):\n${extra.slice(0, 500)}\n` : ""}\nReturn {"subject": string, "body": string}.`;
}
