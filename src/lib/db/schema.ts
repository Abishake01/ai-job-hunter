import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, real, index, uniqueIndex, primaryKey, customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer | string }>({
  dataType: () => "bytea",
  toDriver: (v) => v,
  fromDriver: (v) => (typeof v === "string" ? Buffer.from(v.replace(/^\\x/, ""), "hex") : v),
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
const userFk = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

export const JOB_STATUSES = ["discovered","shortlisted","ready_to_apply","applied","cold_email_drafted","email_sent","follow_up_required","interview_scheduled","selected","rejected","not_interested"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const WORK_MODES = ["remote","hybrid","onsite"] as const;
export const JOB_TYPES = ["full_time","internship","contract","part_time"] as const;
export const VERIFICATION = ["verified","public","inferred","unknown"] as const;
export const EMAIL_KINDS = ["direct_application","recruiter_outreach","hiring_manager_intro","follow_up","general_inquiry"] as const;
export const EMAIL_STATUSES = ["draft","gmail_draft_created","approved","sent","failed"] as const;

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  googleSub: text("google_sub").unique(),
  createdAt: createdAt(),
});

export const candidateProfiles = pgTable("candidate_profiles", {
  id: id(),
  userId: userFk().unique(),
  fullName: text("full_name"),
  headline: text("headline"),
  phone: text("phone"),
  location: text("location"),
  summary: text("summary"),
  currentCompany: text("current_company"),
  currentTitle: text("current_title"),
  education: text("education"),
  graduationYear: integer("graduation_year"),
  yearsExperience: real("years_experience"),
  targetRoles: text("target_roles").array().notNull().default([]),
  workModes: text("work_modes").array().notNull().default([]),
  jobTypes: text("job_types").array().notNull().default([]),
  includeInternshipsContract: boolean("include_internships_contract").notNull().default(true),
  preferredLocations: text("preferred_locations").array().notNull().default([]),
  currentSalaryMonthly: integer("current_salary_monthly"),
  expectedSalaryMin: integer("expected_salary_min"),
  expectedSalaryMax: integer("expected_salary_max"),
  currency: text("currency").notNull().default("INR"),
  portfolioUrl: text("portfolio_url"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  aiExperience: text("ai_experience").array().notNull().default([]),
  experience: jsonb("experience").$type<{ company: string; title: string; start?: string; end?: string; description?: string }[]>().notNull().default([]),
  projects: jsonb("projects").$type<{ name: string; description?: string; tech?: string[]; url?: string }[]>().notNull().default([]),
  /** thresholds, LLM prefs, discovery config, daily workflow config. Validated by src/lib/validation/settings.ts */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const skills = pgTable("skills", {
  id: id(),
  name: text("name").notNull(),
  normalized: text("normalized").notNull().unique(),
  category: text("category"),
});

export const candidateSkills = pgTable("candidate_skills", {
  userId: userFk(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("primary"), // primary | additional | ai
}, (t) => [primaryKey({ columns: [t.userId, t.skillId] })]);

export const resumes = pgTable("resumes", {
  id: id(),
  userId: userFk(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  fileData: bytea("file_data").notNull(),
  extractedText: text("extracted_text").notNull().default(""),
  analysis: jsonb("analysis").$type<Record<string, unknown> | null>(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("resumes_user_idx").on(t.userId)]);

export const companies = pgTable("companies", {
  id: id(),
  userId: userFk(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  domain: text("domain"),
  website: text("website"),
  careersUrl: text("careers_url"),
  contactUrl: text("contact_url"),
  description: text("description"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("companies_user_name_uq").on(t.userId, t.normalizedName)]);

export const jobs = pgTable("jobs", {
  id: id(),
  userId: userFk(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  workMode: text("work_mode"),
  jobType: text("job_type"),
  salaryMin: integer("salary_min"), // monthly, in `salaryCurrency`; null = Unknown
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency"),
  salaryText: text("salary_text"),
  experienceMin: real("experience_min"),
  experienceMax: real("experience_max"),
  experienceText: text("experience_text"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  deadline: timestamp("deadline", { withTimezone: true }),
  applyUrl: text("apply_url"),
  normalizedUrl: text("normalized_url"),
  fingerprint: text("fingerprint").notNull(), // normalized company|title|location bucket
  status: text("status").$type<JobStatus>().notNull().default("discovered"),
  shortlisted: boolean("shortlisted").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  followUpDate: timestamp("follow_up_date", { withTimezone: true }),
  interview: jsonb("interview").$type<{ date?: string; mode?: string; link?: string; notes?: string } | null>(),
  notes: text("notes"),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("jobs_user_fingerprint_uq").on(t.userId, t.fingerprint),
  index("jobs_user_url_idx").on(t.userId, t.normalizedUrl),
  index("jobs_user_status_idx").on(t.userId, t.status),
  index("jobs_user_posted_idx").on(t.userId, t.postedAt),
  index("jobs_company_idx").on(t.companyId),
]);

export const jobSkills = pgTable("job_skills", {
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(true),
}, (t) => [primaryKey({ columns: [t.jobId, t.skillId] })]);

/** Provenance: every place a job was seen. */
export const jobSources = pgTable("job_sources", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // adapter key
  platform: text("platform"),
  sourceJobId: text("source_job_id").notNull(),
  sourceUrl: text("source_url"),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("job_sources_uq").on(t.userId, t.source, t.sourceJobId)]);

export const sourceHealth = pgTable("source_health", {
  id: id(),
  userId: userFk(),
  source: text("source").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastStatus: text("last_status"), // ok | error | skipped
  lastError: text("last_error"),
  lastFetched: integer("last_fetched"),
  lastNew: integer("last_new"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
}, (t) => [uniqueIndex("source_health_uq").on(t.userId, t.source)]);

export const recruiters = pgTable("recruiters", {
  id: id(),
  userId: userFk(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  name: text("name"),
  designation: text("designation"),
  email: text("email"),
  profileUrl: text("profile_url"),
  verification: text("verification").notNull().default("unknown"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  doNotContact: boolean("do_not_contact").notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [
  index("recruiters_user_company_idx").on(t.userId, t.companyId),
  uniqueIndex("recruiters_user_company_email_uq").on(t.userId, t.companyId, t.email),
]);

export const recruiterSources = pgTable("recruiter_sources", {
  id: id(),
  recruiterId: uuid("recruiter_id").notNull().references(() => recruiters.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  sourceType: text("source_type").notNull(), // job_ad | company_site | gmail | public_profile | manual | pattern
  note: text("note"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobMatches = pgTable("job_matches", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  matchingSkills: jsonb("matching_skills").$type<string[]>().notNull().default([]),
  missingSkills: jsonb("missing_skills").$type<string[]>().notNull().default([]),
  optionalMissingSkills: jsonb("optional_missing_skills").$type<string[]>().notNull().default([]),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), // experienceFit, salaryFit, locationFit, workModeFit, educationFit, mismatchReasons, worthApplying
  recommendation: text("recommendation"),
  explanation: text("explanation"),
  recommendedResumeId: uuid("recommended_resume_id").references(() => resumes.id, { onDelete: "set null" }),
  engine: text("engine").notNull(), // llm | heuristic
  model: text("model"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("job_matches_uq").on(t.userId, t.jobId), index("job_matches_score_idx").on(t.userId, t.score)]);

export const applications = pgTable("applications", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  method: text("method"), // company_site | email | portal | referral | other
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("applications_uq").on(t.userId, t.jobId)]);

export const emailOutreach = pgTable("email_outreach", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  recruiterId: uuid("recruiter_id").references(() => recruiters.id, { onDelete: "set null" }),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  toEmail: text("to_email"),
  toName: text("to_name"),
  status: text("status").notNull().default("draft"),
  engine: text("engine").notNull().default("template"), // llm | template
  model: text("model"),
  gmailDraftId: text("gmail_draft_id"),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  /** Set ONLY when sent: `${jobId}|${kind}|${lower(toEmail)}`; unique => duplicate-send protection at DB level. */
  sentKey: text("sent_key"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("email_outreach_sent_key_uq").on(t.userId, t.sentKey), index("email_outreach_user_status_idx").on(t.userId, t.status)]);

export const unsubscribes = pgTable("unsubscribes", {
  id: id(),
  userId: userFk(),
  email: text("email").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("unsubscribes_uq").on(t.userId, t.email)]);

/** Classified email METADATA only (no raw bodies stored). */
export const emailConversations = pgTable("email_conversations", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  gmailMessageId: text("gmail_message_id").notNull(),
  gmailThreadId: text("gmail_thread_id"),
  category: text("category").notNull(), // job_alert | recruiter_message | interview_invite | application_ack | rejection | selection | follow_up
  subject: text("subject"),
  fromAddress: text("from_address"),
  snippet: text("snippet"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  extracted: jsonb("extracted").$type<{ company?: string; title?: string; links?: string[]; recruiter?: { name?: string; email?: string; designation?: string } }>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("email_conv_uq").on(t.userId, t.gmailMessageId), index("email_conv_thread_idx").on(t.userId, t.gmailThreadId)]);

export const gmailSyncHistory = pgTable("gmail_sync_history", {
  id: id(),
  userId: userFk(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running | ok | error
  scanned: integer("scanned").notNull().default(0),
  relevant: integer("relevant").notNull().default(0),
  jobsCreated: integer("jobs_created").notNull().default(0),
  error: text("error"),
});

export const savedSearches = pgTable("saved_searches", {
  id: id(),
  userId: userFk(),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const followUps = pgTable("follow_ups", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  outreachId: uuid("outreach_id").references(() => emailOutreach.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"), // pending | done | dismissed
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("follow_ups_user_due_idx").on(t.userId, t.status, t.dueAt)]);

export const agentTasks = pgTable("agent_tasks", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // discover_jobs | sync_gmail | daily_workflow | match_jobs | find_contacts ...
  status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | cancelled
  idempotencyKey: text("idempotency_key"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  steps: jsonb("steps").$type<{ name: string; status: string; detail?: string; at: string }[]>().notNull().default([]),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("agent_tasks_idem_uq").on(t.idempotencyKey), index("agent_tasks_user_idx").on(t.userId, t.createdAt)]);

export const userIntegrations = pgTable("user_integrations", {
  id: id(),
  userId: userFk(),
  provider: text("provider").notNull(), // gmail | openai | anthropic | llm_custom | adzuna | jooble | hunter | zerobounce
  accountEmail: text("account_email"),
  /** AES-256-GCM encrypted JSON (tokens / api keys). Never returned to clients. */
  secretsEnc: text("secrets_enc"),
  scopes: text("scopes").array().notNull().default([]),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}), // non-secret (model, base_url, app_id)
  status: text("status").notNull().default("connected"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("user_integrations_uq").on(t.userId, t.provider)]);

/** Timeline of every interaction. */
export const activityLog = pgTable("activity_log", {
  id: id(),
  userId: userFk(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // discovered|status|match|contact|email_draft|email_sent|email_received|applied|note|interview|follow_up
  title: text("title").notNull(),
  detail: text("detail"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("activity_job_idx").on(t.userId, t.jobId, t.createdAt)]);

export const dailyReports = pgTable("daily_reports", {
  id: id(),
  userId: userFk(),
  reportDate: text("report_date").notNull(), // YYYY-MM-DD
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  summaryText: text("summary_text"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("daily_reports_uq").on(t.userId, t.reportDate)]);
