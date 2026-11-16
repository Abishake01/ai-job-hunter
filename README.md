# AI Job Hunter

A personal, AI-assisted job-search and outreach workspace. It discovers jobs from compliant sources, scores each one against **your** profile, finds publicly listed recruiter contacts, drafts personalised emails, and tracks every application — while **you stay in control**: nothing is ever emailed or applied to automatically.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Neon Postgres + Drizzle ORM · Auth.js (Google) · Gmail API · Recharts**. There is no separate backend: Route Handlers, Server Components and service modules run inside Next.js.

> Multi-user: every person who signs in gets a fully isolated workspace (their own profile, resume, jobs, contacts, emails, Gmail connection and AI key).

---

## Table of contents
1. [What it does](#what-it-does)
2. [Safety rules built into the app](#safety-rules-built-into-the-app)
3. [Quick start (local)](#quick-start-local)
4. [Getting each credential](#getting-each-credential)
5. [Using the app: first-time walkthrough](#using-the-app-first-time-walkthrough)
6. [How the daily workflow works](#how-the-daily-workflow-works)
7. [Where jobs come from (and why not LinkedIn/Naukri directly)](#where-jobs-come-from)
8. [Location rules](#location-rules)
9. [Deploying to Vercel](#deploying-to-vercel)
10. [Adding more users](#adding-more-users)
11. [Project structure](#project-structure)
12. [Database](#database)
13. [Scripts](#scripts)
14. [Troubleshooting](#troubleshooting)

---

## What it does

| Area | Features |
|---|---|
| **Overview** | KPI tiles, latest daily report, **Scan Now**, **Run Daily Workflow** with live progress, top matches, pending follow-ups |
| **Discover Jobs** | Search, filters (title, company, location, salary, experience, work mode, score, source, date, status), sorting, pagination, saved searches, manual add, import from URL, "Found on …" platform label on every card |
| **Recommended Jobs** | Excellent / Good / Low tabs (thresholds configurable), internships & contract shown separately |
| **HR Contacts** | Publicly listed recruiter/HR contacts with source URL and verification label (verified / public / inferred / unknown); falls back to the company's careers/contact page |
| **Email Outreach** | 5 email types (direct application, recruiter outreach, hiring-manager intro, follow-up, general inquiry), edit, copy, Gmail draft, **approve → send** one at a time, duplicate-send protection, unsubscribe list, follow-ups |
| **Resume Manager** | PDF upload, multiple versions, analysis (skills, projects, achievements, completeness), compare, best-resume-per-job suggestion |
| **Applications** | Kanban board (11 statuses, drag & drop) + table, full timeline per job, follow-up dates, interview details, notes |
| **Analytics** | Discovery by source, applications by status, matches by role, weekly activity, email response rate, interview conversion |
| **AI Assistant** | Chat that runs real queries/workflows ("show jobs above 80%", "which companies should I contact today?", "give me today's report" …) |
| **Settings** | Profile, matching thresholds, AI provider, discovery sources, Gmail, daily workflow, email verification, privacy (export / delete all data) |

AI features use an LLM when you add a key. **Without a key every feature still works** using clearly labelled rule-based fallbacks (`heuristic` scoring, `template` emails).

## Safety rules built into the app
1. **No email is sent without explicit per-email approval** (approve, then send with a confirmation). There is no bulk-send. The daily workflow only creates drafts.
2. **No job application is ever submitted automatically.** "Apply" opens the employer's own page.
3. Contact emails are **never marked verified** unless an email-verification provider says deliverable. Guessed patterns are labelled *inferred*. Every contact has a source URL.
4. **No scraping that bypasses logins, CAPTCHAs or anti-bot protections.** `robots.txt` and rate limits are respected.
5. Missing salary/experience/requirements are shown as **Unknown** — never invented. Resumes and emails never include fabricated experience (emails are audited for invented facts).
6. OAuth tokens and API keys are **AES-256-GCM encrypted** at rest and never sent to the browser.
7. Per-user data isolation on every query; account disconnect, **data export and deletion** in Settings → Privacy.

---

## Quick start (local)

**Prerequisites:** Node.js 20+ (22+ recommended), npm, a Postgres database (a free [Neon](https://neon.tech) project is recommended).

```bash
git clone https://github.com/Abishake01/ai-job-hunter.git
cd ai-job-hunter
npm install

cp .env.example .env.local        # then fill in the values (see next section)
npm run db:migrate                # creates all tables
npm run dev                       # http://localhost:3000
```

Minimum to run locally: `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, plus either Google login (`AUTH_GOOGLE_ID/SECRET` + `ALLOWED_EMAILS`) or the dev-only login (`DEV_LOGIN=true`, never in production).

Check everything is healthy:
```bash
npm run typecheck && npm test && npm run build
```

---

## Getting each credential

Put every value in **`.env.local`** (never commit it). `.env.example` is the template.

| Variable | Required | How to get it |
|---|---|---|
| `DATABASE_URL` | yes | Neon → create project → **Connect** → copy the (pooled) connection string. Any Postgres URL also works locally. |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | yes | `openssl rand -hex 32` (64 hex chars). **Keep it stable**: changing it makes stored Gmail tokens / API keys unreadable. |
| `AUTH_URL` | yes | `http://localhost:3000` locally; your production URL when deployed |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | yes (for Google login & Gmail) | see below |
| `ALLOWED_EMAILS` | yes in production | comma-separated Gmail addresses allowed to sign in |
| `OWNER_EMAIL` | optional | defaults to the first `ALLOWED_EMAILS` entry; only the owner gets the sample pre-filled profile |
| `DEV_LOGIN` | local only | `true` enables an email-only login for development. **Must be `false` in production.** |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | optional | Shared fallback AI key. Each user can instead save their own in **Settings → AI provider** (encrypted). |
| `CRON_SECRET` | production | `openssl rand -hex 16`; protects `/api/cron/*` |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | optional | Only if you want Inngest to run background tasks; otherwise Next.js `after()` + Vercel Cron are used |

### Google OAuth (login + Gmail) — step by step
1. Go to <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen / Google Auth Platform**
   - User type **External**, fill app name + your email.
   - **Data access / Scopes**: add `gmail.readonly`, `gmail.compose`, `gmail.send`.
   - **Audience → Test users**: add **every Gmail address that will sign in** (yourself, friends). While the app is in *Testing*, only listed test users can log in (max 100).
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - *Authorised JavaScript origins*: leave empty (or a bare origin like `http://localhost:3000`, no path).
   - *Authorised redirect URIs* (both are required, for each domain you use):
     - `http://localhost:3000/api/auth/callback/google` (app login)
     - `http://localhost:3000/api/gmail/callback` (Gmail connect)
     - and for production: `https://YOUR-DOMAIN/api/auth/callback/google` and `https://YOUR-DOMAIN/api/gmail/callback`
5. Copy the Client ID and Secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

Notes: Google shows *"Google hasn't verified this app"* for your own app — choose **Advanced → Go to <app>**. In Testing mode Google expires Gmail connections after ~7 days, so reconnect weekly. `gmail.send` is requested only so the **approved Send** button works; nothing is sent without your explicit click.

---

## Using the app: first-time walkthrough

1. **Sign in** with Google.
2. **Settings → Profile**: name, phone, LinkedIn/GitHub/portfolio, headline, education, experience, projects, skills, target roles, salary expectations, preferred cities, work modes. *Everything the AI writes about you comes from here — nothing is invented.*
3. **Resume Manager**: upload your PDF resume(s). Mark one as default.
4. **Settings → AI provider**: choose provider (OpenAI / Anthropic / OpenAI-compatible), model, paste key, click **Test**. (Optional but recommended.)
5. **Settings → Discovery**: add keywords, company boards (Greenhouse/Lever/Ashby slugs), RSS feeds, and optional **Adzuna** / **Jooble** keys.
6. **Settings → Gmail → Connect** (optional): enables job-alert import, recruiter/interview/rejection detection and Gmail drafts.
7. **Overview → Scan Now** (or **Run Daily Workflow**).
8. **Recommended Jobs**: review scores and explanations → **Shortlist**.
9. **Find HR** on shortlisted jobs → **Generate Email** → edit → **Copy** or **Create Gmail Draft**.
10. To send: **Approve**, then **Send** and confirm — one email at a time. A follow-up is scheduled automatically.
11. Track progress in **Applications**; ask the **AI Assistant** things like *"Which companies should I contact today?"*.

---

## How the daily workflow works
Run manually (**Overview → Run Daily Workflow**) or on a schedule (**Settings → Daily workflow**). Steps, each toggleable and failure-isolated:

1. **Fetch** new jobs from enabled sources
2. **Gmail**: classify relevant job-alert / recruiter / interview / rejection emails (skipped if not connected)
3. **Dedupe**: same job from several sources → one job with multiple provenance rows
4. **Match**: AI/heuristic score 0–100 with matching/missing skills, experience/salary/location/work-mode fit, reasons
5. **Contacts**: find public recruiter contacts for jobs above a score threshold
6. **Drafts**: prepare personalised email **drafts** for top matches (never sent)
7. **Tracker + report**: update statuses/follow-ups and save the daily report

Task state, steps and errors are persisted in the `agent_tasks` table (retries, idempotency keys) and visible via `/api/tasks`.

## Where jobs come from
| Source | How | Notes |
|---|---|---|
| Remotive, Arbeitnow, Remote OK | Official public APIs | No key needed (mostly remote / Europe) |
| Greenhouse, Lever, Ashby | Public ATS job-board APIs | Add company slugs in Settings → Discovery |
| Adzuna, Jooble | Official APIs | Free keys; best for India coverage |
| RSS / Atom | Feeds you supply | `robots.txt` respected |
| **LinkedIn, Naukri, Foundit, Unstop, Internshala, Indeed, Glassdoor, Wellfound, Instahyre, Cutshort, Hirist** | **Gmail job alerts**, manual add, or paste a link | These sites have no public job API and forbid scraping, so the app does **not** scrape them. Turn on email alerts on each site, connect Gmail, and alerts become jobs labelled with the right portal. |

Every job card shows **Found on <platform>** and where the apply link leads (e.g. *Apply on greenhouse.io*). Pasting a job link in **Add Job** auto-detects the portal.

## Location rules
- **In India** (e.g. Chennai, Bengaluru, Pune, Hyderabad): **remote, hybrid and on-site** are all kept.
- **Outside India**: only **remote** roles (and not "US-only / residents only" style restrictions).
- Matching favours your preferred cities (default **Chennai, Bengaluru**), then other Indian locations, then remote roles abroad.
- Setting: `discovery.abroadRemoteOnly` (default `true`). Preferred cities live in **Settings → Profile → preferred locations**.

---

## Deploying to Vercel
```bash
npm i -g vercel
vercel login
vercel link                       # create/link the project
```
Add environment variables (Project → Settings → Environment Variables, **Production**):
`DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `AUTH_URL` (your production URL, e.g. `https://my-app.vercel.app`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS`, `OWNER_EMAIL`, `CRON_SECRET`, `DEV_LOGIN=false` (+ optional AI keys).

```bash
npm run db:migrate                # run once against your Neon DB
vercel deploy --prod
```
Then in Google Cloud add the **production** redirect URIs (`/api/auth/callback/google` and `/api/gmail/callback`) and add your users as **Test users**.

`vercel.json` schedules the daily workflow (`/api/cron/daily`, 03:30 UTC). The Hobby plan allows **daily cron only**; on Pro you can add more frequent jobs (`/api/cron/discover-jobs`, `/api/cron/sync-gmail` already exist). The schedule only runs for users who enabled **Settings → Daily workflow**.

## Adding more users
1. Add their Gmail to `ALLOWED_EMAILS` (comma-separated) in `.env.local` / Vercel env vars, and redeploy.
2. Add the same address under **Google Cloud → OAuth consent screen → Audience → Test users**.
3. They sign in and start with a **blank profile**. Their data is completely isolated from everyone else's.

---

## Project structure
```
src/
  app/
    (dashboard)/          # pages: dashboard, jobs, recommended, hr-contacts, outreach,
                          #        resume, applications, analytics, assistant, settings
    api/                  # Route Handlers (REST): jobs, gmail, recruiters, outreach, resumes,
                          #   settings, analytics, assistant, workflow, tasks, cron, inngest …
    login/
  components/             # ui/ (shadcn), common/, jobs/, outreach/, resume/, settings/, dashboard/ …
  lib/
    db/                   # schema.ts (Drizzle), relations.ts, index.ts (Neon driver)
    auth/                 # Auth.js config, session helpers, user bootstrap
    services/             # business logic (job, matching, recruiter, email, gmail, application,
                          #   analytics, assistant, workflow, tasks, report …)
    job-sources/          # adapters + normalization, location policy, http (polite, robots-aware)
    gmail/                # OAuth, client, classify, extract, sync, drafts, send gate
    recruiters/           # public-page discovery + verification labelling
    ai/                   # llm.ts (structured output + Zod), prompts/, heuristics/ (fallbacks)
    validation/           # Zod schemas
    utils/                # crypto (AES-GCM), api helpers, business-day math …
  inngest/                # optional Inngest client + functions
  proxy.ts                # Next 16 proxy (auth gate)
drizzle/                  # SQL migrations
docs/CONTRACT.md          # internal architecture notes
```
Design rules: UI → Route Handlers → service modules → DB/integrations; AI prompts live in `lib/ai/prompts`; all AI output is validated with Zod; every service takes `userId` and scopes queries by it.

## Database
24 tables (Drizzle, `src/lib/db/schema.ts`), including `users`, `candidate_profiles`, `skills`, `candidate_skills`, `resumes`, `companies`, `jobs`, `job_skills`, `job_sources` (provenance), `recruiters`, `recruiter_sources`, `job_matches`, `applications`, `email_outreach`, `email_conversations` (metadata only — no raw emails), `gmail_sync_history`, `saved_searches`, `follow_ups`, `agent_tasks`, `user_integrations` (encrypted secrets), plus `activity_log`, `source_health`, `unsubscribes`, `daily_reports`.

Changing the schema:
```bash
# edit src/lib/db/schema.ts
npm run db:generate    # creates a SQL migration in drizzle/
npm run db:migrate     # applies it
```
Duplicate prevention: unique `(user, fingerprint)` and `(user, source, source_job_id)` on jobs; `sent_key` unique on outreach prevents sending the same email twice.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests (Vitest, DB-free) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:migrate` | Create / apply Drizzle migrations |

## Troubleshooting
| Symptom | Fix |
|---|---|
| **Google "Access blocked / access_denied (403)"** | Add the signing-in Gmail under OAuth consent screen → **Test users** |
| **`redirect_uri_mismatch`** | Add the exact redirect URIs listed above to the OAuth client (wait a few minutes) |
| Can't sign in / "AccessDenied" | Email isn't in `ALLOWED_EMAILS` |
| Gmail stops working after ~a week | Testing-mode tokens expire in 7 days — reconnect in Settings → Gmail |
| "ENCRYPTION_KEY must be 64 hex chars" | Generate with `openssl rand -hex 32` |
| Relation/table does not exist | Run `npm run db:migrate` against the same `DATABASE_URL` |
| Few/no India jobs | Add an Adzuna key, add Indian company boards (Lever: `cred`, `meesho`, `paytm`; Greenhouse: `groww`), and set up job-alert emails on Naukri/LinkedIn/Foundit/Unstop + connect Gmail |
| Scores say "heuristic" | No AI key set — add one in Settings → AI provider |
| Vercel deploy rejected for cron | Hobby plan = daily cron only (see `vercel.json`) |

## License
Personal project — add a license of your choice before sharing publicly.
