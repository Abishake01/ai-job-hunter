import "server-only";
import { computeCompleteness, type Completeness } from "@/lib/profile/completeness";
import { getProfile } from "@/lib/services/profile.service";
import { getCandidateSkills } from "@/lib/services/settings.service";
import { listResumes } from "@/lib/services/resume.service";

export async function getProfileCompleteness(userId: string): Promise<Completeness> {
  const [p, sk, resumes] = await Promise.all([getProfile(userId), getCandidateSkills(userId), listResumes(userId)]);
  return computeCompleteness({
    fullName: p?.fullName, phone: p?.phone, headline: p?.headline, summary: p?.summary, location: p?.location, education: p?.education,
    yearsExperience: p?.yearsExperience, targetRoles: p?.targetRoles, preferredLocations: p?.preferredLocations, workModes: p?.workModes,
    expectedSalaryMin: p?.expectedSalaryMin, linkedinUrl: p?.linkedinUrl, githubUrl: p?.githubUrl, portfolioUrl: p?.portfolioUrl,
    primarySkills: sk.primary, experienceCount: p?.experience?.length ?? 0, projectCount: p?.projects?.length ?? 0, hasResume: resumes.length > 0,
  });
}
