import { extractSkillsFromText } from "@/lib/ai/heuristics/skills";
import { INDIAN_PLACES } from "@/lib/job-sources/location-policy";

/** Pure resume → profile-field extraction (rule-based). Never invents: anything not found stays null / empty. */
export type ExtractedProfile = {
  fullName: string | null; email: string | null; phone: string | null; location: string | null; headline: string | null; summary: string | null;
  education: string | null; graduationYear: number | null; yearsExperience: number | null; currentTitle: string | null; currentCompany: string | null;
  linkedinUrl: string | null; githubUrl: string | null; portfolioUrl: string | null;
  skills: { primary: string[]; additional: string[] };
  experience: { company: string; title: string; start?: string; end?: string; description?: string }[];
  projects: { name: string; description?: string; tech?: string[]; url?: string }[];
};

const SECTION_RE: [string, RegExp][] = [
  ["summary", /^(professional\s+|career\s+)?(summary|objective|profile|about\s*me)$/i],
  ["experience", /^(work\s+|professional\s+|relevant\s+)?(experience|employment(\s+history)?|internships?|work\s+history)$/i],
  ["education", /^(education|academics?|academic\s+(background|qualifications?))$/i],
  ["skills", /^(technical\s+|key\s+|core\s+)?(skills|technologies|tech\s+stack)(\s*&\s*tools)?$/i],
  ["projects", /^(personal\s+|academic\s+|key\s+|selected\s+)?projects$/i],
  ["other", /^(certifications?|courses|achievements|awards|activities|extra[- ]?curricular|languages|interests|hobbies|references|publications|positions\s+of\s+responsibility)$/i],
];
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const POINT = `(?:(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const RANGE = new RegExp(`(${POINT})\\s*(?:-|–|—|to)\\s*(present|current|now|till\\s+date|ongoing|${POINT})`, "i");
const BULLET = /^\s*[•\-–—*▪●◦·➢➤○]\s*/;
const ROLE_RE = /\b(engineer|developer|intern|internship|analyst|associate|manager|consultant|designer|lead|trainee|architect|scientist|programmer|administrator|specialist|executive|officer|sde|tester|qa)\b/i;
const DEGREE_RE = /\b(b\.?\s?e\.?|b\.?\s?tech\.?|b\.?\s?sc\.?|b\.?\s?c\.?\s?a\.?|m\.?\s?c\.?\s?a\.?|m\.?\s?tech\.?|m\.?\s?sc\.?|m\.?\s?b\.?\s?a\.?|bachelor|master|diploma|b\.?com|b\.?a\.?)\b/i;

function splitSections(lines: string[]): { head: string[]; sec: Record<string, string[]> } {
  const sec: Record<string, string[]> = {};
  const head: string[] = [];
  let cur: string | null = null;
  for (const raw of lines) {
    const t = raw.trim().replace(/[:：]\s*$/, "").replace(/^[#\s_\-=]+|[_\-=\s]+$/g, "");
    const hit = t.length > 0 && t.length <= 40 ? SECTION_RE.find(([, re]) => re.test(t)) : undefined;
    if (hit) { cur = hit[0]; sec[cur] ??= []; continue; }
    (cur ? sec[cur] : head).push(raw);
  }
  return { head, sec };
}

const monthIdx = (s: string) => MONTHS.split("|").findIndex((m) => s.toLowerCase().startsWith(m === "sep" ? "sep" : m)) ;
function parsePoint(s: string, endOfYear: boolean): number | null {
  const t = s.trim();
  let m = new RegExp(`^(${MONTHS})[a-z]*\\.?,?\\s+(\\d{4})$`, "i").exec(t);
  if (m) return Number(m[2]) * 12 + Math.min(11, Math.max(0, monthIdx(m[1])));
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return Number(m[2]) * 12 + Math.min(11, Math.max(0, Number(m[1]) - 1));
  m = /^(\d{4})$/.exec(t);
  if (m) return Number(m[1]) * 12 + (endOfYear ? 11 : 0);
  return null;
}
const isNow = (s: string) => /^(present|current|now|till\s+date|ongoing)$/i.test(s.trim());

/** Total months across date ranges (overlaps merged). */
export function monthsOfExperience(ranges: { start: string; end: string }[], now = new Date()): number {
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const iv = ranges.map((r) => [parsePoint(r.start, false), isNow(r.end) ? nowIdx : parsePoint(r.end, true)] as const)
    .filter((x): x is readonly [number, number] => x[0] != null && x[1] != null && x[1] >= x[0]).sort((a, b) => a[0] - b[0]);
  let total = 0, curS = -1, curE = -1;
  for (const [s, e] of iv) { if (curS < 0) { curS = s; curE = e; } else if (s <= curE) curE = Math.max(curE, e); else { total += curE - curS + 1; curS = s; curE = e; } }
  if (curS >= 0) total += curE - curS + 1;
  return total;
}

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const stripBullet = (s: string) => s.replace(BULLET, "").trim();
const withScheme = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`).replace(/[).,;]+$/, "");

