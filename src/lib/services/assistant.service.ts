import "server-only";
import { z } from "zod";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, emailOutreach, jobMatches, jobSkills, jobs, recruiterSources, recruiters, skills } from "@/lib/db/schema";
import { generateStructured } from "@/lib/ai/llm";
import { ASSISTANT_ROUTER_SYSTEM } from "@/lib/ai/prompts/assistant";
import { getSettings } from "@/lib/services/profile.service";
import { listFollowUps } from "@/lib/services/application.service";
import { buildDailyReport, getLatestReport } from "@/lib/services/report.service";
import { enqueueTask } from "@/lib/services/tasks.service";
import { ASSISTANT_TOOLS, routeIntent, type AssistantTool, type ToolArgs } from "./assistant.logic";
import { normalizeSkill } from "@/lib/utils/skills";
import { EMAIL_KINDS, type JobStatus } from "@/lib/db/schema";

export type AssistantJob = { id: string; title: string; company: string; location: string | null; workMode: string | null; salaryText: string | null; score: number | null; status: string; applyUrl: string | null };
export type AssistantContact = { id: string; name: string | null; designation: string | null; email: string | null; verification: string; company: string; jobId: string | null; jobTitle: string | null; sourceUrl: string | null };
export type AssistantResponse = {
  reply: string; actions: { type: string; label: string; href?: string; taskId?: string }[];
  jobs?: AssistantJob[]; contacts?: AssistantContact[]; email?: { id: string; subject: string; body: string; toEmail: string | null; status: string; jobId: string | null };
  tool: AssistantTool | null; engine: "llm" | "heuristic";
};

const routeSchema = z.object({
  tool: z.enum([...ASSISTANT_TOOLS, "none"]),
  args: z.object({ query: z.string().nullable().optional(), skills: z.array(z.string()).nullable().optional(), company: z.string().nullable().optional(), kind: z.enum(EMAIL_KINDS).nullable().optional(), location: z.string().nullable().optional() }).default({}),
});

async function route(userId: string, message: string): Promise<{ tool: AssistantTool | null; args: ToolArgs; engine: "llm" | "heuristic" }> {
  try {
    const { data } = await generateStructured(userId, { system: ASSISTANT_ROUTER_SYSTEM, prompt: message.slice(0, 1000), schema: routeSchema });
    if (data.tool !== "none") {
      const a = data.args;
      return { tool: data.tool, args: { query: a.query ?? undefined, skills: a.skills?.map(normalizeSkill) ?? undefined, company: a.company ?? undefined, kind: a.kind ?? undefined, location: a.location ?? undefined }, engine: "llm" };
    }
    const fb = routeIntent(message);
    return fb ? { ...fb, engine: "heuristic" } : { tool: null, args: {}, engine: "llm" };
  } catch {
    const fb = routeIntent(message);
    return fb ? { ...fb, engine: "heuristic" } : { tool: null, args: {}, engine: "heuristic" };
  }
}

async function cards(userId: string, where: SQL | undefined, limit: number, order: "score" | "recent" = "score"): Promise<AssistantJob[]> {
  const rows = await db.select({ j: jobs, company: companies.name, score: jobMatches.score }).from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .where(and(eq(jobs.userId, userId), eq(jobs.isActive, true), where))
    .orderBy(order === "score" ? sql`${jobMatches.score} desc nulls last` : desc(jobs.discoveredAt), desc(jobs.discoveredAt)).limit(limit);
  return rows.map((r) => ({ id: r.j.id, title: r.j.title, company: r.company, location: r.j.location, workMode: r.j.workMode, salaryText: r.j.salaryText, score: r.score ?? null, status: r.j.status, applyUrl: r.j.applyUrl }));
}

const jobLine = (j: AssistantJob) => `- **${j.title}** at ${j.company} — ${j.location ?? "Location unknown"}${j.workMode ? ` (${j.workMode})` : ""} · ${j.score != null ? `${j.score}% match` : "not scored"}`;
const OPEN: JobStatus[] = ["discovered", "shortlisted", "ready_to_apply"];
const noScan = (extra = "") => `${extra}Try **Scan for new jobs now** to fetch fresh listings.`;

