import { z } from "zod";

export const RESUME_SYSTEM = `You are an expert resume reviewer for software-engineering roles.
Rules:
- Base every statement strictly on the RESUME TEXT and the candidate's TARGET ROLES/PROFILE SKILLS. Never invent experience, employers, metrics or skills.
- Suggestions must never tell the candidate to claim skills or experience they do not have; say "add only if true".
- Be specific and concise.`;

export const resumeOutputSchema = z.object({
  atsScore: z.number().min(0).max(100),
  summary: z.string().max(800),
  strengths: z.array(z.string().max(300)).max(8),
  improvements: z.array(z.string().max(300)).max(10),
});
export type ResumeLlmOutput = z.infer<typeof resumeOutputSchema>;

export function buildResumePrompt(input: { text: string; targetRoles: string[]; profileSkills: string[]; heuristicSummary: string }): string {
  return `TARGET ROLES: ${input.targetRoles.join(", ") || "Unknown"}\nPROFILE SKILLS: ${input.profileSkills.join(", ") || "Unknown"}\nAUTOMATIC PRE-CHECK: ${input.heuristicSummary}\n\nRESUME TEXT:\n"""\n${input.text.slice(0, 12000)}\n"""\n\nReturn atsScore (0-100, ATS readiness and relevance to the target roles), a summary, strengths and concrete improvements.`;
}

export const PROFILE_EXTRACT_SYSTEM = `You extract structured profile data from a resume for a job-search app.
Rules:
- Use ONLY what is written in the RESUME TEXT. Never invent employers, titles, dates, skills, metrics or links.
- If a field is not present, return null (or an empty array). Do not guess.
- yearsExperience: compute only from the employment/internship date ranges in the text (sum of months / 12, one decimal); null if dates are unclear.
- summary: use the resume's own summary if present; otherwise write 2 factual sentences using only resume facts. headline: one short line like "Full-stack engineer (Python, React)" built from the resume's own title and skills.
- experience entries newest first; description is a short factual sentence or two from the bullets.`;

export const profileExtractSchema = z.object({
  fullName: z.string().nullable(), phone: z.string().nullable(), location: z.string().nullable(), headline: z.string().max(200).nullable(), summary: z.string().max(800).nullable(),
  education: z.string().max(200).nullable(), graduationYear: z.number().int().nullable(), yearsExperience: z.number().nullable(),
  currentTitle: z.string().nullable(), currentCompany: z.string().nullable(),
  linkedinUrl: z.string().nullable(), githubUrl: z.string().nullable(), portfolioUrl: z.string().nullable(),
  primarySkills: z.array(z.string()).max(15), additionalSkills: z.array(z.string()).max(30),
  experience: z.array(z.object({ company: z.string(), title: z.string(), start: z.string().nullable(), end: z.string().nullable(), description: z.string().nullable() })).max(15),
  projects: z.array(z.object({ name: z.string(), description: z.string().nullable(), tech: z.array(z.string()).max(15), url: z.string().nullable() })).max(15),
});
export type ProfileExtractLlm = z.infer<typeof profileExtractSchema>;
export const buildProfileExtractPrompt = (text: string) => `RESUME TEXT:\n"""\n${text.slice(0, 14000)}\n"""\n\nExtract the candidate profile fields.`;
