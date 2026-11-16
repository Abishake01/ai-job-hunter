import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { decryptJson } from "@/lib/utils/crypto";

/** Full export of everything stored for the user (privacy / portability). Secrets and resume file bytes are never included. */
export async function exportAllData(userId: string) {
  const [user] = await db.select({ id: s.users.id, email: s.users.email, name: s.users.name, createdAt: s.users.createdAt }).from(s.users).where(eq(s.users.id, userId));
  const profile = await db.select().from(s.candidateProfiles).where(eq(s.candidateProfiles.userId, userId));
  const skillRows = await db.select({ name: s.skills.name, level: s.candidateSkills.level }).from(s.candidateSkills).innerJoin(s.skills, eq(s.skills.id, s.candidateSkills.skillId)).where(eq(s.candidateSkills.userId, userId));
  const resumeRows = await db.select({ id: s.resumes.id, name: s.resumes.name, filename: s.resumes.filename, mimeType: s.resumes.mimeType, extractedText: s.resumes.extractedText, analysis: s.resumes.analysis, isDefault: s.resumes.isDefault, createdAt: s.resumes.createdAt }).from(s.resumes).where(eq(s.resumes.userId, userId));
  const jobRows = await db.select().from(s.jobs).where(eq(s.jobs.userId, userId));
  const jobIds = jobRows.map((j) => j.id);
  const jobSkillRows = jobIds.length ? await db.select({ jobId: s.jobSkills.jobId, name: s.skills.name, required: s.jobSkills.required }).from(s.jobSkills).innerJoin(s.skills, eq(s.skills.id, s.jobSkills.skillId)).where(inArray(s.jobSkills.jobId, jobIds)) : [];
  const recruiterRows = await db.select().from(s.recruiters).where(eq(s.recruiters.userId, userId));
  const recIds = recruiterRows.map((r) => r.id);
  const recSources = recIds.length ? await db.select().from(s.recruiterSources).where(inArray(s.recruiterSources.recruiterId, recIds)) : [];
  const integrations = await db.select({ provider: s.userIntegrations.provider, accountEmail: s.userIntegrations.accountEmail, scopes: s.userIntegrations.scopes, config: s.userIntegrations.config, status: s.userIntegrations.status, createdAt: s.userIntegrations.createdAt }).from(s.userIntegrations).where(eq(s.userIntegrations.userId, userId));
  return {
    exportedAt: new Date().toISOString(),
    note: "API keys, OAuth tokens and resume file bytes are intentionally excluded.",
    user, profile: profile[0] ?? null, skills: skillRows, resumes: resumeRows,
    companies: await db.select().from(s.companies).where(eq(s.companies.userId, userId)),
    jobs: jobRows, jobSkills: jobSkillRows,
    jobSources: await db.select().from(s.jobSources).where(eq(s.jobSources.userId, userId)),
    sourceHealth: await db.select().from(s.sourceHealth).where(eq(s.sourceHealth.userId, userId)),
    recruiters: recruiterRows, recruiterSources: recSources,
    jobMatches: await db.select().from(s.jobMatches).where(eq(s.jobMatches.userId, userId)),
    applications: await db.select().from(s.applications).where(eq(s.applications.userId, userId)),
    emailOutreach: await db.select().from(s.emailOutreach).where(eq(s.emailOutreach.userId, userId)),
    unsubscribes: await db.select().from(s.unsubscribes).where(eq(s.unsubscribes.userId, userId)),
    emailConversations: await db.select().from(s.emailConversations).where(eq(s.emailConversations.userId, userId)),
    gmailSyncHistory: await db.select().from(s.gmailSyncHistory).where(eq(s.gmailSyncHistory.userId, userId)),
    savedSearches: await db.select().from(s.savedSearches).where(eq(s.savedSearches.userId, userId)),
    followUps: await db.select().from(s.followUps).where(eq(s.followUps.userId, userId)),
    agentTasks: await db.select().from(s.agentTasks).where(eq(s.agentTasks.userId, userId)),
    integrations,
    activityLog: await db.select().from(s.activityLog).where(eq(s.activityLog.userId, userId)),
    dailyReports: await db.select().from(s.dailyReports).where(eq(s.dailyReports.userId, userId)),
  };
}

/**
 * scope "data": deletes all job-hunting data (jobs, companies, contacts, outreach, emails, matches, resumes, activity, reports, tasks, saved searches).
 *   Keeps profile, settings, integrations and the unsubscribe list (so a wipe can never cause emailing an opted-out address).
 * scope "account": deletes the user row; every table cascades. Gmail tokens are revoked best-effort first.
 */
export async function deleteAllData(userId: string, scope: "data" | "account" = "data") {
  if (scope === "account") {
    await revokeGmail(userId);
    await db.delete(s.users).where(eq(s.users.id, userId));
    return { scope, deleted: true };
  }
  const cnt: Record<string, number> = {};
  const del = async (name: string, p: Promise<{ rowCount?: number | null } | unknown>) => { await p; cnt[name] = 1; };
  await del("followUps", db.delete(s.followUps).where(eq(s.followUps.userId, userId)));
  await del("emailOutreach", db.delete(s.emailOutreach).where(eq(s.emailOutreach.userId, userId)));
  await del("emailConversations", db.delete(s.emailConversations).where(eq(s.emailConversations.userId, userId)));
  await del("gmailSyncHistory", db.delete(s.gmailSyncHistory).where(eq(s.gmailSyncHistory.userId, userId)));
  await del("activityLog", db.delete(s.activityLog).where(eq(s.activityLog.userId, userId)));
  await del("jobMatches", db.delete(s.jobMatches).where(eq(s.jobMatches.userId, userId)));
  await del("applications", db.delete(s.applications).where(eq(s.applications.userId, userId)));
  await del("companies", db.delete(s.companies).where(eq(s.companies.userId, userId))); // cascades jobs, job_skills, job_sources, recruiters, recruiter_sources
  await del("jobs", db.delete(s.jobs).where(eq(s.jobs.userId, userId)));
  await del("resumes", db.delete(s.resumes).where(eq(s.resumes.userId, userId)));
  await del("savedSearches", db.delete(s.savedSearches).where(eq(s.savedSearches.userId, userId)));
  await del("dailyReports", db.delete(s.dailyReports).where(eq(s.dailyReports.userId, userId)));
  await del("agentTasks", db.delete(s.agentTasks).where(eq(s.agentTasks.userId, userId)));
  await del("sourceHealth", db.delete(s.sourceHealth).where(eq(s.sourceHealth.userId, userId)));
  return { scope, deleted: true, cleared: Object.keys(cnt) };
}

async function revokeGmail(userId: string) {
  try {
    const rows = await db.select().from(s.userIntegrations).where(eq(s.userIntegrations.userId, userId));
    const g = rows.find((r) => r.provider === "gmail");
    if (!g?.secretsEnc) return;
    const t = decryptJson<{ refresh_token?: string; refreshToken?: string; access_token?: string }>(g.secretsEnc);
    const token = t.refresh_token ?? t.refreshToken ?? t.access_token;
    if (token) await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(8000) });
  } catch { /* best effort */ }
}
