import { expandRoleKeywords } from "./normalize";

/** Skills that are good job-title keywords (e.g. "Python Developer"); generic skills like Git/HTML are not. */
const TITLE_SKILLS = new Set(["python", "django", "fastapi", "flask", "react", "react.js", "reactjs", "node", "node.js", "nodejs", "typescript", "javascript", "java", "golang", "go", "rust", "aws", "devops", "ml", "ai", "llm", "data", "next.js", "angular", "vue", ".net", "php", "ruby", "kotlin", "swift", "android", "ios", "react native", "flutter"]);
const display = (s: string) => s.replace(/\.js$/i, "").replace(/^react$/i, "react");

export type KeywordInput = { targetRoles: string[]; primarySkills: string[]; explicit?: string[]; yearsExperience?: number | null };

/**
 * Profile-driven search terms: explicit settings keywords + target roles (developer<->engineer variants) + "<skill> developer" for
 * title-worthy primary skills. Entry-level profiles (< 2 yrs) also get junior/associate/fresher variants so search is not dominated by senior roles.
 */
export function buildSearchKeywords(i: KeywordInput, max = 24): string[] {
  const out = new Set<string>();
  const add = (k: string) => { const v = k.toLowerCase().trim(); if (v) out.add(v); };
  (i.explicit ?? []).forEach(add);
  const roles = expandRoleKeywords(i.targetRoles);
  roles.forEach(add);
  for (const s of i.primarySkills) {
    const k = s.toLowerCase().trim();
    if (!TITLE_SKILLS.has(k)) continue;
    const d = display(k);
    add(`${d} developer`); add(`${d} engineer`);
  }
  if ((i.yearsExperience ?? 0) < 2) { ["junior", "associate", "fresher", "graduate", "trainee"].forEach((l) => { for (const r of roles.slice(0, 3)) add(`${l} ${r}`); }); }
  return [...out].slice(0, max);
}

/** Short list for per-query APIs (Adzuna/Jooble/Jobicy): the base role terms first, no junior-prefixed variants. */
export function queryTerms(keywords: string[], n = 6): string[] {
  const base = keywords.filter((k) => !/^(junior|associate|fresher|graduate|trainee)\b/.test(k));
  return (base.length ? base : keywords).slice(0, n);
}
