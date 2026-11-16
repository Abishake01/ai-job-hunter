import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, dailyReports, emailOutreach, followUps, jobMatches, jobs, recruiters } from "@/lib/db/schema";
import { getSettings } from "@/lib/services/profile.service";
import { dateInTz, formatReportSummary, type ReportData } from "./report.logic";

export type { ReportData } from "./report.logic";

/** Builds today's report from live data (last 24h activity + current pipeline). */
export async function buildDailyReport(userId: string, workflow?: ReportData["workflow"]): Promise<{ data: ReportData; summaryText: string }> {
  const settings = await getSettings(userId);
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600_000);
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [newJobs, matchedJobs, contactsFound, draftsCreated, pendingFollowUps, applicationsTotal, interviews] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(eq(jobs.userId, userId), gte(jobs.discoveredAt, since)))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(jobMatches).where(and(eq(jobMatches.userId, userId), gte(jobMatches.createdAt, since)))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(recruiters).where(and(eq(recruiters.userId, userId), gte(recruiters.createdAt, since)))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), gte(emailOutreach.createdAt, since), inArray(emailOutreach.status, ["draft", "gmail_draft_created"])))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(followUps).where(and(eq(followUps.userId, userId), eq(followUps.status, "pending")))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(applications).where(eq(applications.userId, userId))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.status, "interview_scheduled")))),
  ]);
  const top = await db.select({ jobId: jobs.id, title: jobs.title, company: companies.name, score: jobMatches.score }).from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId)).innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobMatches.userId, userId), eq(jobs.isActive, true), inArray(jobs.status, ["discovered", "shortlisted", "ready_to_apply"])))
    .orderBy(desc(jobMatches.score)).limit(5);
  const { excellent, good } = settings.thresholds;
  const [tally] = await db.select({
    ex: sql<number>`count(*) filter (where ${jobMatches.score} >= ${excellent})::int`,
    gd: sql<number>`count(*) filter (where ${jobMatches.score} >= ${good} and ${jobMatches.score} < ${excellent})::int`,
  }).from(jobMatches).where(and(eq(jobMatches.userId, userId), gte(jobMatches.createdAt, since)));
  const data: ReportData = {
    date: dateInTz(now, settings.dailyWorkflow.timezone), newJobs, matchedJobs, excellentMatches: tally?.ex ?? 0, goodMatches: tally?.gd ?? 0,
    contactsFound, draftsCreated, pendingFollowUps, applicationsTotal, interviews, topMatches: top, workflow,
  };
  return { data, summaryText: formatReportSummary(data) };
}

export async function saveDailyReport(userId: string, workflow?: ReportData["workflow"]) {
  const { data, summaryText } = await buildDailyReport(userId, workflow);
  const [row] = await db.insert(dailyReports).values({ userId, reportDate: data.date, data: data as unknown as Record<string, unknown>, summaryText })
    .onConflictDoUpdate({ target: [dailyReports.userId, dailyReports.reportDate], set: { data: data as unknown as Record<string, unknown>, summaryText } }).returning();
  return row;
}

export async function getLatestReport(userId: string) {
  const [r] = await db.select().from(dailyReports).where(eq(dailyReports.userId, userId)).orderBy(desc(dailyReports.reportDate)).limit(1);
  return r ?? null;
}
export async function listReports(userId: string, limit = 14) {
  return db.select().from(dailyReports).where(eq(dailyReports.userId, userId)).orderBy(desc(dailyReports.reportDate)).limit(limit);
}
