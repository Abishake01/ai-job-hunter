/** Pure profile-completeness scoring (client/server safe). Auto-apply is only allowed at 100%. */
export type CompletenessInput = {
  fullName?: string | null; phone?: string | null; headline?: string | null; summary?: string | null; location?: string | null;
  education?: string | null; yearsExperience?: number | null; targetRoles?: string[]; preferredLocations?: string[]; workModes?: string[];
  expectedSalaryMin?: number | null; linkedinUrl?: string | null; githubUrl?: string | null; portfolioUrl?: string | null;
  primarySkills?: string[]; experienceCount?: number; projectCount?: number; hasResume?: boolean;
};
export type CompletenessItem = { key: string; label: string; done: boolean; tab: "profile" | "resume"; /** DOM id of the field to jump to */ fieldId: string; /** What to enter */ hint: string };
export type Completeness = { percent: number; complete: boolean; missing: CompletenessItem[]; items: CompletenessItem[] };

const has = (s?: string | null) => !!s && s.trim().length > 0;

export function computeCompleteness(p: CompletenessInput): Completeness {
  const items: CompletenessItem[] = [
    { key: "fullName", label: "Full name", done: has(p.fullName), tab: "profile", fieldId: "fullName", hint: "Your name as it should appear on applications, e.g. \"Abishake T\"." },
    { key: "phone", label: "Phone number", done: has(p.phone), tab: "profile", fieldId: "phone", hint: "Mobile number recruiters can call, e.g. 7305707379." },
    { key: "headline", label: "Headline", done: has(p.headline), tab: "profile", fieldId: "headline", hint: "One line about you, e.g. \"Full-stack engineer (Python, React)\"." },
    { key: "summary", label: "Professional summary", done: has(p.summary), tab: "profile", fieldId: "summary", hint: "2–3 sentences: who you are, what you build, what role you want." },
    { key: "location", label: "Current location", done: has(p.location), tab: "profile", fieldId: "location", hint: "City you live in, e.g. \"Chennai, India\"." },
    { key: "education", label: "Education", done: has(p.education), tab: "profile", fieldId: "education", hint: "Degree, e.g. \"B.E. Computer Science and Engineering\"." },
    { key: "yearsExperience", label: "Years of experience", done: p.yearsExperience != null, tab: "profile", fieldId: "yearsExperience", hint: "Total experience as a number, e.g. 0.8 for 10 months (0 if fresher)." },
    { key: "targetRoles", label: "At least one target role", done: (p.targetRoles?.length ?? 0) > 0, tab: "profile", fieldId: "targetRoles-input", hint: "Job titles you want, e.g. \"Backend Developer\", \"Python Developer\". Drives job search." },
    { key: "skills", label: "At least 3 primary skills", done: (p.primarySkills?.length ?? 0) >= 3, tab: "profile", fieldId: "primary-input", hint: "Your top skills, e.g. Python, FastAPI, React. Press Enter after each." },
    { key: "preferredLocations", label: "Preferred locations", done: (p.preferredLocations?.length ?? 0) > 0, tab: "profile", fieldId: "preferredLocations-input", hint: "Where you want to work, e.g. Chennai, Bengaluru, Remote." },
    { key: "workModes", label: "Work modes", done: (p.workModes?.length ?? 0) > 0, tab: "profile", fieldId: "workModes-group", hint: "Tap Remote / Hybrid / On-site (one or more)." },
    { key: "salary", label: "Expected salary", done: p.expectedSalaryMin != null, tab: "profile", fieldId: "expectedSalaryMin", hint: "Expected monthly salary (minimum), e.g. 45000." },
    { key: "links", label: "LinkedIn, GitHub or portfolio link", done: has(p.linkedinUrl) || has(p.githubUrl) || has(p.portfolioUrl), tab: "profile", fieldId: "linkedinUrl", hint: "Add at least one: LinkedIn, GitHub or portfolio link." },
    { key: "experienceOrProject", label: "At least one experience or project", done: (p.experienceCount ?? 0) + (p.projectCount ?? 0) > 0, tab: "profile", fieldId: "add-experience", hint: "Add your current job under Experience, or a project under Projects." },
    { key: "resume", label: "Upload a resume", done: !!p.hasResume, tab: "resume", fieldId: "/resume", hint: "Upload your resume PDF in Resume Manager." },
  ];
  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, complete: done === items.length, missing: items.filter((i) => !i.done), items };
}
