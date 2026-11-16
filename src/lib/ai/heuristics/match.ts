import { normalizeSkill } from "@/lib/utils/skills";

export type Thresholds = { excellent: number; good: number };
export type MatchCategory = "excellent" | "good" | "low";

export function categorize(score: number, t: Thresholds): MatchCategory {
  return score >= t.excellent ? "excellent" : score >= t.good ? "good" : "low";
}

export type CandidateInput = {
  skills: string[]; // primary + additional + AI skills (display names)
  targetRoles: string[];
  currentTitle: string | null;
  yearsExperience: number | null;
  education: string | null;
  workModes: string[];
  jobTypes: string[];
  includeInternshipsContract: boolean;
  preferredLocations: string[];
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  currency: string;
};
export type JobInput = {
  title: string;
  description: string | null;
  location: string | null;
  workMode: string | null;
  jobType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  skills: { name: string; required: boolean }[];
};

export type Fit<S extends string> = { status: S; detail: string };
export type MatchDetails = {
  experienceFit: Fit<"fits" | "stretch" | "below" | "unknown">;
  salaryFit: Fit<"within" | "above" | "below" | "unknown">;
  locationFit: Fit<"match" | "mismatch" | "unknown">;
  workModeFit: Fit<"match" | "mismatch" | "unknown">;
  educationFit: Fit<"fits" | "below" | "unknown">;
  mismatchReasons: string[];
  worthApplying: boolean;
};
export type HeuristicMatch = {
  score: number;
  matchingSkills: string[];
  missingSkills: string[];
  optionalMissingSkills: string[];
  details: MatchDetails;
  breakdown: { skills: number; role: number; experience: number; salary: number; location: number; education: number };
  recommendation: string;
  explanation: string;
};

const W = { skills: 45, role: 15, experience: 15, salary: 10, location: 10, education: 5 };

const ROLE_STOP = new Set(["a", "an", "the", "and", "of", "for", "in", "at", "sr", "jr", "senior", "junior", "lead", "principal", "staff", "associate", "i", "ii", "iii", "remote", "intern", "trainee", "-", "–", "|", "/", "(", ")"]);
const ROLE_SYN: Record<string, string> = { developer: "engineer", dev: "engineer", programmer: "engineer", swe: "software engineer", sde: "software engineer", "full-stack": "fullstack", "full": "fullstack", "back-end": "backend", "front-end": "frontend", ai: "ai", ml: "ai" };
export function roleTokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().replace(/[(),|/]/g, " ").replace(/full[\s-]stack/g, "fullstack").replace(/back[\s-]end/g, "backend").replace(/front[\s-]end/g, "frontend").split(/\s+/)) {
    if (!raw || ROLE_STOP.has(raw)) continue;
    const m = ROLE_SYN[raw] ?? raw;
    out.push(...m.split(" "));
  }
  return [...new Set(out)];
}

/** Fraction (0..1) of the candidate-role tokens found in the job title tokens; best across roles. */
export function roleRelevance(jobTitle: string, roles: string[]): number {
  const jt = new Set(roleTokens(jobTitle));
  if (!jt.size || !roles.length) return 0;
  let best = 0;
  for (const r of roles) {
    const rt = roleTokens(r);
    if (!rt.length) continue;
    const hit = rt.filter((t) => jt.has(t)).length;
    // domain tokens (non-"engineer") matter more than the generic "engineer"
    const domain = rt.filter((t) => t !== "engineer" && t !== "software");
    const domainHit = domain.filter((t) => jt.has(t)).length;
    const frac = domain.length ? 0.75 * (domainHit / domain.length) + 0.25 * (hit / rt.length) : hit / rt.length;
    best = Math.max(best, frac);
  }
  return Math.min(1, best);
}

const INDIAN_PLACES = ["india", "bangalore", "bengaluru", "mumbai", "pune", "hyderabad", "chennai", "delhi", "gurgaon", "gurugram", "noida", "kolkata", "ahmedabad", "kochi", "coimbatore", "jaipur", "indore", "chandigarh", "trivandrum", "thiruvananthapuram", "mysore", "mysuru", "nagpur", "bhubaneswar", "lucknow"];

