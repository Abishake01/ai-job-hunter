import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, emailConversations, emailOutreach, followUps, jobMatches, jobSources, jobs } from "@/lib/db/schema";
import { getSettings } from "@/lib/services/profile.service";
import { countBy, interviewConversion, orderStatuses, pct, responseRate, roleBucket, weeklyBuckets } from "./analytics.logic";

export async function getOverview(userId: string) {
  const now = new Date();
  const since24 = new Date(now.getTime() - 24 * 3600_000);
  const since12w = new Date(now.getTime() - 12 * 7 * 86400_000);
  const settings = await getSettings(userId);
  const [jobRows, sources, matches, apps, sent, replies, fu] = await Promise.all([
    db.select({ id: jobs.id, title: jobs.title, status: jobs.status, discoveredAt: jobs.discoveredAt, shortlisted: jobs.shortlisted }).from(jobs).where(eq(jobs.userId, userId)),
    db.select({ jobId: jobSources.jobId, source: jobSources.source }).from(jobSources).where(eq(jobSources.userId, userId)),
    db.select({ jobId: jobMatches.jobId, score: jobMatches.score }).from(jobMatches).where(eq(jobMatches.userId, userId)),
    db.select({ jobId: applications.jobId, appliedAt: applications.appliedAt }).from(applications).where(and(eq(applications.userId, userId), gte(applications.appliedAt, since12w))),
    db.select({ jobId: emailOutreach.jobId, sentAt: emailOutreach.sentAt }).from(emailOutreach).where(and(eq(emailOutreach.userId, userId), eq(emailOutreach.status, "sent"))),
    db.select({ jobId: emailConversations.jobId, receivedAt: emailConversations.receivedAt, category: emailConversations.category }).from(emailConversations).where(eq(emailConversations.userId, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(followUps).where(and(eq(followUps.userId, userId), eq(followUps.status, "pending"))),
  ]);
  const [appCount] = await db.select({ n: sql<number>`count(*)::int` }).from(applications).where(eq(applications.userId, userId));
  const statusCounts: Record<string, number> = {};
  for (const j of jobRows) statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;
  const sentOk = sent.filter((s): s is { jobId: string; sentAt: Date } => !!s.jobId && !!s.sentAt);
  const rr = responseRate(sentOk, replies);
  const ic = interviewConversion(statusCounts);
  const bySource = countBy(sources, (s) => s.source, "manual");
  const linked = new Set(sources.map((s) => s.jobId));
  const manual = jobRows.filter((j) => !linked.has(j.id)).length;
  if (manual) { const m = bySource.find((x) => x.name === "manual"); if (m) m.value += manual; else bySource.push({ name: "manual", value: manual }); }
  const excellent = matches.filter((m) => m.score >= settings.thresholds.excellent).length;
  const good = matches.filter((m) => m.score >= settings.thresholds.good && m.score < settings.thresholds.excellent).length;
  return {
    kpis: {
      totalJobs: jobRows.length,
      newToday: jobRows.filter((j) => j.discoveredAt >= since24).length,
      excellentMatches: excellent,
      shortlisted: jobRows.filter((j) => j.shortlisted).length,
      applications: appCount?.n ?? 0,
      emailsSent: sentOk.length,
      interviews: ic.interviews,
      pendingFollowUps: fu[0]?.n ?? 0,
      selected: statusCounts.selected ?? 0,
      responseRate: rr.rate,
      interviewConversion: ic.rate,
      goodMatches: good,
      scoredJobs: matches.length,
    },
    charts: {
      bySource,
      byStatus: orderStatuses(statusCounts),
      byRole: countBy(jobRows, (j) => roleBucket(j.title)),
      weekly: weeklyBuckets({ discovered: jobRows.map((j) => j.discoveredAt), applied: apps.map((a) => a.appliedAt), emailsSent: sentOk.map((s) => s.sentAt) }, now, 12),
      emailResponse: { sent: rr.sent, replied: rr.replied, noReply: rr.sent - rr.replied, rate: rr.rate },
      interviewFunnel: { engaged: ic.engaged, interviews: ic.interviews, selected: statusCounts.selected ?? 0, rate: ic.rate, applicationRate: pct(appCount?.n ?? 0, jobRows.length) },
      scoreBands: [{ name: "Excellent", value: excellent }, { name: "Good", value: good }, { name: "Low", value: matches.length - excellent - good }],
    },
    thresholds: settings.thresholds,
  };
}
export type Overview = Awaited<ReturnType<typeof getOverview>>;
