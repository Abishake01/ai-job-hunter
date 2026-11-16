import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, companies, jobSkills, skills, jobMatches } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { generateStructured, LlmNotConfiguredError } from "@/lib/ai/llm";
import { MATCH_SYSTEM, buildMatchPrompt, matchOutputSchema } from "@/lib/ai/prompts/match";
import { scoreMatch, categorize, type CandidateInput, type JobInput, type MatchCategory, type MatchDetails, type Thresholds } from "@/lib/ai/heuristics/match";
import { extractSkillsFromText } from "@/lib/ai/heuristics/skills";
import { getProfile, getSettings } from "./profile.service";
import { getCandidateSkills } from "./settings.service";
import { recommendResume, getDefaultResume } from "./resume.service";
import { logActivity } from "./activity.service";

export { categorize, getDefaultResume, recommendResume };
export type { MatchCategory, Thresholds };

export type MatchResult = {
  jobId: string; score: number; category: MatchCategory;
  matchingSkills: string[]; missingSkills: string[]; optionalMissingSkills: string[];
  details: MatchDetails; recommendation: string; explanation: string;
  recommendedResumeId: string | null; engine: "llm" | "heuristic"; model: string | null;
};

export async function getThresholds(userId: string): Promise<Thresholds> {
  return (await getSettings(userId)).thresholds;
}

async function loadCandidate(userId: string): Promise<CandidateInput> {
  const p = await getProfile(userId);
  if (!p) throw new HttpError(400, "Complete your profile before matching.");
  const s = await getCandidateSkills(userId);
  return {
    skills: [...s.primary, ...s.additional, ...s.ai, ...p.aiExperience], targetRoles: p.targetRoles, currentTitle: p.currentTitle,
    yearsExperience: p.yearsExperience, education: p.education, workModes: p.workModes, jobTypes: p.jobTypes,
    includeInternshipsContract: p.includeInternshipsContract, preferredLocations: p.preferredLocations,
    expectedSalaryMin: p.expectedSalaryMin, expectedSalaryMax: p.expectedSalaryMax, currency: p.currency,
  };
}

async function loadJob(userId: string, jobId: string): Promise<{ input: JobInput; company: string }> {
  const [j] = await db.select({ job: jobs, company: companies.name }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!j) throw new HttpError(404, "Job not found");
  const js = await db.select({ name: skills.name, required: jobSkills.required }).from(jobSkills).innerJoin(skills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId));
  let jobSk = js;
  if (!jobSk.length && j.job.description) jobSk = extractSkillsFromText(`${j.job.title}\n${j.job.description}`).map((name) => ({ name, required: true }));
  const jb = j.job;
  return { company: j.company, input: { title: jb.title, description: jb.description, location: jb.location, workMode: jb.workMode, jobType: jb.jobType, salaryMin: jb.salaryMin, salaryMax: jb.salaryMax, salaryCurrency: jb.salaryCurrency, experienceMin: jb.experienceMin, experienceMax: jb.experienceMax, skills: jobSk } };
}

export async function matchJob(userId: string, jobId: string): Promise<MatchResult> {
  const [candidate, { input, company }, thresholds] = await Promise.all([loadCandidate(userId), loadJob(userId, jobId), getThresholds(userId)]);
  const h = scoreMatch(candidate, input, thresholds);
  let score = h.score, recommendation = h.recommendation, explanation = h.explanation, details = h.details;
  let engine: "llm" | "heuristic" = "heuristic", model: string | null = null;
  try {
    const out = await generateStructured(userId, {
      system: MATCH_SYSTEM, schema: matchOutputSchema,
      prompt: buildMatchPrompt({
        candidate: { targetRoles: candidate.targetRoles, currentTitle: candidate.currentTitle, yearsExperience: candidate.yearsExperience, education: candidate.education, skills: candidate.skills, workModes: candidate.workModes, preferredLocations: candidate.preferredLocations, expectedSalaryMonthly: { min: candidate.expectedSalaryMin, max: candidate.expectedSalaryMax, currency: candidate.currency } },
        job: { title: input.title, company, location: input.location, workMode: input.workMode, jobType: input.jobType, salaryMonthly: { min: input.salaryMin, max: input.salaryMax, currency: input.salaryCurrency }, experience: { min: input.experienceMin, max: input.experienceMax }, skills: input.skills, description: (input.description ?? "").slice(0, 4000) },
        heuristic: { score: h.score, matchingSkills: h.matchingSkills, missingSkills: h.missingSkills, optionalMissingSkills: h.optionalMissingSkills, details: h.details },
      }),
    });
    // Guardrail: LLM may only nudge the deterministic baseline by ±15.
    score = Math.round(Math.max(h.score - 15, Math.min(h.score + 15, out.data.score)));
    recommendation = out.data.recommendation; explanation = out.data.explanation;
    details = { ...h.details, mismatchReasons: out.data.mismatchReasons.length ? out.data.mismatchReasons : h.details.mismatchReasons, worthApplying: out.data.worthApplying && score >= thresholds.good };
    engine = "llm"; model = out.model;
  } catch (e) {
    if (!(e instanceof LlmNotConfiguredError)) console.warn("[match] LLM failed, using heuristic:", e instanceof Error ? e.message : e);
  }
  const recommendedResumeId = await recommendResume(userId, jobId).catch(() => null);
  const values = { userId, jobId, score, matchingSkills: h.matchingSkills, missingSkills: h.missingSkills, optionalMissingSkills: h.optionalMissingSkills, details: details as unknown as Record<string, unknown>, recommendation, explanation, recommendedResumeId, engine, model };
  await db.insert(jobMatches).values(values).onConflictDoUpdate({ target: [jobMatches.userId, jobMatches.jobId], set: { ...values, createdAt: new Date() } });
  await logActivity(userId, jobId, "match", `Match score ${score} (${categorize(score, thresholds)})`, recommendation, { score, engine });
  return { jobId, score, category: categorize(score, thresholds), matchingSkills: h.matchingSkills, missingSkills: h.missingSkills, optionalMissingSkills: h.optionalMissingSkills, details, recommendation, explanation, recommendedResumeId, engine, model };
}

export async function matchJobs(userId: string, opts: { onlyUnmatched?: boolean; limit?: number } = {}): Promise<{ matched: number; failed: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const base = opts.onlyUnmatched
    ? db.select({ id: jobs.id }).from(jobs).leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId))).where(and(eq(jobs.userId, userId), eq(jobs.isActive, true), isNull(jobMatches.id)))
    : db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.isActive, true)));
  const ids = (await base.orderBy(sql`${jobs.discoveredAt} desc`).limit(limit)).map((r) => r.id);
  let matched = 0, failed = 0;
  const queue = [...ids];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try { await matchJob(userId, id); matched++; } catch (e) { failed++; console.warn("[matchJobs]", id, e instanceof Error ? e.message : e); }
    }
  }));
  return { matched, failed };
}

export async function getMatch(userId: string, jobId: string) {
  const [m] = await db.select().from(jobMatches).where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId)));
  return m ?? null;
}
