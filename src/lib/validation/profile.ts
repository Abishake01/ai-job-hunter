import { z } from "zod";
import { WORK_MODES, JOB_TYPES } from "@/lib/db/schema";

const str = (max = 200) => z.string().trim().max(max).transform((s) => (s === "" ? null : s)).nullable().optional();
const url = z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\/\S+\.\S+/i.test(v), "Must be a valid http(s) URL").transform((v) => (v === "" ? null : v)).nullable().optional();
const strArr = (max = 60) => z.array(z.string().trim().min(1).max(max)).max(60);
const money = z.number().int().min(0).max(100_000_000).nullable().optional();

export const profileSchema = z.object({
  fullName: str(120), headline: str(200), phone: str(40), location: str(120), summary: str(3000),
  currentCompany: str(120), currentTitle: str(120), education: str(200),
  graduationYear: z.number().int().min(1970).max(2100).nullable().optional(),
  yearsExperience: z.number().min(0).max(60).nullable().optional(),
  targetRoles: strArr(80).optional(),
  workModes: z.array(z.enum(WORK_MODES)).optional(),
  jobTypes: z.array(z.enum(JOB_TYPES)).optional(),
  includeInternshipsContract: z.boolean().optional(),
  preferredLocations: strArr(80).optional(),
  currentSalaryMonthly: money, expectedSalaryMin: money, expectedSalaryMax: money,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  portfolioUrl: url, linkedinUrl: url, githubUrl: url,
  aiExperience: strArr(120).optional(),
  experience: z.array(z.object({
    company: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(120),
    start: z.string().trim().max(30).optional(), end: z.string().trim().max(30).optional(), description: z.string().trim().max(2000).optional(),
  })).max(30).optional(),
  projects: z.array(z.object({
    name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional(),
    tech: z.array(z.string().trim().min(1).max(40)).max(30).optional(), url: z.string().trim().max(300).optional(),
  })).max(30).optional(),
  skills: z.object({ primary: strArr(60), additional: strArr(60) }).optional(),
}).refine((v) => v.expectedSalaryMin == null || v.expectedSalaryMax == null || v.expectedSalaryMin <= v.expectedSalaryMax, { message: "Expected salary min must be ≤ max", path: ["expectedSalaryMax"] });

export type ProfileInput = z.infer<typeof profileSchema>;
