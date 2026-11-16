import { normalizeSkill } from "@/lib/utils/skills";
import { extractSkillsFromText } from "./skills";

export type ResumeAnalysis = {
  engine: "llm" | "heuristic";
  model?: string | null;
  atsScore: number;
  summary: string;
  sections: { name: string; present: boolean }[];
  detectedSkills: string[];
  missingTargetSkills: string[];
  strengths: string[];
  improvements: string[];
  contact: { email: string | null; phone: string | null; linkedin: string | null; github: string | null };
  wordCount: number;
  analyzedAt: string;
};

const SECTION_PATTERNS: [string, RegExp][] = [
  ["Summary / Objective", /^\s*(professional\s+)?(summary|objective|profile|about me)\b/im],
  ["Experience", /^\s*(work\s+|professional\s+)?(experience|employment|internships?)\b/im],
  ["Education", /^\s*education\b/im],
  ["Skills", /^\s*(technical\s+)?skills\b/im],
  ["Projects", /^\s*(personal\s+|academic\s+)?projects\b/im],
  ["Certifications", /^\s*(certifications?|courses|achievements|awards)\b/im],
];

export function extractContact(text: string) {
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  const phone = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)\d{3,5}[\s-]?\d{3,5}/)?.[0]?.trim() ?? null;
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0] ?? null;
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)]+/i)?.[0] ?? null;
  return { email, phone, linkedin, github };
}

export function countWords(text: string) { return (text.match(/\S+/g) ?? []).length; }

/** Deterministic resume analysis. Never invents content: every statement is derived from the extracted text and the user's own profile. */
export function analyzeResumeHeuristic(text: string, opts: { profileSkills: string[]; targetRoles?: string[] }): ResumeAnalysis {
  const wordCount = countWords(text);
  const sections = SECTION_PATTERNS.map(([name, re]) => ({ name, present: re.test(text) }));
  const contact = extractContact(text);
  const detected = extractSkillsFromText(text, opts.profileSkills);
  const detectedNorm = new Set(detected.map(normalizeSkill));
  const missingTarget = opts.profileSkills.filter((s) => !detectedNorm.has(normalizeSkill(s)));
  const bullets = (text.match(/^\s*[•\-–*▪●]\s+\S/gm) ?? []).length;
  const metrics = (text.match(/\b\d+(?:\.\d+)?\s?(%|x|k\b|users|ms|lpa|\+)/gi) ?? []).length;

  let ats = 40;
  ats += sections.filter((s) => s.present).length * 6;
  if (contact.email) ats += 5;
  if (contact.phone) ats += 3;
  if (contact.linkedin || contact.github) ats += 3;
  if (wordCount >= 250 && wordCount <= 900) ats += 8; else if (wordCount >= 120) ats += 3;
  if (bullets >= 5) ats += 4;
  if (metrics >= 2) ats += 4;
  ats += Math.min(8, detected.length);
  if (wordCount < 120) ats -= 15;
  const atsScore = Math.max(0, Math.min(100, ats));

  const strengths: string[] = [];
  const improvements: string[] = [];
  const present = new Set(sections.filter((s) => s.present).map((s) => s.name));
  if (detected.length >= 8) strengths.push(`Lists ${detected.length} recognisable technical skills.`);
  if (metrics >= 2) strengths.push("Includes quantified results (numbers/percentages).");
  if (bullets >= 5) strengths.push("Uses bullet points, which parse well in applicant tracking systems.");
  if (contact.email && (contact.linkedin || contact.github)) strengths.push("Contact details and professional links are present.");
  if (!strengths.length) strengths.push("No standout strengths could be detected automatically; review manually.");

  for (const s of sections) if (!s.present && s.name !== "Certifications") improvements.push(`No clear "${s.name}" heading detected; add one so parsers can find it.`);
  if (!contact.email) improvements.push("No email address detected.");
  if (!contact.phone) improvements.push("No phone number detected.");
  if (!contact.linkedin && !contact.github) improvements.push("Add a LinkedIn or GitHub link.");
  if (wordCount < 200) improvements.push(`Only ${wordCount} words extracted; the resume may be too short, or it is image-based and not machine-readable.`);
  if (wordCount > 1000) improvements.push("Resume is long; aim for 1–2 pages.");
  if (metrics < 2) improvements.push("Add measurable outcomes (e.g. latency reduced, users served) only where they are true.");
  if (bullets < 5) improvements.push("Use bullet points for experience and project descriptions.");
  if (missingTarget.length) improvements.push(`Skills from your profile not found in this resume: ${missingTarget.slice(0, 8).join(", ")}. Add them only if you genuinely have them.`);

  return {
    engine: "heuristic", model: null, atsScore,
    summary: `Heuristic analysis: ${present.size} of ${sections.length} standard sections found, ${detected.length} skills detected, ${wordCount} words.`,
    sections, detectedSkills: detected, missingTargetSkills: missingTarget, strengths, improvements, contact, wordCount,
    analyzedAt: new Date().toISOString(),
  };
}