function parseHeader(parts: string[]): { title: string; company: string } {
  const flat = parts.flatMap((p) => p.split(/\s*[|–—]\s*|\s+at\s+|\s+@\s+|,\s+(?=[A-Z])/)).map(clean).filter(Boolean);
  const title = flat.find((p) => ROLE_RE.test(p)) ?? "";
  const company = flat.find((p) => p !== title && !ROLE_RE.test(p)) ?? (title ? "" : flat[0] ?? "");
  return { title, company: company || flat.find((p) => p !== title) || "" };
}

function parseExperience(lines: string[]) {
  const idx: number[] = [];
  lines.forEach((l, i) => { if (RANGE.test(l)) idx.push(i); });
  const blocks: { headerStart: number; dateIdx: number }[] = [];
  idx.forEach((di, k) => {
    const prevDate = k > 0 ? idx[k - 1] : -1;
    const prev = lines[di - 1]?.trim() ?? "";
    const usePrev = di - 1 > prevDate && prev && !BULLET.test(prev) && prev.length <= 90 && !/[.]$/.test(prev) && !RANGE.test(prev);
    blocks.push({ headerStart: usePrev ? di - 1 : di, dateIdx: di });
  });
  const out: ExtractedProfile["experience"] = [];
  const ranges: { start: string; end: string }[] = [];
  blocks.forEach((b, k) => {
    const m = RANGE.exec(lines[b.dateIdx])!;
    const rest = clean(lines[b.dateIdx].replace(RANGE, "").replace(/[()]/g, " ").replace(/^[\s|,\-–—:]+|[\s|,\-–—:]+$/g, ""));
    const headerParts = [b.headerStart < b.dateIdx ? lines[b.headerStart].trim() : "", rest].filter(Boolean);
    const { title, company } = parseHeader(headerParts);
    const end = k + 1 < blocks.length ? blocks[k + 1].headerStart : lines.length;
    const desc = lines.slice(b.dateIdx + 1, end).map(stripBullet).map(clean).filter(Boolean).join(" ").slice(0, 1500);
    ranges.push({ start: m[1], end: m[2] });
    if (company || title) out.push({ company: company || "Unknown company", title: title || "Role", start: clean(m[1]), end: isNow(m[2]) ? "Present" : clean(m[2]), description: desc || undefined });
  });
  return { entries: out, ranges };
}

function parseProjects(lines: string[]) {
  const out: ExtractedProfile["projects"] = [];
  const isHeader = (i: number) => {
    const t = lines[i].trim();
    if (!t || BULLET.test(t) || t.length > 100 || /^[a-z]/.test(t)) return false;
    const prev = lines[i - 1]?.trim() ?? "";
    if (prev && !BULLET.test(prev) && !/^(tech|technologies|stack)/i.test(prev) && i > 0 && !/[|–—]/.test(t)) return false;
    const next = [lines[i + 1], lines[i + 2]].map((x) => x?.trim() ?? "");
    return /[|–—]/.test(t) || next.some((n) => BULLET.test(n)) || /^(tech|technologies|stack)/i.test(next[0]);
  };
  const starts = lines.map((_, i) => i).filter(isHeader);
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const header = lines[s].trim();
    const name = clean(header.split(/\s*[|–—:(]\s*/)[0]);
    if (!name || name.length < 2) return;
    const body = lines.slice(s + 1, end).map((l) => l.trim()).filter(Boolean);
    const techLine = [header, ...body].find((l) => /^(?:.*?\b)?(tech(?:nologies)?(?:\s+stack)?|stack|built\s+with|tools)\s*[:\-–]\s*/i.test(l));
    let tech: string[] = [];
    if (techLine) tech = techLine.replace(/^.*?(tech(?:nologies)?(?:\s+stack)?|stack|built\s+with|tools)\s*[:\-–]\s*/i, "").split(/[,/|•·;]/).map(clean).filter((x) => x && x.length <= 30).slice(0, 15);
    else tech = extractSkillsFromText(`${header} ${body.join(" ")}`).slice(0, 8);
    const url = /(https?:\/\/[^\s)]+)/.exec(`${header} ${body.join(" ")}`)?.[1];
    const description = body.filter((l) => l !== techLine).map(stripBullet).map(clean).join(" ").slice(0, 1500);
    out.push({ name: name.slice(0, 120), description: description || undefined, tech: tech.length ? tech : undefined, url: url && !/linkedin\.com/i.test(url) ? url.replace(/[).,;]+$/, "") : undefined });
  });
  return out;
}

