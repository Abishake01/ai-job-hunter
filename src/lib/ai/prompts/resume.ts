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
