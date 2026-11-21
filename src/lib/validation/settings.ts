import { z } from "zod";

export const settingsSchema = z.object({
  thresholds: z.object({ excellent: z.number().int().min(1).max(100).default(80), good: z.number().int().min(1).max(100).default(60) }).default({ excellent: 80, good: 60 }),
  llm: z.object({
    provider: z.enum(["openai", "groq", "anthropic", "openai_compatible"]).default("openai"),
    model: z.string().default("gpt-4o-mini"),
    baseUrl: z.string().url().nullable().default(null),
  }).default({ provider: "openai", model: "gpt-4o-mini", baseUrl: null }),
  discovery: z.object({
    enabledSources: z.array(z.string()).default(["remotive", "remoteok", "himalayas", "jobicy", "weworkremotely", "greenhouse", "lever", "ashby", "adzuna", "jooble", "rss"]),
    /** Sources switched off explicitly. Newly added key-less sources are on by default unless listed here. */
    disabledSources: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    country: z.string().default("in"),
    companyBoards: z.array(z.object({ ats: z.enum(["greenhouse", "lever", "ashby"]), slug: z.string().min(1), name: z.string().optional() })).default([]),
    rssFeeds: z.array(z.object({ name: z.string(), url: z.string().url() })).default([]),
    maxAgeDays: z.number().int().min(1).max(90).default(30),
    /** Outside India keep only remote roles; inside India keep remote + hybrid + on-site. */
    abroadRemoteOnly: z.boolean().default(true),
    /** Also scan the built-in list of company career boards that hire in India. */
    useCuratedBoards: z.boolean().default(true),
  }).default({ enabledSources: ["remotive", "remoteok", "himalayas", "jobicy", "weworkremotely", "greenhouse", "lever", "ashby", "adzuna", "jooble", "rss"], disabledSources: [], keywords: [], country: "in", companyBoards: [], rssFeeds: [], maxAgeDays: 30, abroadRemoteOnly: true, useCuratedBoards: true }),
  dailyWorkflow: z.object({
    enabled: z.boolean().default(false),
    hour: z.number().int().min(0).max(23).default(9),
    minute: z.number().int().min(0).max(59).default(0),
    timezone: z.string().default("Asia/Kolkata"),
    steps: z.object({
      fetchJobs: z.boolean().default(true), processGmail: z.boolean().default(true), match: z.boolean().default(true),
      findContacts: z.boolean().default(true), draftEmails: z.boolean().default(true),
    }).default({ fetchJobs: true, processGmail: true, match: true, findContacts: true, draftEmails: true }),
    minScoreForContacts: z.number().int().default(70),
    minScoreForDrafts: z.number().int().default(80),
  }).default({ enabled: false, hour: 9, minute: 0, timezone: "Asia/Kolkata", steps: { fetchJobs: true, processGmail: true, match: true, findContacts: true, draftEmails: true }, minScoreForContacts: 70, minScoreForDrafts: 80 }),
  /** Opt-in auto-apply (emails your application from your Gmail). Only runs at 100% profile completeness. */
  autoApply: z.object({
    enabled: z.boolean().default(false),
    minScore: z.number().int().min(50).max(100).default(75),
    dailyCap: z.number().int().min(1).max(30).default(10),
    kinds: z.array(z.enum(["direct_application", "recruiter_outreach"])).default(["direct_application", "recruiter_outreach"]),
  }).default({ enabled: false, minScore: 75, dailyCap: 10, kinds: ["direct_application", "recruiter_outreach"] }),
  emailVerification: z.object({ provider: z.enum(["none", "hunter", "zerobounce"]).default("none") }).default({ provider: "none" }),
  followUpBusinessDays: z.number().int().min(1).max(30).default(5),
  unsubscribeFooter: z.string().default("If you'd rather not hear from me, just reply \"unsubscribe\" and I won't contact you again."),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = (): Settings => settingsSchema.parse({});