export function extractProfileHeuristic(text: string, now = new Date()): ExtractedProfile {
  const lines = text.replace(/\r/g, "").split("\n");
  const { head, sec } = splitSections(lines);
  const headLines = head.map((l) => l.trim()).filter(Boolean);
  const top = [...headLines.slice(0, 10), ...lines.map((l) => l.trim()).filter(Boolean).slice(0, 10)];

  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(text)?.[0] ?? null;
  const phoneRaw = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.exec(top.join(" "))?.[0] ?? /\+\d{1,3}[\s-]?\d[\d\s-]{8,13}\d/.exec(top.join(" "))?.[0] ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "").replace(/^91(?=\d{10}$)/, "") : null;
  const linkedin = /(?:https?:\/\/)?(?:[a-z]+\.)?linkedin\.com\/[^\s)|,]+/i.exec(text)?.[0] ?? null;
  const github = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9-]+(?:\/[^\s)|,]*)?/i.exec(text)?.[0] ?? null;
  const otherUrl = [...text.matchAll(/https?:\/\/[^\s)|,]+/gi)].map((m) => m[0]).find((u) => !/linkedin\.com|github\.com|mailto:/i.test(u) && /\.(dev|io|me|com|in|app|tech|xyz|vercel\.app|netlify\.app)\b/i.test(u));

  const name = top.map((l) => clean(l.replace(/[|•·].*$/, ""))).find((l) => /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(l) && l.split(" ").length <= 5 && !SECTION_RE.some(([, re]) => re.test(l)) && !/@|resume|curriculum|vitae/i.test(l)) ?? null;

  let location: string | null = null;
  for (const l of top) {
    const place = INDIAN_PLACES.find((p) => new RegExp(`(^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(l));
    if (!place || /university|college|institute|school|engineer|developer/i.test(l)) continue;
    const m = new RegExp(`([A-Z][A-Za-z]+(?:\\s[A-Z][A-Za-z]+)?)(?:,\\s*[A-Za-z ]+)?`, "").exec(l.slice(Math.max(0, l.toLowerCase().indexOf(place) - 2)));
    const pretty = place.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    location = place === "india" ? "India" : m && m[0].toLowerCase().startsWith(place) ? clean(m[0]).replace(/\s+(Phone|Email|Mobile|Github|Linkedin).*$/i, "") : `${pretty}, India`;
    break;
  }

  const exp = parseExperience((sec.experience ?? []).filter((l) => l.trim()));
  const months = monthsOfExperience(exp.ranges, now);
  const yearsExperience = exp.ranges.length ? Math.round((months / 12) * 10) / 10 : null;
  const first = exp.entries[0];
  const current = first && /present/i.test(first.end ?? "") ? first : null;

  const eduLines = (sec.education ?? []).map((l) => l.trim()).filter(Boolean);
  const degreeLine = eduLines.find((l) => DEGREE_RE.test(l));
  const education = degreeLine ? clean(degreeLine.replace(RANGE, "").replace(/\(?\s*(cgpa|gpa|percentage)[^)]*\)?/i, "").replace(/[|,\-–—:\s]+$/, "")).slice(0, 200) || null : null;
  const years = [...eduLines.join(" ").matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0])).filter((y) => y >= 1990 && y <= now.getFullYear() + 6);
  const graduationYear = years.length ? Math.max(...years) : null;

  const skillsSec = (sec.skills ?? []).join(" ");
  const inSkills = extractSkillsFromText(skillsSec);
  const all = extractSkillsFromText(text);
  const primary = (inSkills.length ? inSkills : all).slice(0, 10);
  const additional = all.filter((s) => !primary.includes(s)).slice(0, 25);

  const summary = (sec.summary ?? []).map(clean).filter(Boolean).join(" ").slice(0, 600) || null;
  const currentTitle = current?.title && current.title !== "Role" ? current.title : null;
  const headline = currentTitle && primary.length >= 2 ? `${currentTitle} (${primary.slice(0, 3).join(", ")})` : null;

  return {
    fullName: name ? titleCase(name) : null, email, phone, location, headline, summary, education, graduationYear, yearsExperience,
    currentTitle, currentCompany: current && current.company !== "Unknown company" ? current.company : null,
    linkedinUrl: linkedin ? withScheme(linkedin) : null, githubUrl: github ? withScheme(github) : null, portfolioUrl: otherUrl ? withScheme(otherUrl) : null,
    skills: { primary, additional }, experience: exp.entries.slice(0, 15), projects: parseProjects((sec.projects ?? []).filter((l) => l.trim().length)).slice(0, 15),
  };
}
