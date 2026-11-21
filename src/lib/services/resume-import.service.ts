import "server-only";
import { HttpError } from "@/lib/auth/session";
import { generateStructured, LlmNotConfiguredError } from "@/lib/ai/llm";
import { PROFILE_EXTRACT_SYSTEM, buildProfileExtractPrompt, profileExtractSchema } from "@/lib/ai/prompts/resume";
import { extractProfileHeuristic, type ExtractedProfile } from "@/lib/resume/profile-extract";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import { getProfile } from "@/lib/services/profile.service";
import { getCandidateSkills, getProfileView, updateProfile } from "@/lib/services/settings.service";
import { getDefaultResume, getResume } from "@/lib/services/resume.service";
import { getProfileCompleteness } from "@/lib/services/completeness.service";
import { normalizeSkill } from "@/lib/utils/skills";

const blank = (v: string | null | undefined) => !v || !v.trim();
const nn = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** LLM extraction (when an AI key is configured) layered over the rule-based result; any failure falls back to rules only. */
async function extract(userId: string, text: string): Promise<{ data: ExtractedProfile; engine: "llm" | "heuristic" }> {
  const base = extractProfileHeuristic(text);
  try {
    const { data: l } = await generateStructured(userId, { system: PROFILE_EXTRACT_SYSTEM, prompt: buildProfileExtractPrompt(text), schema: profileExtractSchema });
    const merged: ExtractedProfile = {
      ...base,
      fullName: nn(l.fullName) ?? base.fullName, phone: nn(l.phone) ?? base.phone, location: nn(l.location) ?? base.location, headline: nn(l.headline) ?? base.headline,
      summary: nn(l.summary) ?? base.summary, education: nn(l.education) ?? base.education, graduationYear: l.graduationYear ?? base.graduationYear,
      yearsExperience: l.yearsExperience ?? base.yearsExperience, currentTitle: nn(l.currentTitle) ?? base.currentTitle, currentCompany: nn(l.currentCompany) ?? base.currentCompany,
      linkedinUrl: nn(l.linkedinUrl) ?? base.linkedinUrl, githubUrl: nn(l.githubUrl) ?? base.githubUrl, portfolioUrl: nn(l.portfolioUrl) ?? base.portfolioUrl,
      skills: { primary: l.primarySkills.length ? l.primarySkills : base.skills.primary, additional: l.additionalSkills.length ? l.additionalSkills : base.skills.additional },
      experience: l.experience.length ? l.experience.map((e) => ({ company: e.company, title: e.title, start: e.start ?? undefined, end: e.end ?? undefined, description: e.description ?? undefined })) : base.experience,
      projects: l.projects.length ? l.projects.map((p) => ({ name: p.name, description: p.description ?? undefined, tech: p.tech, url: p.url ?? undefined })) : base.projects,
    };
    return { data: merged, engine: "llm" };
  } catch (e) {
    if (!(e instanceof LlmNotConfiguredError)) console.warn("[resume.import] LLM failed, using rules:", e instanceof Error ? e.message : e);
    return { data: base, engine: "heuristic" };
  }
}

export type ImportResult = { resumeName: string; engine: "llm" | "heuristic"; filled: string[]; nothingNew: boolean; view: Awaited<ReturnType<typeof getProfileView>>; completeness: Awaited<ReturnType<typeof getProfileCompleteness>> };

/**
 * Fills the profile from a resume. Only EMPTY fields are filled (never overwrites what you typed); skills are merged;
 * experience/projects are added only when not already listed. Everything comes from the resume text.
 */
