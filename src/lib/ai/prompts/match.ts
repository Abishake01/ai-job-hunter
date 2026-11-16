import { z } from "zod";

export const MATCH_SYSTEM = `You are a careful job-matching assistant for a single candidate.
Rules:
- Use ONLY the facts in the CANDIDATE and JOB blocks. Never invent salary, experience, skills or requirements.
- If something is not stated, treat it as Unknown and do not penalise or reward it.
- Required skills matter more than optional ones. Weights: skills 45, role relevance 15, experience 15, salary 10, location+work mode 10, education 5.
- The deterministic analysis provided is authoritative for skill lists; you give the overall score (0-100), a short recommendation and explanation.
- Never recommend fabricating experience.`;

export const matchOutputSchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: z.string().max(400),
  explanation: z.string().max(1200),
  mismatchReasons: z.array(z.string().max(300)).max(10).default([]),
  worthApplying: z.boolean(),
});
export type MatchLlmOutput = z.infer<typeof matchOutputSchema>;

export function buildMatchPrompt(input: { candidate: unknown; job: unknown; heuristic: { score: number; matchingSkills: string[]; missingSkills: string[]; optionalMissingSkills: string[]; details: unknown } }): string {
  return `CANDIDATE:\n${JSON.stringify(input.candidate, null, 1)}\n\nJOB:\n${JSON.stringify(input.job, null, 1)}\n\nDETERMINISTIC ANALYSIS (baseline score ${input.heuristic.score}):\n${JSON.stringify(input.heuristic, null, 1)}\n\nReturn your overall score (you may adjust the baseline by at most ±15 with justification in the explanation), recommendation, explanation, mismatchReasons and worthApplying.`;
}