const TOOLS: Record<AssistantTool, (userId: string, a: ToolArgs, message: string) => Promise<Omit<AssistantResponse, "tool" | "engine">>> = {
  async search_jobs(userId, a) {
    const terms = [...(a.query ?? "").split(/\s+/), ...(a.location ? a.location.split(/\s+/) : [])].filter((w) => w.length > 1);
    const conds = terms.map((w) => or(ilike(jobs.title, `%${w}%`), ilike(companies.name, `%${w}%`), ilike(jobs.location, `%${w}%`), ilike(jobs.description, `%${w}%`)));
    const list = await cards(userId, conds.length ? and(...conds) : undefined, 15);
    return { reply: list.length ? `Found **${list.length}** matching job${list.length === 1 ? "" : "s"}${terms.length ? ` for "${terms.join(" ")}"` : ""}:\n\n${list.map(jobLine).join("\n")}` : `No saved jobs match "${terms.join(" ")}". ${noScan()}`, actions: list.length ? [{ type: "link", label: "Open Discover Jobs", href: "/jobs" }] : [{ type: "scan", label: "Scan now" }], jobs: list };
  },
  async top_matches(userId, a) {
    const list = await cards(userId, and(inArray(jobs.status, OPEN), sql`${jobMatches.score} is not null`), a.limit ?? 10);
    return { reply: list.length ? `Your **top ${list.length}** open matches:\n\n${list.map(jobLine).join("\n")}` : `No scored jobs yet. Run a scan, then match jobs from Discover Jobs.`, actions: [{ type: "link", label: "Recommended jobs", href: "/recommended" }], jobs: list };
  },
  async hiring_companies(userId, a) {
    const sk = (a.skills ?? []).map(normalizeSkill).filter(Boolean);
    if (!sk.length) return { reply: "Tell me a skill, e.g. \"Which companies are hiring React developers?\"", actions: [] };
    const rows = await db.select({ company: companies.name, n: sql<number>`count(distinct ${jobs.id})::int` }).from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId)).innerJoin(jobs, eq(jobs.id, jobSkills.jobId)).innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(jobs.userId, userId), eq(jobs.isActive, true), inArray(skills.normalized, sk))).groupBy(companies.name).orderBy(desc(sql`count(distinct ${jobs.id})`)).limit(25);
    return { reply: rows.length ? `Companies with active **${sk.join(", ")}** openings:\n\n${rows.map((r) => `- **${r.company}** — ${r.n} opening${r.n === 1 ? "" : "s"}`).join("\n")}` : `No active openings list ${sk.join(", ")} yet. ${noScan()}`, actions: [] };
  },
  async not_applied_companies(userId) {
    const rows = await db.select({ company: companies.name, n: sql<number>`count(${jobs.id})::int`, best: sql<number | null>`max(${jobMatches.score})` }).from(companies)
      .innerJoin(jobs, and(eq(jobs.companyId, companies.id), eq(jobs.isActive, true)))
      .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
      .where(and(eq(companies.userId, userId), sql`not exists (select 1 from ${applications} a join ${jobs} j on j.id = a.job_id where a.user_id = ${userId} and j.company_id = ${companies.id})`, sql`${jobs.status} not in ('not_interested','rejected')`))
      .groupBy(companies.name).orderBy(sql`max(${jobMatches.score}) desc nulls last`).limit(25);
    return { reply: rows.length ? `You haven't applied to these **${rows.length}** companies:\n\n${rows.map((r) => `- **${r.company}** — ${r.n} open job${r.n === 1 ? "" : "s"}${r.best != null ? `, best match ${r.best}%` : ""}`).join("\n")}` : "You have applied to every company with an active job (or none are saved yet).", actions: [] };
  },
  async contacts_for_shortlisted(userId) {
    const rows = await db.select({ r: recruiters, company: companies.name, jobTitle: jobs.title, jobId: jobs.id }).from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(recruiters, and(eq(recruiters.userId, userId), eq(recruiters.companyId, jobs.companyId)))
      .where(and(eq(jobs.userId, userId), or(eq(jobs.shortlisted, true), eq(jobs.status, "shortlisted")))).limit(40);
    const ids = rows.map((r) => r.r.id);
    const srcs = ids.length ? await db.select().from(recruiterSources).where(inArray(recruiterSources.recruiterId, ids)) : [];
    const contacts: AssistantContact[] = rows.map((r) => ({ id: r.r.id, name: r.r.name, designation: r.r.designation, email: r.r.email, verification: r.r.verification, company: r.company, jobId: r.jobId, jobTitle: r.jobTitle, sourceUrl: srcs.find((s) => s.recruiterId === r.r.id)?.sourceUrl ?? null }));
    return { reply: contacts.length ? `HR contacts for your shortlisted jobs:\n\n${contacts.map((c) => `- **${c.name ?? "Name unknown"}**${c.designation ? `, ${c.designation}` : ""} at ${c.company} — ${c.email ?? "email unknown"} (${c.verification})`).join("\n")}` : "No contacts found for shortlisted jobs yet. Use **Find HR** on a shortlisted job.", actions: [{ type: "link", label: "HR Contacts", href: "/hr-contacts" }], contacts };
  },
  async generate_email(userId, a) {
    const name = a.company?.trim();
    const where = name ? ilike(companies.name, `%${name}%`) : inArray(jobs.status, OPEN);
    const [pick] = await db.select({ id: jobs.id, title: jobs.title, company: companies.name }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
      .where(and(eq(jobs.userId, userId), where)).orderBy(sql`${jobMatches.score} desc nulls last`).limit(1);
    if (!pick) return { reply: name ? `I couldn't find a saved job at "${name}". Add or discover one first.` : "Tell me which company, e.g. \"Generate a cold email for Acme\".", actions: [] };
    const { generateEmail } = await import("@/lib/services/email.service");
    const kind = (EMAIL_KINDS as readonly string[]).includes(a.kind ?? "") ? (a.kind as (typeof EMAIL_KINDS)[number]) : "recruiter_outreach";
    const o = await generateEmail(userId, { jobId: pick.id, kind });
    return { reply: `Drafted a **${kind.replace(/_/g, " ")}** email for **${pick.title}** at ${pick.company}. It is a draft only — review it in Email Outreach; nothing is sent until you approve and send it.`, actions: [{ type: "link", label: "Open Email Outreach", href: "/outreach" }], email: { id: o.id, subject: o.subject, body: o.body, toEmail: o.toEmail ?? null, status: o.status, jobId: o.jobId ?? pick.id } };
  },
  async jobs_by_skills(userId, a) {
    const sk = (a.skills ?? []).map(normalizeSkill);
    if (!sk.length) return { reply: "Which skills? e.g. \"Show jobs matching Python and FastAPI\".", actions: [] };
    const ids = await db.select({ jobId: jobSkills.jobId, n: sql<number>`count(distinct ${skills.normalized})::int` }).from(jobSkills).innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(inArray(skills.normalized, sk)).groupBy(jobSkills.jobId).orderBy(desc(sql`count(distinct ${skills.normalized})`)).limit(100);
    const list = ids.length ? await cards(userId, inArray(jobs.id, ids.map((i) => i.jobId)), 15) : [];
    const nBy = new Map(ids.map((i) => [i.jobId, i.n]));
    list.sort((x, y) => (nBy.get(y.id) ?? 0) - (nBy.get(x.id) ?? 0) || (y.score ?? -1) - (x.score ?? -1));
    return { reply: list.length ? `Jobs requiring **${sk.join(", ")}**:\n\n${list.map((j) => `${jobLine(j)} · ${nBy.get(j.id)}/${sk.length} skills`).join("\n")}` : `No jobs list ${sk.join(", ")} yet. ${noScan()}`, actions: [], jobs: list };
  },
  async contact_today(userId) {
    const st = (await getSettings(userId)).dailyWorkflow.minScoreForContacts;
    const list = await cards(userId, and(inArray(jobs.status, OPEN), sql`${jobMatches.score} >= ${st}`, sql`not exists (select 1 from ${emailOutreach} o where o.job_id = ${jobs.id} and o.status = 'sent')`), 8);
    const due = (await listFollowUps(userId)).filter((f) => f.overdue);
    const ids = list.map((j) => j.id);
    const rows = ids.length ? await db.select({ r: recruiters, company: companies.name, jobId: jobs.id, jobTitle: jobs.title }).from(recruiters).innerJoin(jobs, eq(jobs.companyId, recruiters.companyId)).innerJoin(companies, eq(companies.id, recruiters.companyId)).where(and(eq(recruiters.userId, userId), eq(recruiters.doNotContact, false), inArray(jobs.id, ids))) : [];
    const contacts: AssistantContact[] = rows.map((r) => ({ id: r.r.id, name: r.r.name, designation: r.r.designation, email: r.r.email, verification: r.r.verification, company: r.company, jobId: r.jobId, jobTitle: r.jobTitle, sourceUrl: null }));
    const parts: string[] = [];
    if (due.length) parts.push(`**Overdue follow-ups (${due.length})**\n${due.slice(0, 5).map((f) => `- ${f.title} at ${f.company}`).join("\n")}`);
    parts.push(list.length ? `**Strong matches to contact (score ≥ ${st}%)**\n${list.map(jobLine).join("\n")}` : `No uncontacted jobs score ≥ ${st}% yet.`);
    return { reply: parts.join("\n\n"), actions: [{ type: "link", label: "Email Outreach", href: "/outreach" }], jobs: list, contacts };
  },
  async pending_followups(userId) {
    const f = await listFollowUps(userId);
    return { reply: f.length ? `**${f.length}** pending follow-up${f.length === 1 ? "" : "s"}:\n\n${f.slice(0, 20).map((x) => `- ${x.overdue ? "**Overdue** · " : ""}${x.title} at ${x.company} — due ${x.dueAt.toISOString().slice(0, 10)}`).join("\n")}` : "No pending follow-ups.", actions: [{ type: "link", label: "Applications", href: "/applications" }] };
  },
  async daily_report(userId) {
    const saved = await getLatestReport(userId);
    const live = await buildDailyReport(userId);
    return { reply: `${live.summaryText}${saved ? `\n\n_Last full workflow report: ${saved.reportDate}._` : "\n\n_The daily workflow hasn't produced a saved report yet._"}`, actions: [{ type: "link", label: "Dashboard", href: "/dashboard" }] };
  },
  async scan_now(userId) {
    const day = new Date().toISOString().slice(0, 13);
    const t = await enqueueTask(userId, "discover_jobs", {}, { idempotencyKey: `scan:${day}:${Math.floor(Date.now() / 60000)}` });
    return { reply: t.created ? "Started a job scan. Track its progress on the Dashboard." : "A scan was just started — track it on the Dashboard.", actions: [{ type: "task", label: "View progress", href: "/dashboard", taskId: t.taskId }] };
  },
};

export async function chat(userId: string, message: string): Promise<AssistantResponse> {
  const r = await route(userId, message);
  if (!r.tool) {
    return { reply: "I can search jobs, show top matches, list hiring companies, find HR contacts, draft emails, check follow-ups, show your daily report, or scan for new jobs. Try one of the suggestions below.", actions: [], tool: null, engine: r.engine };
  }
  try {
    const out = await TOOLS[r.tool](userId, r.args, message);
    return { ...out, tool: r.tool, engine: r.engine };
  } catch (e) {
    return { reply: `Sorry, that action failed: ${e instanceof Error ? e.message : "unknown error"}`, actions: [], tool: r.tool, engine: r.engine };
  }
}
