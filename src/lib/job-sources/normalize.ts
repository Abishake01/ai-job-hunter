import { normalizeSkill } from "@/lib/utils/skills";
import type { JobType, NormalizedJob, WorkMode } from "./types";

// ---------------------------------------------------------------- HTML / text
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", euro: "€", pound: "£", copy: "©", reg: "®", trade: "™" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML -> readable plain text (keeps paragraph/list structure). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(t).replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------- URL / fingerprint
const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|ref|ref_src|referrer|source|src|lever-source|lever-origin|gh_src|trk|trackingid|tracking_id|refid|campaign|_hsenc|_hsmi|igshid|ccuid|vero_id|from|origin)$/i;
/** Canonical URL for dedupe: lowercase host, no www, no hash, no tracking params, sorted params, no trailing slash. */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${qs}`.toLowerCase();
  } catch { return null; }
}

const COMPANY_SUFFIX = /\b(incorporated|inc|llc|llp|ltd|limited|pvt|private|corp|corporation|gmbh|ag|co|company|plc|sa|bv|pty|technologies|technology|software|solutions|labs|india)\b/g;
export function normalizeCompany(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ");
  const stripped = base.replace(COMPANY_SUFFIX, " ").replace(/\s+/g, " ").trim();
  return stripped || base.replace(/\s+/g, " ").trim();
}
export function normalizeTitle(title: string): string {
  return title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\((?:[mfwdx*]\s*[\/|]\s*)+[mfwdx*]\)/g, " ") // gender markers: (m/f/d)
    .replace(/&/g, " and ")
    .replace(/\bsr\b\.?/g, "senior").replace(/\bjr\b\.?/g, "junior")
    .replace(/[^a-z0-9+# ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function locationBucket(location: string | null | undefined): string {
  if (!location) return "any";
  const l = location.toLowerCase();
  if (/\bremote\b|anywhere|work from home|\bwfh\b/.test(l)) return "remote";
  const first = l.split(/[,;/|(–-]/)[0].replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return first || "any";
}
/** company|title|location bucket — the same job from different sources must produce the same fingerprint. */
export function makeFingerprint(company: string, title: string, location: string | null | undefined): string {
  return `${normalizeCompany(company)}|${normalizeTitle(title)}|${locationBucket(location)}`;
}

// ---------------------------------------------------------------- work mode / job type
export function detectWorkMode(...parts: (string | null | undefined)[]): WorkMode | null {
  const t = parts.filter(Boolean).join(" \n ").toLowerCase();
  if (!t) return null;
  if (/\bhybrid\b/.test(t)) return "hybrid";
  const remote = /\bremote(?:ly)?\b|work(?:ing)? from home|\bwfh\b|\btelecommut/.test(t);
  const onsite = /\bon[- ]?site\b|\bin[- ]office\b|work from office|\bwfo\b|office[- ]based/.test(t);
  if (remote && onsite) return null; // ambiguous => Unknown
  if (remote) return "remote";
  if (onsite) return "onsite";
  return null;
}

export function detectJobType(...parts: (string | null | undefined)[]): JobType | null {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  if (!t) return null;
  if (/\binterns?(hip)?s?\b|\btrainee\b|werkstudent|working student/.test(t)) return "internship";
  if (/\bcontract(or|ual)?\b|\bfreelance\b|\bfixed[- ]term\b|\btemporary\b|\btemp\b/.test(t)) return "contract";
  if (/\bpart[- ]?time\b/.test(t)) return "part_time";
  if (/\bfull[- ]?time\b|\bpermanent\b/.test(t)) return "full_time";
  return null;
}

// ---------------------------------------------------------------- experience
export interface ExperienceParse { experienceMin: number | null; experienceMax: number | null; experienceText: string | null }
const NUM = "(\\d+(?:\\.\\d+)?)";
const YRS = "(?:years?|yrs?)";
export function parseExperience(text: string): ExperienceParse {
  const none: ExperienceParse = { experienceMin: null, experienceMax: null, experienceText: null };
  if (!text) return none;
  const near = (idx: number, len: number) => /\bexperience\b|\bexp\b/i.test(text.slice(Math.max(0, idx - 60), idx + len + 60));
  const tries: { re: RegExp; build: (m: RegExpExecArray) => [number, number | null] }[] = [
    { re: new RegExp(`${NUM}\\s*(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*${YRS}`, "gi"), build: (m) => [+m[1], +m[2]] },
    { re: new RegExp(`${NUM}\\s*\\+\\s*${YRS}`, "gi"), build: (m) => [+m[1], null] },
    { re: new RegExp(`(?:minimum|min\\.?|at\\s*least)\\s*(?:of\\s*)?${NUM}\\s*${YRS}`, "gi"), build: (m) => [+m[1], null] },
    { re: new RegExp(`(?:up\\s*to|max(?:imum)?)\\s*${NUM}\\s*${YRS}\\s*(?:of\\s*)?experience`, "gi"), build: (m) => [0, +m[1]] },
    { re: new RegExp(`${NUM}\\s*${YRS}`, "gi"), build: (m) => [+m[1], +m[1]] },
  ];
  for (const { re, build } of tries) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!near(m.index, m[0].length)) continue;
      const [min, max] = build(m);
      if (min > 40 || (max !== null && (max > 40 || max < min))) continue;
      return { experienceMin: min, experienceMax: max, experienceText: m[0].replace(/\s+/g, " ").trim() };
    }
  }
  const months = new RegExp(`${NUM}\\s*months?\\s*(?:of\\s*)?(?:relevant\\s*)?experience`, "i").exec(text);
  if (months) return { experienceMin: +months[1] / 12, experienceMax: null, experienceText: months[0] };
  const fresher = /\bfreshers?\b|\bentry[- ]level\b|\bno (?:prior )?experience (?:required|needed|necessary)\b/i.exec(text);
  if (fresher) return { experienceMin: 0, experienceMax: null, experienceText: fresher[0] };
  return none;
}

// ---------------------------------------------------------------- salary
export interface SalaryParse { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryText: string | null }
const CUR_MAP: Record<string, string> = { "₹": "INR", rs: "INR", inr: "INR", "$": "USD", "us$": "USD", usd: "USD", "€": "EUR", eur: "EUR", "£": "GBP", gbp: "GBP", cad: "CAD", aud: "AUD" };
export const annualToMonthly = (v: number) => Math.round(v / 12);
export const lpaToMonthly = (lpa: number) => Math.round((lpa * 100000) / 12);

function periodOf(after: string): "month" | "year" | "hour" | null {
  const a = after.slice(0, 40).toLowerCase();
  if (/^\s*(?:per|\/|a)\s*\.?\s*(?:hour|hr)\b/.test(a)) return "hour";
  if (/^\s*(?:per|\/|a)\s*\.?\s*(?:month|mo|mth)\b|^\s*(?:monthly|pm\b|p\.m\b)/.test(a)) return "month";
  if (/^\s*(?:per|\/|a)\s*\.?\s*(?:annum|year|yr)\b|^\s*(?:annually|annual|yearly|pa\b|p\.a\b|ctc)/.test(a)) return "year";
  return null;
}

/** Salary text -> MONTHLY figures. Anything ambiguous (no period, unclear scale) leaves amounts null (text is kept). */
export function parseSalary(text: string): SalaryParse {
  const none: SalaryParse = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryText: null };
  if (!text) return none;

  // 1) Indian lakhs: "6-8 LPA", "₹6.5 LPA", "4 to 6 lakhs per annum"
  const lpa = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:(?:-|–|—|to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?))?\s*(?:lpa\b|l\.p\.a|lakhs?\b|lacs?\b)/i.exec(text);
  if (lpa) {
    const a = +lpa[1], b = lpa[2] ? +lpa[2] : a;
    return { salaryMin: lpaToMonthly(Math.min(a, b)), salaryMax: lpaToMonthly(Math.max(a, b)), salaryCurrency: "INR", salaryText: lpa[0].trim() };
  }

  // 2) Currency-prefixed amounts / ranges, optional k/m suffix, optional period.
  // groups: 1 cur, 2 numA, 3 sufA, 4 numB, 5 sufB
  const re = /(₹|US\$|\$|€|£|\bRs\.?|\bINR|\bUSD|\bEUR|\bGBP|\bCAD|\bAUD)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM]\b)?\s*(?:(?:-|–|—|to)\s*(?:₹|US\$|\$|€|£|Rs\.?|INR|USD|EUR|GBP|CAD|AUD)?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM]\b)?)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cur = CUR_MAP[m[1].toLowerCase().replace(/\.$/, "")];
    if (!cur) continue;
    const mult = (s?: string) => (s ? (s.toLowerCase() === "k" ? 1e3 : 1e6) : 1);
    let a = parseFloat(m[2].replace(/,/g, ""));
    let b = m[4] ? parseFloat(m[4].replace(/,/g, "")) : null;
    let ma = mult(m[3]);
    const mb = mult(m[5]);
    if (b !== null && !m[3] && m[5] && a < 1000) ma = mb; // "85-155k"
    a *= ma;
    if (b !== null) b *= mb;
    const rest = text.slice(m.index + m[0].length);
    const period = periodOf(rest);
    let toMonthly: (v: number) => number | null;
    if (period === "month") toMonthly = (v) => Math.round(v);
    else if (period === "year") toMonthly = annualToMonthly;
    else if (period === "hour") toMonthly = () => null;
    else if (cur === "INR") toMonthly = (v) => (v >= 1_000_000 ? annualToMonthly(v) : null);
    else toMonthly = (v) => (v >= 20000 ? annualToMonthly(v) : null);
    const lo = toMonthly(a);
    const hi = b !== null ? toMonthly(b) : lo;
    const label = m[0].trim();
    if (lo === null || hi === null) return { salaryMin: null, salaryMax: null, salaryCurrency: cur, salaryText: label };
    return { salaryMin: Math.min(lo, hi), salaryMax: Math.max(lo, hi), salaryCurrency: cur, salaryText: label };
  }
  return none;
}

// ---------------------------------------------------------------- skills
const SKILL_VOCAB = [
  "python", "java", "javascript", "typescript", "c++", "c#", "golang", "rust", "ruby", "php", "kotlin", "swift", "scala",
  "react", "react native", "next.js", "vue", "angular", "svelte", "node.js", "express", "nestjs", "django", "flask", "fastapi", "spring boot", "spring", ".net", "rails", "laravel",
  "html", "css", "tailwind", "sass", "redux", "graphql", "rest apis", "grpc", "websockets",
  "postgresql", "mysql", "mongodb", "redis", "sqlite", "elasticsearch", "kafka", "rabbitmq", "dynamodb", "cassandra", "sql", "nosql", "snowflake", "bigquery",
  "aws", "aws lambda", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd", "jenkins", "github actions", "linux", "nginx", "microservices",
  "machine learning", "deep learning", "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "nlp", "computer vision", "llm apis", "generative ai", "langchain", "rag", "openai", "prompt engineering", "hugging face",
  "git", "github", "jira", "agile", "figma", "selenium", "pytest", "jest", "cypress", "celery", "prisma", "sqlalchemy", "drizzle",
];
const ALT: Record<string, string[]> = {
  "rest apis": ["rest api", "restful api", "restful apis"], "llm apis": ["llm", "llms", "llm api"], "generative ai": ["genai", "gen ai"],
  "node.js": ["nodejs", "node js"], "next.js": ["nextjs"], "react": ["react.js", "reactjs"], "postgresql": ["postgres"], "scikit-learn": ["sklearn"],
};
const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\/*]/g, "\\$&");
const SKILL_RES = SKILL_VOCAB.map((s) => ({
  s,
  res: [s, ...(ALT[s] ?? [])].map((x) => new RegExp(`(?<![a-z0-9+#.])${esc(x)}(?![a-z0-9+#])`, "i")),
}));