export async function importProfileFromResume(userId: string, resumeId?: string | null): Promise<ImportResult> {
  const resume = resumeId ? await getResume(userId, resumeId) : await getDefaultResume(userId);
  if (!resume) throw new HttpError(400, "Upload a resume first, then I can fill your profile from it.");
  if (resume.extractedText.trim().length < 50) throw new HttpError(400, "This resume has no readable text (it may be a scanned image), so nothing could be extracted.");
  const { data: x, engine } = await extract(userId, resume.extractedText);
  const p = await getProfile(userId);
  const sk = await getCandidateSkills(userId);

  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  const set = (label: string, key: string, cur: unknown, val: unknown) => { if ((cur == null || (typeof cur === "string" && !cur.trim())) && val != null && val !== "") { patch[key] = val; filled.push(label); } };
  set("Full name", "fullName", p?.fullName, x.fullName); set("Phone", "phone", p?.phone, x.phone); set("Location", "location", p?.location, x.location);
  set("Headline", "headline", p?.headline, x.headline); set("Summary", "summary", p?.summary, x.summary); set("Education", "education", p?.education, x.education);
  set("Graduation year", "graduationYear", p?.graduationYear, x.graduationYear); set("Years of experience", "yearsExperience", p?.yearsExperience, x.yearsExperience);
  set("Current title", "currentTitle", p?.currentTitle, x.currentTitle); set("Current company", "currentCompany", p?.currentCompany, x.currentCompany);
  set("LinkedIn", "linkedinUrl", p?.linkedinUrl, x.linkedinUrl); set("GitHub", "githubUrl", p?.githubUrl, x.githubUrl); set("Portfolio", "portfolioUrl", p?.portfolioUrl, x.portfolioUrl);

  const have = new Set([...sk.primary, ...sk.additional, ...sk.ai].map(normalizeSkill));
  const newPrimary = x.skills.primary.filter((s) => !have.has(normalizeSkill(s)));
  const newAdditional = x.skills.additional.filter((s) => !have.has(normalizeSkill(s)) && !newPrimary.some((n) => normalizeSkill(n) === normalizeSkill(s)));
  if (newPrimary.length || newAdditional.length) { patch.skills = { primary: [...sk.primary, ...newPrimary], additional: [...sk.additional, ...newAdditional] }; filled.push(`Skills (+${newPrimary.length + newAdditional.length})`); }

  const haveCo = new Set((p?.experience ?? []).map((e) => `${e.company}|${e.title}`.toLowerCase()));
  const newExp = x.experience.filter((e) => !haveCo.has(`${e.company}|${e.title}`.toLowerCase()));
  if (newExp.length) { patch.experience = [...(p?.experience ?? []), ...newExp]; filled.push(`Experience (+${newExp.length})`); }
  const havePr = new Set((p?.projects ?? []).map((e) => e.name.toLowerCase()));
  const newPr = x.projects.filter((e) => !havePr.has(e.name.toLowerCase()));
  if (newPr.length) { patch.projects = [...(p?.projects ?? []), ...newPr]; filled.push(`Projects (+${newPr.length})`); }

  // Validate; drop any single field that fails validation rather than failing the whole import.
  for (let i = 0; i < 6; i++) {
    const r = profileSchema.safeParse(patch);
    if (r.success) break;
    for (const issue of r.error.issues) delete patch[String(issue.path[0])];
  }
  const parsed = profileSchema.safeParse(patch);
  const safe = (parsed.success ? parsed.data : {}) as ProfileInput;
  const keys = Object.keys(patch);
  const kept = filled.filter((f) => keys.some((k) => ({ "Full name": "fullName", Phone: "phone", Location: "location", Headline: "headline", Summary: "summary", Education: "education", "Graduation year": "graduationYear", "Years of experience": "yearsExperience", "Current title": "currentTitle", "Current company": "currentCompany", LinkedIn: "linkedinUrl", GitHub: "githubUrl", Portfolio: "portfolioUrl" } as Record<string, string>)[f] === k || f.startsWith("Skills") && k === "skills" || f.startsWith("Experience") && k === "experience" || f.startsWith("Projects") && k === "projects"));
  const view = Object.keys(safe).length ? await updateProfile(userId, safe) : await getProfileView(userId);
  return { resumeName: resume.name, engine, filled: kept, nothingNew: kept.length === 0, view, completeness: await getProfileCompleteness(userId) };
}
