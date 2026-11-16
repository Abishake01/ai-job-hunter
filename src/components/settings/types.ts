export type ProfileView = {
  profile: {
    fullName: string | null; headline: string | null; phone: string | null; location: string | null; summary: string | null;
    currentCompany: string | null; currentTitle: string | null; education: string | null; graduationYear: number | null; yearsExperience: number | null;
    targetRoles: string[]; workModes: string[]; jobTypes: string[]; includeInternshipsContract: boolean; preferredLocations: string[];
    currentSalaryMonthly: number | null; expectedSalaryMin: number | null; expectedSalaryMax: number | null; currency: string;
    portfolioUrl: string | null; linkedinUrl: string | null; githubUrl: string | null; aiExperience: string[];
    experience: { company: string; title: string; start?: string; end?: string; description?: string }[];
    projects: { name: string; description?: string; tech?: string[]; url?: string }[];
  };
  skills: { primary: string[]; additional: string[]; ai: string[] };
};

export type SettingsData = {
  thresholds: { excellent: number; good: number };
  llm: { provider: "openai" | "anthropic" | "openai_compatible"; model: string; baseUrl: string | null };
  discovery: Record<string, unknown>;
  dailyWorkflow: { enabled: boolean; hour: number; minute: number; timezone: string; steps: { fetchJobs: boolean; processGmail: boolean; match: boolean; findContacts: boolean; draftEmails: boolean }; minScoreForContacts: number; minScoreForDrafts: number };
  emailVerification: { provider: "none" | "hunter" | "zerobounce" };
  followUpBusinessDays: number;
  unsubscribeFooter: string;
};
