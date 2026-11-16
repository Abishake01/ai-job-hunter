CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"method" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resume_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text,
	"headline" text,
	"phone" text,
	"location" text,
	"summary" text,
	"current_company" text,
	"current_title" text,
	"education" text,
	"graduation_year" integer,
	"years_experience" real,
	"target_roles" text[] DEFAULT '{}' NOT NULL,
	"work_modes" text[] DEFAULT '{}' NOT NULL,
	"job_types" text[] DEFAULT '{}' NOT NULL,
	"include_internships_contract" boolean DEFAULT true NOT NULL,
	"preferred_locations" text[] DEFAULT '{}' NOT NULL,
	"current_salary_monthly" integer,
	"expected_salary_min" integer,
	"expected_salary_max" integer,
	"currency" text DEFAULT 'INR' NOT NULL,
	"portfolio_url" text,
	"linkedin_url" text,
	"github_url" text,
	"ai_experience" text[] DEFAULT '{}' NOT NULL,
	"experience" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" text DEFAULT 'primary' NOT NULL,
	CONSTRAINT "candidate_skills_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"website" text,
	"careers_url" text,
	"contact_url" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"report_date" text NOT NULL,
	"data" jsonb NOT NULL,
	"summary_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"company_id" uuid,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text,
	"category" text NOT NULL,
	"subject" text,
	"from_address" text,
	"snippet" text,
	"received_at" timestamp with time zone,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"recruiter_id" uuid,
	"resume_id" uuid,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"to_email" text,
	"to_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"engine" text DEFAULT 'template' NOT NULL,
	"model" text,
	"gmail_draft_id" text,
	"gmail_message_id" text,
	"gmail_thread_id" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_key" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"outreach_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_sync_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"scanned" integer DEFAULT 0 NOT NULL,
	"relevant" integer DEFAULT 0 NOT NULL,
	"jobs_created" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"matching_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"optional_missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation" text,
	"explanation" text,
	"recommended_resume_id" uuid,
	"engine" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_skills" (
	"job_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "job_skills_job_id_skill_id_pk" PRIMARY KEY("job_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"source" text NOT NULL,
	"platform" text,
	"source_job_id" text NOT NULL,
	"source_url" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"work_mode" text,
	"job_type" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_text" text,
	"experience_min" real,
	"experience_max" real,
	"experience_text" text,
	"posted_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"apply_url" text,
	"normalized_url" text,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"shortlisted" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expired_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"follow_up_date" timestamp with time zone,
	"interview" jsonb,
	"notes" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiter_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruiter_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"source_type" text NOT NULL,
	"note" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid,
	"name" text,
	"designation" text,
	"email" text,
	"profile_url" text,
	"verification" text DEFAULT 'unknown' NOT NULL,
	"verified_at" timestamp with time zone,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"file_data" "bytea" NOT NULL,
	"extracted_text" text DEFAULT '' NOT NULL,
	"analysis" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized" text NOT NULL,
	"category" text,
	CONSTRAINT "skills_normalized_unique" UNIQUE("normalized")
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"last_fetched" integer,
	"last_new" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_email" text,
	"secrets_enc" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"google_sub" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_conversations" ADD CONSTRAINT "email_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outreach" ADD CONSTRAINT "email_outreach_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outreach" ADD CONSTRAINT "email_outreach_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outreach" ADD CONSTRAINT "email_outreach_recruiter_id_recruiters_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outreach" ADD CONSTRAINT "email_outreach_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_outreach_id_email_outreach_id_fk" FOREIGN KEY ("outreach_id") REFERENCES "public"."email_outreach"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_sync_history" ADD CONSTRAINT "gmail_sync_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_recommended_resume_id_resumes_id_fk" FOREIGN KEY ("recommended_resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_sources" ADD CONSTRAINT "recruiter_sources_recruiter_id_recruiters_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiters" ADD CONSTRAINT "recruiters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiters" ADD CONSTRAINT "recruiters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiters" ADD CONSTRAINT "recruiters_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_health" ADD CONSTRAINT "source_health_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_job_idx" ON "activity_log" USING btree ("user_id","job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_idem_uq" ON "agent_tasks" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_tasks_user_idx" ON "agent_tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_uq" ON "applications" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_user_name_uq" ON "companies" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reports_uq" ON "daily_reports" USING btree ("user_id","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "email_conv_uq" ON "email_conversations" USING btree ("user_id","gmail_message_id");--> statement-breakpoint
CREATE INDEX "email_conv_thread_idx" ON "email_conversations" USING btree ("user_id","gmail_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outreach_sent_key_uq" ON "email_outreach" USING btree ("user_id","sent_key");--> statement-breakpoint
CREATE INDEX "email_outreach_user_status_idx" ON "email_outreach" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "follow_ups_user_due_idx" ON "follow_ups" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_matches_uq" ON "job_matches" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "job_matches_score_idx" ON "job_matches" USING btree ("user_id","score");--> statement-breakpoint
CREATE UNIQUE INDEX "job_sources_uq" ON "job_sources" USING btree ("user_id","source","source_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_fingerprint_uq" ON "jobs" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "jobs_user_url_idx" ON "jobs" USING btree ("user_id","normalized_url");--> statement-breakpoint
CREATE INDEX "jobs_user_status_idx" ON "jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "jobs_user_posted_idx" ON "jobs" USING btree ("user_id","posted_at");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "recruiters_user_company_idx" ON "recruiters" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiters_user_company_email_uq" ON "recruiters" USING btree ("user_id","company_id","email");--> statement-breakpoint
CREATE INDEX "resumes_user_idx" ON "resumes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_health_uq" ON "source_health" USING btree ("user_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "unsubscribes_uq" ON "unsubscribes" USING btree ("user_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_integrations_uq" ON "user_integrations" USING btree ("user_id","provider");