function locationFit(job: JobInput, c: CandidateInput): { fit: MatchDetails["locationFit"]; wmFit: MatchDetails["workModeFit"]; locPts: number; wmPts: number } {
  const jobLoc = (job.location ?? "").toLowerCase().trim();
  const prefs = c.preferredLocations.map((l) => l.toLowerCase().trim()).filter(Boolean);
  const wm = job.workMode;

  let wmFit: MatchDetails["workModeFit"]; let wmPts: number;
  if (!wm) { wmFit = { status: "unknown", detail: "Work mode: Unknown" }; wmPts = W.location / 4; }
  else if (!c.workModes.length || c.workModes.includes(wm)) { wmFit = { status: "match", detail: `${wm} is in your preferred work modes` }; wmPts = W.location / 2; }
  else { wmFit = { status: "mismatch", detail: `${wm} is not in your preferred work modes (${c.workModes.join(", ")})` }; wmPts = 0; }

  let fit: MatchDetails["locationFit"]; let locPts: number;
  const remotePref = prefs.includes("remote");
  if (wm === "remote" && (remotePref || c.workModes.includes("remote") || !prefs.length)) {
    fit = { status: "match", detail: "Remote role" }; locPts = W.location / 2;
  } else if (!jobLoc) {
    fit = { status: "unknown", detail: "Location: Unknown" }; locPts = W.location / 4;
  } else if (!prefs.length) {
    fit = { status: "unknown", detail: "No preferred locations set" }; locPts = W.location / 4;
  } else {
    const hit = prefs.find((p) => p !== "remote" && (jobLoc.includes(p) || p.includes(jobLoc)))
      ?? (prefs.includes("india") && INDIAN_PLACES.some((p) => jobLoc.includes(p)) ? "India" : undefined)
      ?? (remotePref && /remote|anywhere|work from home|wfh/.test(jobLoc) ? "Remote" : undefined);
    if (hit) { fit = { status: "match", detail: `${job.location} matches preferred location "${hit}"` }; locPts = W.location / 2; }
    else { fit = { status: "mismatch", detail: `${job.location} is outside your preferred locations` }; locPts = 0; }
  }
  return { fit, wmFit, locPts, wmPts };
}

function salaryFit(job: JobInput, c: CandidateInput): { fit: MatchDetails["salaryFit"]; pts: number } {
  const neutral = W.salary / 2;
  const jMin = job.salaryMin, jMax = job.salaryMax;
  if (jMin == null && jMax == null) return { fit: { status: "unknown", detail: "Salary: Unknown (not listed)" }, pts: neutral };
  if (c.expectedSalaryMin == null && c.expectedSalaryMax == null) return { fit: { status: "unknown", detail: "You have not set expected salary" }, pts: neutral };
  if (job.salaryCurrency && c.currency && job.salaryCurrency.toUpperCase() !== c.currency.toUpperCase()) return { fit: { status: "unknown", detail: `Salary currency differs (${job.salaryCurrency} vs ${c.currency}); not compared` }, pts: neutral };
  const eMin = c.expectedSalaryMin ?? c.expectedSalaryMax!, eMax = c.expectedSalaryMax ?? c.expectedSalaryMin!;
  const lo = jMin ?? jMax!, hi = jMax ?? jMin!;
  const cur = job.salaryCurrency ?? c.currency;
  const range = `${lo.toLocaleString("en-IN")}${hi !== lo ? `–${hi.toLocaleString("en-IN")}` : ""} ${cur}/month`;
  if (hi < eMin) return { fit: { status: "below", detail: `Offer ${range} is below your expected ${eMin.toLocaleString("en-IN")}` }, pts: Math.max(0, Math.min(1, hi / eMin) - 0.5) * 2 * W.salary * 0.6 };
  if (lo > eMax) return { fit: { status: "above", detail: `Offer ${range} is above your expected range` }, pts: W.salary };
  return { fit: { status: "within", detail: `Offer ${range} overlaps your expected range` }, pts: W.salary };
}

function experienceFit(job: JobInput, c: CandidateInput): { fit: MatchDetails["experienceFit"]; pts: number } {
  const neutral = W.experience / 2;
  const min = job.experienceMin, max = job.experienceMax;
  if (min == null && max == null) return { fit: { status: "unknown", detail: "Experience required: Unknown (not listed)" }, pts: neutral };
  if (c.yearsExperience == null) return { fit: { status: "unknown", detail: "Your years of experience are not set in your profile" }, pts: neutral };
  const y = c.yearsExperience;
  const need = min ?? 0;
  const label = max != null && min != null ? `${min}–${max} yrs` : min != null ? `${min}+ yrs` : `up to ${max} yrs`;
  if (y >= need) return { fit: { status: "fits", detail: `Requires ${label}; you have ${y}` }, pts: W.experience };
  if (need - y <= 1) return { fit: { status: "stretch", detail: `Requires ${label}; you have ${y} (a stretch)` }, pts: W.experience * 0.6 };
  return { fit: { status: "below", detail: `Requires ${label}; you have ${y}` }, pts: W.experience * (need - y <= 2 ? 0.3 : 0.1) };
}