/** Known-vocabulary skill extraction: skills after "nice to have / preferred / bonus" headings are optional. */
export function extractSkills(text: string | null | undefined, extra: string[] = []): { required: string[]; optional: string[] } {
  const t = text ?? "";
  const cut = t.search(/\b(nice[- ]to[- ]have|good to have|preferred (?:skills|qualifications)|bonus (?:points|skills)|desirable)\b/i);
  const reqPart = cut > 200 ? t.slice(0, cut) : t;
  const optPart = cut > 200 ? t.slice(cut) : "";
  const found = (src: string) => {
    const out = new Set<string>();
    if (!src) return out;
    for (const { s, res } of SKILL_RES) if (res.some((re) => re.test(src))) out.add(normalizeSkill(s));
    return out;
  };
  const required = found(reqPart);
  for (const e of extra) {
    const n = normalizeSkill(e);
    if (n && n.length < 40) required.add(n);
  }
  const optional = [...found(optPart)].filter((s) => !required.has(s));
  return { required: [...required], optional };
}

// ---------------------------------------------------------------- composite
/** Extract experience / salary / work-mode / job-type from free text. Only returns fields it actually found. */
export function parseJobText(text: string): Partial<NormalizedJob> {
  const out: Partial<NormalizedJob> = {};
  if (!text) return out;
  const exp = parseExperience(text);
  if (exp.experienceText) Object.assign(out, exp);
  const sal = parseSalary(text);
  if (sal.salaryText) Object.assign(out, sal);
  const wm = detectWorkMode(text);
  if (wm) out.workMode = wm;
  const jt = detectJobType(text);
  if (jt) out.jobType = jt;
  return out;
}

