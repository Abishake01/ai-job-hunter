import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateProfiles } from "@/lib/db/schema";
import { settingsSchema, type Settings } from "@/lib/validation/settings";

export const DEFAULT_PROFILE = {
  currentCompany: "TruConsent",
  currentTitle: "Associate Software Engineer",
  education: "B.E. Computer Science and Engineering",
  graduationYear: 2026,
  targetRoles: ["Full Stack Developer", "Python Developer", "AI Developer", "Backend Developer", "Software Engineer"],
  workModes: ["remote", "hybrid", "onsite"],
  jobTypes: ["full_time"],
  preferredLocations: ["India", "Remote"],
  currentSalaryMonthly: 30000,
  expectedSalaryMin: 45000,
  expectedSalaryMax: 60000,
  aiExperience: ["AI integrations", "LLM APIs", "AI-powered application development"],
};
export const DEFAULT_PRIMARY_SKILLS = ["Python", "FastAPI", "Django", "React.js", "TypeScript", "JavaScript", "HTML", "CSS"];
export const DEFAULT_ADDITIONAL_SKILLS = ["PostgreSQL", "MySQL", "MongoDB", "AWS", "AWS Lambda", "REST APIs", "React Native", "Git", "GitHub"];

export async function getProfile(userId: string) {
  const [p] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId));
  return p ?? null;
}
export async function getSettings(userId: string): Promise<Settings> {
  const p = await getProfile(userId);
  return settingsSchema.parse(p?.settings ?? {});
}