export type ResumeLite = { id: string; name: string; extractedText: string; isDefault: boolean };

/** Picks the resume whose text overlaps most with the job keywords. Ties → default resume → first. Returns null if there are no resumes. */
export function pickResume(keywords: string[], resumes: ResumeLite[]): { id: string; overlap: number } | null {
  if (!resumes.length) return null;
  const kw = [...new Set(keywords.map(normalizeSkill).filter(Boolean))];
  const scored = resumes.map((r) => {
    const found = new Set(extractSkillsFromText(r.extractedText, keywords).map(normalizeSkill));
    const lower = r.extractedText.toLowerCase();
    const overlap = kw.filter((k) => found.has(k) || lower.includes(k)).length;
    return { r, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap || Number(b.r.isDefault) - Number(a.r.isDefault));
  return { id: scored[0].r.id, overlap: scored[0].overlap };
}

export type ResumeComparison = {
  common: string[]; onlyA: string[]; onlyB: string[];
  a: { wordCount: number; atsScore: number; skillCount: number; sections: string[] };
  b: { wordCount: number; atsScore: number; skillCount: number; sections: string[] };
  verdict: string;
};

export function compareResumeTexts(aText: string, bText: string, names: { a: string; b: string }, profileSkills: string[]): ResumeComparison {
  const a = analyzeResumeHeuristic(aText, { profileSkills }), b = analyzeResumeHeuristic(bText, { profileSkills });
  const an = new Map(a.detectedSkills.map((s) => [normalizeSkill(s), s])), bn = new Map(b.detectedSkills.map((s) => [normalizeSkill(s), s]));
  const common = [...an.keys()].filter((k) => bn.has(k)).map((k) => an.get(k)!);
  const onlyA = [...an.keys()].filter((k) => !bn.has(k)).map((k) => an.get(k)!);
  const onlyB = [...bn.keys()].filter((k) => !an.has(k)).map((k) => bn.get(k)!);
  const pack = (x: typeof a) => ({ wordCount: x.wordCount, atsScore: x.atsScore, skillCount: x.detectedSkills.length, sections: x.sections.filter((s) => s.present).map((s) => s.name) });
  const diff = a.atsScore - b.atsScore;
  const verdict = Math.abs(diff) < 3 && a.detectedSkills.length === b.detectedSkills.length
    ? "The two resumes are comparable on ATS readiness and skill coverage."
    : `${diff >= 0 ? names.a : names.b} scores higher on ATS readiness (${Math.max(a.atsScore, b.atsScore)} vs ${Math.min(a.atsScore, b.atsScore)}); ${onlyA.length > onlyB.length ? names.a : onlyB.length > onlyA.length ? names.b : "neither"} covers more distinct skills.`;
  return { common, onlyA, onlyB, a: pack(a), b: pack(b), verdict };
}