function educationFit(job: JobInput, c: CandidateInput): { fit: MatchDetails["educationFit"]; pts: number } {
  const neutral = W.education / 2;
  const text = `${job.description ?? ""}`.toLowerCase();
  const needsMasters = /\b(master'?s|m\.?tech|m\.?s\.? in|mca|mba|ph\.?d)\b/.test(text) && /(required|must|mandatory|should have|degree)/.test(text) && !/(bachelor|b\.?e\.?|b\.?tech)/.test(text);
  const needsBach = /\b(bachelor'?s?|b\.?e\.?\b|b\.?tech|b\.?sc|bca|engineering degree|computer science degree|graduate)\b/.test(text);
  if (!needsMasters && !needsBach) return { fit: { status: "unknown", detail: "No education requirement stated" }, pts: neutral };
  const edu = (c.education ?? "").toLowerCase();
  if (!edu) return { fit: { status: "unknown", detail: "Your education is not set" }, pts: neutral };
  const hasMasters = /(master|m\.?tech|mca|mba|ph\.?d|m\.?s\b)/.test(edu);
  const hasBach = hasMasters || /(bachelor|b\.?e\b|b\.?tech|b\.?sc|bca|engineering|b\.e\.)/.test(edu);
  if (needsMasters) return hasMasters ? { fit: { status: "fits", detail: "Postgraduate degree requirement met" }, pts: W.education } : { fit: { status: "below", detail: "Posting prefers a postgraduate degree" }, pts: 0 };
  return hasBach ? { fit: { status: "fits", detail: "Bachelor's requirement met" }, pts: W.education } : { fit: { status: "below", detail: "Posting expects a bachelor's degree" }, pts: 0 };
}

export function scoreMatch(c: CandidateInput, job: JobInput, thresholds: Thresholds): HeuristicMatch {
  // Skills (45): required weighted 2x optional.
  const mine = new Map(c.skills.map((s) => [normalizeSkill(s), s]));
  const seen = new Set<string>();
  const jobSkills = job.skills.filter((s) => { const n = normalizeSkill(s.name); if (seen.has(n)) return false; seen.add(n); return true; });
  const matching: string[] = [], missing: string[] = [], optMissing: string[] = [];
  let have = 0, total = 0;
  for (const s of jobSkills) {
    const w = s.required ? 2 : 1; total += w;
    if (mine.has(normalizeSkill(s.name))) { have += w; matching.push(s.name); }
    else (s.required ? missing : optMissing).push(s.name);
  }
  const skillsPts = total ? (have / total) * W.skills : W.skills / 2;

  const rel = roleRelevance(job.title, [...c.targetRoles, ...(c.currentTitle ? [c.currentTitle] : [])]);
  const rolePts = c.targetRoles.length || c.currentTitle ? rel * W.role : W.role / 2;

  const exp = experienceFit(job, c);
  const sal = salaryFit(job, c);
  const loc = locationFit(job, c);
  const edu = educationFit(job, c);

  const breakdown = { skills: skillsPts, role: rolePts, experience: exp.pts, salary: sal.pts, location: loc.locPts + loc.wmPts, education: edu.pts };
  const score = Math.max(0, Math.min(100, Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0))));

  const reasons: string[] = [];
  if (!jobSkills.length) reasons.push("Required skills are Unknown for this job; skill score is neutral.");
  if (missing.length) reasons.push(`Missing required skills: ${missing.slice(0, 6).join(", ")}`);
  if (rel < 0.4 && (c.targetRoles.length || c.currentTitle)) reasons.push(`Title "${job.title}" is not close to your target roles`);
  if (exp.fit.status === "below" || exp.fit.status === "stretch") reasons.push(exp.fit.detail);
  if (sal.fit.status === "below") reasons.push(sal.fit.detail);
  if (loc.fit.status === "mismatch") reasons.push(loc.fit.detail);
  if (loc.wmFit.status === "mismatch") reasons.push(loc.wmFit.detail);
  if (edu.fit.status === "below") reasons.push(edu.fit.detail);
  const isInternOrContract = job.jobType === "internship" || job.jobType === "contract";
  if (isInternOrContract && !c.includeInternshipsContract) reasons.push(`This is an ${job.jobType} role and you excluded internships/contract`);
  else if (job.jobType && c.jobTypes.length && !c.jobTypes.includes(job.jobType) && !isInternOrContract) reasons.push(`Job type ${job.jobType} is not in your preferred types`);

  const hardMismatch = exp.fit.status === "below" || loc.wmFit.status === "mismatch" || loc.fit.status === "mismatch" || (isInternOrContract && !c.includeInternshipsContract);
  const worthApplying = score >= thresholds.good && !hardMismatch;
  const cat = categorize(score, thresholds);

  const recommendation = worthApplying
    ? (cat === "excellent" ? "Strong match — apply and consider reaching out to the recruiter." : "Good match — worth applying.")
    : score >= thresholds.good ? "Decent skills overlap, but check the mismatches before applying." : "Low match — apply only if you are specifically interested.";
  const explanation = [
    jobSkills.length ? `Matched ${matching.length} of ${jobSkills.length} listed skills${matching.length ? ` (${matching.slice(0, 6).join(", ")})` : ""}.` : "No skills were listed for this job, so skills are scored neutrally.",
    `Role relevance ${Math.round(rel * 100)}%.`,
    exp.fit.detail + ".", sal.fit.detail + ".",
  ].join(" ");

  return {
    score, matchingSkills: matching, missingSkills: missing, optionalMissingSkills: optMissing, breakdown, recommendation, explanation,
    details: { experienceFit: exp.fit, salaryFit: sal.fit, locationFit: loc.fit, workModeFit: loc.wmFit, educationFit: edu.fit, mismatchReasons: reasons, worthApplying },
  };
}