export function mapEmploymentType(s: string | null | undefined): JobType | null {
  if (!s) return null;
  const t = s.toLowerCase().replace(/[_-]/g, " ");
  if (/intern/.test(t)) return "internship";
  if (/contract|freelance|temporary|temp\b/.test(t)) return "contract";
  if (/part ?time/.test(t)) return "part_time";
  if (/full ?time|permanent|regular/.test(t)) return "full_time";
  return null;
}

// ---------------------------------------------------------------- keyword relevance + age
export function expandRoleKeywords(roles: string[]): string[] {
  const out = new Set<string>();
  for (const r of roles) {
    const k = r.toLowerCase().trim();
    if (!k) continue;
    out.add(k);
    if (/developer/.test(k)) out.add(k.replace(/developer/g, "engineer"));
    if (/engineer/.test(k)) out.add(k.replace(/engineer/g, "developer"));
  }
  return [...out];
}
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
export function matchesKeywords(job: Pick<NormalizedJob, "title" | "description">, tags: string[], keywords: string[]): boolean {
  if (!keywords.length) return true;
  const hay = " " + squash(`${job.title} ${tags.join(" ")} ${(job.description ?? "").slice(0, 2500)}`) + " ";
  const hayNoSpace = hay.replace(/ /g, "");
  return keywords.some((k) => {
    const q = squash(k);
    return !!q && (hay.includes(" " + q + " ") || hayNoSpace.includes(q.replace(/ /g, "")));
  });
}
export function isRecent(postedAt: Date | null, maxAgeDays: number, now = new Date()): boolean {
  if (!postedAt) return true; // unknown date: keep
  return now.getTime() - postedAt.getTime() <= maxAgeDays * 86400_000;
}

