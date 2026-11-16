/** Client-safe types shared by job services, API routes and UI. */
export type MatchCategoryName = "excellent" | "good" | "low";

export interface JobFilters {
  q?: string; company?: string; location?: string; source?: string; status?: string;
  workMode?: string; jobType?: string;
  minScore?: number; maxScore?: number; category?: MatchCategoryName;
  minSalary?: number; maxSalary?: number; maxExperience?: number;
  postedAfter?: string; postedBefore?: string;
  shortlisted?: boolean; active?: boolean;
  /** true => only full_time (and unknown-type) jobs; false/undefined => all types */
  fullTimeOnly?: boolean;
  sort?: "newest" | "oldest" | "score" | "salary" | "company";
  page?: number; pageSize?: number;
}

export interface JobListItem {
  id: string; title: string; companyId: string; companyName: string;
  location: string | null; workMode: string | null; jobType: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryText: string | null;
  experienceMin: number | null; experienceMax: number | null; experienceText: string | null;
  postedAt: string | null; discoveredAt: string; applyUrl: string | null;
  status: string; shortlisted: boolean; isActive: boolean; expiredAt: string | null;
  matchScore: number | null; matchCategory: MatchCategoryName | null; contactCount: number;
  sources: string[];
}

export interface JobSearchResult { items: JobListItem[]; total: number; page: number; pageSize: number }

export interface JobDetailData {
  job: {
    id: string; title: string; description: string | null; location: string | null; workMode: string | null; jobType: string | null;
    salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryText: string | null;
    experienceMin: number | null; experienceMax: number | null; experienceText: string | null;
    postedAt: string | null; deadline: string | null; applyUrl: string | null; status: string; shortlisted: boolean;
    isActive: boolean; expiredAt: string | null; lastCheckedAt: string | null; followUpDate: string | null;
    interview: { date?: string; mode?: string; link?: string; notes?: string } | null; notes: string | null; discoveredAt: string;
  };
  company: { id: string; name: string; domain: string | null; website: string | null; careersUrl: string | null; contactUrl: string | null };
  skills: { name: string; required: boolean }[];
  provenance: { source: string; platform: string | null; sourceJobId: string; sourceUrl: string | null; discoveredAt: string }[];
  match: null | {
    score: number; category: MatchCategoryName; matchingSkills: string[]; missingSkills: string[]; optionalMissingSkills: string[];
    details: Record<string, unknown>; recommendation: string | null; explanation: string | null; recommendedResumeId: string | null; engine: string; model: string | null;
  };
  contacts: { id: string; name: string | null; designation: string | null; email: string | null; profileUrl: string | null; verification: string; doNotContact: boolean }[];
  emails: { id: string; kind: string; subject: string; status: string; toEmail: string | null; createdAt: string; sentAt: string | null }[];
  conversations: { id: string; category: string; subject: string | null; fromAddress: string | null; receivedAt: string | null }[];
  timeline: { id: string; kind: string; title: string; detail: string | null; createdAt: string }[];
  application: { id: string; method: string | null; appliedAt: string; notes: string | null } | null;
  thresholds: { excellent: number; good: number };
}

export interface SourceInfo {
  key: string; label: string; kind: string; needs: string | null; website: string | null; compliance: string;
  runnable: boolean; enabled: boolean; configured: boolean; configNote: string | null;
  health: null | { lastRunAt: string | null; lastSuccessAt: string | null; lastStatus: string | null; lastError: string | null; lastFetched: number | null; lastNew: number | null; consecutiveFailures: number };
}

export const WORK_MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
export const JOB_TYPE_LABEL: Record<string, string> = { full_time: "Full-time", internship: "Internship", contract: "Contract", part_time: "Part-time" };

export function formatSalary(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryText: string | null }): string {
  if (j.salaryMin === null && j.salaryMax === null) return j.salaryText ? `${j.salaryText} (unparsed)` : "Unknown";
  const cur = j.salaryCurrency ?? "";
  const fmt = (n: number) => (cur === "INR" ? n.toLocaleString("en-IN") : n.toLocaleString("en-US"));
  const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : cur ? cur + " " : "";
  const lo = j.salaryMin ?? j.salaryMax!, hi = j.salaryMax ?? j.salaryMin!;
  return `${sym}${fmt(lo)}${hi !== lo ? `–${fmt(hi)}` : ""}/mo`;
}
export function formatExperience(j: { experienceMin: number | null; experienceMax: number | null; experienceText: string | null }): string {
  if (j.experienceMin === null && j.experienceMax === null) return "Unknown";
  if (j.experienceMin === 0 && j.experienceMax === null) return "Fresher / entry-level";
  if (j.experienceMax !== null && j.experienceMax !== j.experienceMin) return `${j.experienceMin ?? 0}–${j.experienceMax} yrs`;
  if (j.experienceMax !== null) return `${j.experienceMax} yrs`;
  return `${j.experienceMin}+ yrs`;
}
