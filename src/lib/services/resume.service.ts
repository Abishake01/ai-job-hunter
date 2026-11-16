import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { resumes, jobs, jobSkills, skills } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { generateStructured, LlmNotConfiguredError } from "@/lib/ai/llm";
import { RESUME_SYSTEM, buildResumePrompt, resumeOutputSchema } from "@/lib/ai/prompts/resume";
import { analyzeResumeHeuristic, compareResumeTexts, pickResume, type ResumeAnalysis, type ResumeComparison } from "@/lib/ai/heuristics/resume";
import { extractSkillsFromText } from "@/lib/ai/heuristics/skills";
import { roleTokens } from "@/lib/ai/heuristics/match";
import { validatePdfBuffer, PdfValidationError } from "@/lib/resume/pdf";
import { extractPdfText } from "@/lib/resume/extract";
import { getProfile } from "./profile.service";
import { getCandidateSkills } from "./settings.service";

const meta = {
  id: resumes.id, name: resumes.name, filename: resumes.filename, mimeType: resumes.mimeType, extractedText: resumes.extractedText,
  analysis: resumes.analysis, isDefault: resumes.isDefault, createdAt: resumes.createdAt,
};
export type ResumeRecord = { id: string; name: string; filename: string; mimeType: string; extractedText: string; analysis: Record<string, unknown> | null; isDefault: boolean; createdAt: Date };

/** List view: no file bytes; extractedText replaced by a preview + length to keep payloads small. */
export async function listResumes(userId: string) {
  const rows = await db.select(meta).from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.isDefault), desc(resumes.createdAt));
  return rows.map(({ extractedText, ...r }) => ({ ...r, textLength: extractedText.length, textPreview: extractedText.slice(0, 400) }));
}

export async function getResume(userId: string, id: string): Promise<ResumeRecord> {
  const [r] = await db.select(meta).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  if (!r) throw new HttpError(404, "Resume not found");
  return r;
}

export async function getResumeFile(userId: string, id: string) {
  const [r] = await db.select({ fileData: resumes.fileData, filename: resumes.filename, mimeType: resumes.mimeType }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  if (!r) throw new HttpError(404, "Resume not found");
  return r;
}

export async function getDefaultResume(userId: string): Promise<ResumeRecord | null> {
  const [d] = await db.select(meta).from(resumes).where(and(eq(resumes.userId, userId), eq(resumes.isDefault, true))).limit(1);
  if (d) return d;
  const [any] = await db.select(meta).from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)).limit(1);
  return any ?? null;
}

export async function createResume(userId: string, input: { name?: string; filename: string; data: Buffer; makeDefault?: boolean }) {
  try { validatePdfBuffer(input.data); } catch (e) { if (e instanceof PdfValidationError) throw new HttpError(400, e.message); throw e; }
  let text: string;
  try { text = await extractPdfText(input.data); } catch { throw new HttpError(400, "Could not read this PDF (it may be corrupted or password-protected)."); }
  const existing = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.userId, userId));
  const isDefault = input.makeDefault || existing.length === 0;
  if (isDefault) await db.update(resumes).set({ isDefault: false }).where(eq(resumes.userId, userId));
  const name = (input.name?.trim() || input.filename.replace(/\.pdf$/i, "")).slice(0, 120) || "Resume";
  const [row] = await db.insert(resumes).values({ userId, name, filename: input.filename.slice(0, 200), mimeType: "application/pdf", fileData: input.data, extractedText: text, isDefault }).returning({ id: resumes.id });
  const rec = await getResume(userId, row.id);
  return { ...rec, warning: text.length < 100 ? "Very little text could be extracted; this PDF may be image-based (scanned). Matching and analysis need machine-readable text." : null };
}

export async function updateResume(userId: string, id: string, patch: { name?: string; isDefault?: boolean }) {
  await getResume(userId, id);
  if (patch.isDefault) {
    await db.update(resumes).set({ isDefault: false }).where(and(eq(resumes.userId, userId), ne(resumes.id, id)));
    await db.update(resumes).set({ isDefault: true }).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  }
  if (patch.name?.trim()) await db.update(resumes).set({ name: patch.name.trim().slice(0, 120) }).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  return getResume(userId, id);
}

export async function deleteResume(userId: string, id: string) {
  const r = await getResume(userId, id);
  await db.delete(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  if (r.isDefault) {
    const [next] = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)).limit(1);
    if (next) await db.update(resumes).set({ isDefault: true }).where(and(eq(resumes.id, next.id), eq(resumes.userId, userId)));
  }
}

async function profileSkillList(userId: string) {
  const s = await getCandidateSkills(userId);
  const p = await getProfile(userId);
  return { skills: [...s.primary, ...s.additional, ...s.ai, ...(p?.aiExperience ?? [])], targetRoles: p?.targetRoles ?? [] };
}

/** Analyzes raw text (LLM when configured, else heuristic). Used by the persisted and ad-hoc paths. */
export async function analyzeText(userId: string, text: string): Promise<ResumeAnalysis> {
  if (text.trim().length < 20) throw new HttpError(400, "There is no readable text to analyze.");
  const ps = await profileSkillList(userId);
  const base = analyzeResumeHeuristic(text, { profileSkills: ps.skills, targetRoles: ps.targetRoles });
  try {
    const { data, model } = await generateStructured(userId, { system: RESUME_SYSTEM, prompt: buildResumePrompt({ text, targetRoles: ps.targetRoles, profileSkills: ps.skills, heuristicSummary: base.summary }), schema: resumeOutputSchema });
    return { ...base, engine: "llm", model, atsScore: Math.round(data.atsScore), summary: data.summary, strengths: data.strengths, improvements: data.improvements };
  } catch (e) {
    if (!(e instanceof LlmNotConfiguredError)) console.warn("[resume.analyze] LLM failed, using heuristic:", e instanceof Error ? e.message : e);
    return base;
  }
}

export async function analyzeResume(userId: string, id: string): Promise<ResumeAnalysis> {
  const r = await getResume(userId, id);
  const analysis = await analyzeText(userId, r.extractedText);
  await db.update(resumes).set({ analysis: analysis as unknown as Record<string, unknown> }).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
  return analysis;
}

export async function compareResumes(userId: string, aId: string, bId: string): Promise<{ resumes: { a: { id: string; name: string }; b: { id: string; name: string } } } & ResumeComparison> {
  if (aId === bId) throw new HttpError(400, "Pick two different resumes to compare");
  const [a, b] = await Promise.all([getResume(userId, aId), getResume(userId, bId)]);
  const ps = await profileSkillList(userId);
  return { resumes: { a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } }, ...compareResumeTexts(a.extractedText, b.extractedText, { a: a.name, b: b.name }, ps.skills) };
}

/** Keyword overlap based resume pick for a job (skills + title tokens). Returns the resume id or null if user has no resumes. */
export async function recommendResume(userId: string, jobId: string): Promise<string | null> {
  const [job] = await db.select({ title: jobs.title, description: jobs.description }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!job) throw new HttpError(404, "Job not found");
  const js = await db.select({ name: skills.name }).from(jobSkills).innerJoin(skills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId));
  const kw = js.length ? js.map((s) => s.name) : extractSkillsFromText(`${job.title}\n${job.description ?? ""}`);
  const rows = await db.select({ id: resumes.id, name: resumes.name, extractedText: resumes.extractedText, isDefault: resumes.isDefault }).from(resumes).where(eq(resumes.userId, userId));
  return pickResume([...kw, ...roleTokens(job.title)], rows)?.id ?? null;
}