type Base = Pick<NormalizedJob, "title" | "company" | "description" | "location" | "postedAt" | "applyUrl" | "source" | "sourceJobId" | "sourceUrl" | "discoveredAt">;
/** Build a NormalizedJob from structured adapter fields, filling gaps from free text (never overriding structured values). */
export function buildJob(base: Base, structured: Partial<NormalizedJob> & { skills?: string[] } = {}): NormalizedJob {
  const text = `${base.title}\n${base.description ?? ""}`;
  const p = parseJobText(text);
  const skills = extractSkills(base.description ?? "", structured.skills ?? []);
  return {
    ...base,
    requiredSkills: skills.required,
    optionalSkills: skills.optional,
    experienceMin: structured.experienceMin ?? p.experienceMin ?? null,
    experienceMax: structured.experienceMax ?? p.experienceMax ?? null,
    experienceText: structured.experienceText ?? p.experienceText ?? null,
    salaryMin: structured.salaryMin ?? p.salaryMin ?? null,
    salaryMax: structured.salaryMax ?? p.salaryMax ?? null,
    salaryCurrency: structured.salaryCurrency ?? p.salaryCurrency ?? null,
    salaryText: structured.salaryText ?? p.salaryText ?? null,
    workMode: structured.workMode ?? detectWorkMode(base.title, base.location) ?? p.workMode ?? null,
    jobType: structured.jobType ?? detectJobType(base.title) ?? p.jobType ?? null,
    deadline: structured.deadline ?? null,
  };
}

/** Normalize + dedupe skill names (alias-aware). */
export function normalizeSkillsFor(names: string[]): string[] {
  return [...new Set(names.map((n) => normalizeSkill(n)).filter((n) => n && n.length <= 60))];
}
