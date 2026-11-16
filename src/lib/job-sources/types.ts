export type WorkMode = "remote" | "hybrid" | "onsite";
export type JobType = "full_time" | "internship" | "contract" | "part_time";

/** Canonical job shape produced by every adapter. Unknown data is `null` (never invented). Salary is MONTHLY in `salaryCurrency`. */
export interface NormalizedJob {
  title: string;
  company: string;
  description: string | null;
  requiredSkills: string[];
  optionalSkills?: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  experienceText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryText: string | null;
  location: string | null;
  workMode: WorkMode | null;
  jobType: JobType | null;
  postedAt: Date | null;
  deadline?: Date | null;
  applyUrl: string | null;
  source: string;
  sourceJobId: string;
  sourceUrl: string | null;
  discoveredAt: Date;
}

export interface BoardRef { ats: "greenhouse" | "lever" | "ashby"; slug: string; name?: string }
export interface RssFeedRef { name: string; url: string }

export interface SourceContext {
  keywords: string[];
  country: string;
  maxAgeDays: number;
  boards: BoardRef[];
  rssFeeds: RssFeedRef[];
  credentials: { adzuna?: { appId: string; appKey: string }; jooble?: { apiKey: string } };
}

export interface AdapterResult {
  jobs: NormalizedJob[];
  /** For ATS boards: slug -> true when the full board listing was fetched successfully (enables "no longer listed" detection). */
  completeBoards?: string[];
  /** All sourceJobIds present on those boards (unfiltered), used for "no longer listed" detection. */
  listedIds?: string[];
  /** Soft per-board errors (the run continues). */
  errors?: string[];
}

export type SourceKind = "api" | "ats" | "rss" | "gmail-alert" | "manual";

export interface SourceDef {
  key: string;
  label: string;
  kind: SourceKind;
  /** Needs the user to supply a key / board list / feed list before it can run. */
  needs?: "apiKey" | "boards" | "feeds";
  website?: string;
  /** Plain-language explanation of how the source is accessed (or why direct access is not done). */
  compliance: string;
  fetch?: (ctx: SourceContext) => Promise<AdapterResult>;
}
