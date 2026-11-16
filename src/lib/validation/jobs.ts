import { z } from "zod";
import { JOB_STATUSES, JOB_TYPES, WORK_MODES } from "@/lib/db/schema";

const num = z.coerce.number();
const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const opt = <T extends z.ZodType>(s: T) => s.optional();

export const jobFiltersSchema = z.object({
  q: opt(z.string().max(200)), company: opt(z.string().max(200)), location: opt(z.string().max(200)), source: opt(z.string().max(50)),
  status: opt(z.enum(JOB_STATUSES)), workMode: opt(z.enum(WORK_MODES)), jobType: opt(z.enum(JOB_TYPES)),
  minScore: opt(num.min(0).max(100)), maxScore: opt(num.min(0).max(100)), category: opt(z.enum(["excellent", "good", "low"])),
  minSalary: opt(num.min(0)), maxSalary: opt(num.min(0)), maxExperience: opt(num.min(0)),
  postedAfter: opt(z.string().max(40)), postedBefore: opt(z.string().max(40)),
  shortlisted: opt(bool), active: opt(bool), fullTimeOnly: opt(bool),
  sort: opt(z.enum(["newest", "oldest", "score", "salary", "company"])),
  page: opt(num.int().min(1)), pageSize: opt(num.int().min(1).max(100)),
});

const nullableStr = z.string().trim().max(200).nullish().transform((v) => (v ? v : null));
const nn = (m: number) => z.number().min(0).max(m).nullish().transform((v) => v ?? null);
const dateStr = z.string().max(40).nullish().transform((v) => (v ? v : null)).refine((v) => v === null || !isNaN(Date.parse(v)), "Invalid date");

export const jobInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(200),
  description: z.string().max(60000).nullish().transform((v) => v?.trim() || null),
  location: nullableStr,
  workMode: z.enum(WORK_MODES).nullish().transform((v) => v ?? null),
  jobType: z.enum(JOB_TYPES).nullish().transform((v) => v ?? null),
  salaryMin: nn(10_000_000), salaryMax: nn(10_000_000),
  salaryCurrency: z.string().trim().max(5).nullish().transform((v) => (v ? v.toUpperCase() : null)),
  salaryText: nullableStr,
  experienceMin: nn(60), experienceMax: nn(60), experienceText: nullableStr,
  postedAt: dateStr, deadline: dateStr,
  applyUrl: z.string().trim().url().max(2000).nullish().transform((v) => v ?? null),
  platform: z.string().trim().max(30).nullish().transform((v) => v || null),
  skills: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  notes: z.string().max(10000).nullish().transform((v) => v ?? null),
});
export type JobInput = z.infer<typeof jobInputSchema>;

export const jobPatchSchema = z.object({
  title: z.string().trim().min(1).max(300), description: z.string().max(60000).nullable(), location: nullableStr,
  workMode: z.enum(WORK_MODES).nullable(), jobType: z.enum(JOB_TYPES).nullable(),
  salaryMin: nn(10_000_000), salaryMax: nn(10_000_000), salaryCurrency: z.string().trim().max(5).nullable(), salaryText: nullableStr,
  experienceMin: nn(60), experienceMax: nn(60), experienceText: nullableStr,
  postedAt: dateStr, deadline: dateStr, applyUrl: z.string().trim().url().max(2000).nullable(), notes: z.string().max(10000).nullable(),
}).partial().strict();

export const savedSearchSchema = z.object({ name: z.string().trim().min(1).max(80), filters: z.record(z.string(), z.unknown()) });
