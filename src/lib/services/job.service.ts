import "server-only";
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityLog, applications, companies, emailConversations, emailOutreach, jobMatches, jobSkills, jobSources, jobs, recruiters, savedSearches, skills,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { logActivity } from "@/lib/services/activity.service";
import { getSettings } from "@/lib/services/profile.service";
import { setJobStatus } from "@/lib/services/application.service";
import { detectWorkMode, extractSkills, makeFingerprint, normalizeCompany, normalizeSkillsFor, normalizeUrl, parseJobText } from "@/lib/job-sources/normalize";
import type { NormalizedJob } from "@/lib/job-sources/types";
import type { JobDetailData, JobFilters, JobListItem, JobSearchResult, MatchCategoryName } from "@/lib/jobs/types";
import type { JobInput } from "@/lib/validation/jobs";

export { normalizeUrl, makeFingerprint, parseJobText };

const catOf = (score: number, t: { excellent: number; good: number }): MatchCategoryName => (score >= t.excellent ? "excellent" : score >= t.good ? "good" : "low");

// ------------------------------------------------------------------ companies / skills
async function upsertCompany(userId: string, name: string): Promise<string> {
  const clean = name.trim() || "Unknown company";
  const normalizedName = normalizeCompany(clean) || clean.toLowerCase();
  await db.insert(companies).values({ userId, name: clean, normalizedName }).onConflictDoNothing({ target: [companies.userId, companies.normalizedName] });
  const [c] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.userId, userId), eq(companies.normalizedName, normalizedName)));
  return c.id;
}

async function attachSkills(jobId: string, required: string[], optional: string[]) {
  const all = new Map<string, boolean>();
  for (const s of normalizeSkillsFor(optional)) all.set(s, false);
  for (const s of normalizeSkillsFor(required)) all.set(s, true);
  if (!all.size) return;
  const names = [...all.keys()];
  await db.insert(skills).values(names.map((n) => ({ name: n, normalized: n }))).onConflictDoNothing({ target: skills.normalized });
  const rows = await db.select({ id: skills.id, normalized: skills.normalized }).from(skills).where(inArray(skills.normalized, names));
  await db.insert(jobSkills).values(rows.map((r) => ({ jobId, skillId: r.id, required: all.get(r.normalized) ?? true }))).onConflictDoNothing();
}

// ------------------------------------------------------------------ upsert (dedupe)
export type DuplicateReason = "source" | "fingerprint" | "url";

async function findExisting(userId: string, nj: NormalizedJob, fingerprint: string, normalizedUrl: string | null): Promise<{ id: string; reason: DuplicateReason } | null> {
  const [bySource] = await db.select({ jobId: jobSources.jobId }).from(jobSources).where(and(eq(jobSources.userId, userId), eq(jobSources.source, nj.source), eq(jobSources.sourceJobId, nj.sourceJobId)));
  if (bySource) return { id: bySource.jobId, reason: "source" };
  const [byFp] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.fingerprint, fingerprint)));
  if (byFp) return { id: byFp.id, reason: "fingerprint" };
  if (normalizedUrl) {
    const [byUrl] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.normalizedUrl, normalizedUrl)));
    if (byUrl) return { id: byUrl.id, reason: "url" };
  }
  return null;
}

/**
 * Inserts a discovered job or links it to an existing one. Dedupe order: same (source, sourceJobId) → same fingerprint → same normalized URL.
 * A duplicate only gets a provenance row (+ fills fields that were Unknown); it never overwrites existing data or pipeline status.
 */
export async function upsertDiscoveredJob(userId: string, nj: NormalizedJob, opts: { platform?: string } = {}): Promise<{ jobId: string; created: boolean; duplicateReason?: DuplicateReason }> {
  if (!nj.title?.trim()) throw new HttpError(400, "Job title is required");
  const fingerprint = makeFingerprint(nj.company || "Unknown company", nj.title, nj.location);
  const normalizedUrl = normalizeUrl(nj.applyUrl);
  const provenance = { userId, source: nj.source, platform: opts.platform ?? null, sourceJobId: nj.sourceJobId, sourceUrl: nj.sourceUrl ?? nj.applyUrl, discoveredAt: nj.discoveredAt };

  const existing = await findExisting(userId, nj, fingerprint, normalizedUrl);
  if (existing) {
    await linkExisting(userId, existing.id, nj, provenance);
    return { jobId: existing.id, created: false, duplicateReason: existing.reason };
  }

  const companyId = await upsertCompany(userId, nj.company);
  const [row] = await db.insert(jobs).values({
    userId, companyId, title: nj.title.trim(), description: nj.description, location: nj.location, workMode: nj.workMode, jobType: nj.jobType,
    salaryMin: nj.salaryMin, salaryMax: nj.salaryMax, salaryCurrency: nj.salaryCurrency, salaryText: nj.salaryText,
    experienceMin: nj.experienceMin, experienceMax: nj.experienceMax, experienceText: nj.experienceText,
    postedAt: nj.postedAt, deadline: nj.deadline ?? null, applyUrl: nj.applyUrl, normalizedUrl, fingerprint, discoveredAt: nj.discoveredAt,
  }).onConflictDoNothing({ target: [jobs.userId, jobs.fingerprint] }).returning({ id: jobs.id });

  if (!row) { // lost a race on the unique fingerprint
    const [r] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.fingerprint, fingerprint)));
    await linkExisting(userId, r.id, nj, provenance);
    return { jobId: r.id, created: false, duplicateReason: "fingerprint" };
  }
  await db.insert(jobSources).values({ ...provenance, jobId: row.id }).onConflictDoNothing();
  await attachSkills(row.id, nj.requiredSkills ?? [], nj.optionalSkills ?? []);
  await logActivity(userId, row.id, "discovered", `Discovered via ${nj.source}`, `${nj.title} at ${nj.company}`, { source: nj.source, sourceJobId: nj.sourceJobId });
  return { jobId: row.id, created: true };
}

async function linkExisting(userId: string, jobId: string, nj: NormalizedJob, provenance: Omit<typeof jobSources.$inferInsert, "jobId">) {
  const inserted = await db.insert(jobSources).values({ ...provenance, jobId }).onConflictDoNothing().returning({ id: jobSources.id });
  const [cur] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!cur) return;
  // Fill gaps only (Unknown -> known), and revive a listing that is seen again.
  const patch: Partial<typeof jobs.$inferInsert> = {};
  if (!cur.description && nj.description) patch.description = nj.description;
  if (!cur.location && nj.location) patch.location = nj.location;
  if (!cur.workMode && nj.workMode) patch.workMode = nj.workMode;
  if (!cur.jobType && nj.jobType) patch.jobType = nj.jobType;
  if (cur.salaryMin === null && cur.salaryMax === null && (nj.salaryMin !== null || nj.salaryMax !== null)) Object.assign(patch, { salaryMin: nj.salaryMin, salaryMax: nj.salaryMax, salaryCurrency: nj.salaryCurrency, salaryText: nj.salaryText });
  if (cur.experienceMin === null && cur.experienceMax === null && (nj.experienceMin !== null || nj.experienceMax !== null)) Object.assign(patch, { experienceMin: nj.experienceMin, experienceMax: nj.experienceMax, experienceText: nj.experienceText });
  if (!cur.postedAt && nj.postedAt) patch.postedAt = nj.postedAt;
  if (!cur.applyUrl && nj.applyUrl) { patch.applyUrl = nj.applyUrl; patch.normalizedUrl = normalizeUrl(nj.applyUrl); }
  if (!cur.isActive && nj.source !== "manual") Object.assign(patch, { isActive: true, expiredAt: null });
  if (Object.keys(patch).length) await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
  if (patch.description) await attachSkills(jobId, nj.requiredSkills ?? [], nj.optionalSkills ?? []);
  if (inserted.length) await logActivity(userId, jobId, "discovered", `Also listed on ${nj.source}`, nj.sourceUrl ?? nj.applyUrl, { source: nj.source, duplicate: true });
}

// ------------------------------------------------------------------ manual create / update / delete
export async function createManualJob(userId: string, input: JobInput, opts: { source?: string; sourceUrl?: string | null } = {}): Promise<{ jobId: string }> {
  const text = parseJobText(`${input.title}\n${input.description ?? ""}`);
  const sk = extractSkills(input.description ?? "", input.skills ?? []);
  const nj: NormalizedJob = {
    title: input.title, company: input.company, description: input.description,
    requiredSkills: sk.required, optionalSkills: sk.optional,
    experienceMin: input.experienceMin ?? text.experienceMin ?? null, experienceMax: input.experienceMax ?? text.experienceMax ?? null, experienceText: input.experienceText ?? text.experienceText ?? null,
    salaryMin: input.salaryMin ?? text.salaryMin ?? null, salaryMax: input.salaryMax ?? text.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency ?? text.salaryCurrency ?? null, salaryText: input.salaryText ?? text.salaryText ?? null,
    location: input.location, workMode: input.workMode ?? detectWorkMode(input.location) ?? text.workMode ?? null, jobType: input.jobType ?? text.jobType ?? null,
    postedAt: input.postedAt ? new Date(input.postedAt) : null, deadline: input.deadline ? new Date(input.deadline) : null,
    applyUrl: input.applyUrl, source: opts.source ?? "manual", sourceJobId: normalizeUrl(input.applyUrl) ?? `manual:${crypto.randomUUID()}`, sourceUrl: opts.sourceUrl ?? input.applyUrl, discoveredAt: new Date(),
  };
  const r = await upsertDiscoveredJob(userId, nj, { platform: opts.source ?? "manual" });
  if (!r.created) {
    const [c] = await db.select({ title: jobs.title, name: companies.name }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(eq(jobs.id, r.jobId));
    throw new HttpError(409, `This job already exists (${c?.title} at ${c?.name}).`, { existingJobId: r.jobId });
  }
  if (input.notes) await db.update(jobs).set({ notes: input.notes }).where(eq(jobs.id, r.jobId));
  return { jobId: r.jobId };
}

export async function requireOwnedJob(userId: string, jobId: string) {
  if (!isUuid(jobId)) throw new HttpError(404, "Job not found");
  const [j] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!j) throw new HttpError(404, "Job not found");
  return j;
}

export async function updateJob(userId: string, jobId: string, patch: Partial<Omit<typeof jobs.$inferInsert, "id" | "userId">>) {
  const cur = await requireOwnedJob(userId, jobId);
  const set: Partial<typeof jobs.$inferInsert> = { ...patch };
  const p = patch as Record<string, unknown>;
  if (typeof p.postedAt === "string") set.postedAt = new Date(p.postedAt as string);
  if (typeof p.deadline === "string") set.deadline = new Date(p.deadline as string);
  if ("applyUrl" in patch) set.normalizedUrl = normalizeUrl(patch.applyUrl ?? null);
  if (patch.title !== undefined) {
    const [c] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, cur.companyId));
    const fp = makeFingerprint(c?.name ?? "", patch.title, patch.location !== undefined ? patch.location : cur.location);
    if (fp !== cur.fingerprint) {
      const [clash] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.fingerprint, fp)));
      if (clash && clash.id !== jobId) throw new HttpError(409, "Another job with the same company, title and location already exists.", { existingJobId: clash.id });
      set.fingerprint = fp;
    }
  } else if (patch.location !== undefined) {
    const [c] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, cur.companyId));
    const fp = makeFingerprint(c?.name ?? "", cur.title, patch.location);
    if (fp !== cur.fingerprint) {
      const [clash] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.fingerprint, fp)));
      if (clash && clash.id !== jobId) throw new HttpError(409, "Another job with the same company, title and location already exists.", { existingJobId: clash.id });
      set.fingerprint = fp;
    }
  }
  if (!Object.keys(set).length) return cur;
  const [row] = await db.update(jobs).set(set).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId))).returning();
  return row;
}

export async function deleteJob(userId: string, jobId: string) {
  await requireOwnedJob(userId, jobId);
  await db.delete(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
}

export async function setShortlisted(userId: string, jobId: string, shortlisted?: boolean) {
  const j = await requireOwnedJob(userId, jobId);
  const next = shortlisted ?? !j.shortlisted;
  if (next) {
    if (j.status === "discovered") await setJobStatus(userId, jobId, "shortlisted");
    else await db.update(jobs).set({ shortlisted: true }).where(eq(jobs.id, jobId));
  } else {
    await db.update(jobs).set({ shortlisted: false, ...(j.status === "shortlisted" ? { status: "discovered" as const } : {}) }).where(eq(jobs.id, jobId));
    await logActivity(userId, jobId, "status", "Removed from shortlist");
  }
  return { shortlisted: next };
}

// ------------------------------------------------------------------ search
export async function searchJobs(userId: string, f: JobFilters): Promise<JobSearchResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20));
  const thresholds = (await getSettings(userId)).thresholds;

  const conds: (SQL | undefined)[] = [eq(jobs.userId, userId)];
  const like = (s: string) => `%${s.replace(/[%_\\]/g, "\\$&")}%`;
  if (f.q) conds.push(or(ilike(jobs.title, like(f.q)), ilike(companies.name, like(f.q)), ilike(jobs.description, like(f.q)), ilike(jobs.location, like(f.q))));
  if (f.company) conds.push(ilike(companies.name, like(f.company)));
  if (f.location) conds.push(ilike(jobs.location, like(f.location)));
  if (f.source) conds.push(exists(db.select({ x: sql`1` }).from(jobSources).where(and(eq(jobSources.jobId, jobs.id), eq(jobSources.source, f.source)))));
  if (f.status) conds.push(eq(jobs.status, f.status as typeof jobs.$inferSelect.status));
  if (f.workMode) conds.push(eq(jobs.workMode, f.workMode));
  if (f.jobType) conds.push(eq(jobs.jobType, f.jobType));
  if (f.fullTimeOnly) conds.push(or(eq(jobs.jobType, "full_time"), isNull(jobs.jobType)));
  if (f.minScore !== undefined) conds.push(gte(jobMatches.score, f.minScore));
  if (f.maxScore !== undefined) conds.push(lte(jobMatches.score, f.maxScore));
  if (f.category === "excellent") conds.push(gte(jobMatches.score, thresholds.excellent));
  if (f.category === "good") conds.push(and(gte(jobMatches.score, thresholds.good), lte(jobMatches.score, thresholds.excellent - 1)));
  if (f.category === "low") conds.push(lte(jobMatches.score, thresholds.good - 1));
  // Salary filters exclude jobs with Unknown salary (they cannot be shown to satisfy the filter).
  if (f.minSalary !== undefined) conds.push(sql`coalesce(${jobs.salaryMax}, ${jobs.salaryMin}) >= ${f.minSalary}`);
  if (f.maxSalary !== undefined) conds.push(sql`coalesce(${jobs.salaryMin}, ${jobs.salaryMax}) <= ${f.maxSalary}`);
  // Experience: Unknown requirement is kept (not provably above the limit).
  if (f.maxExperience !== undefined) conds.push(or(isNull(jobs.experienceMin), lte(jobs.experienceMin, f.maxExperience)));
  const dateExpr = sql`coalesce(${jobs.postedAt}, ${jobs.discoveredAt})`;
  if (f.postedAfter) conds.push(sql`${dateExpr} >= ${new Date(f.postedAfter)}`);
  if (f.postedBefore) conds.push(sql`${dateExpr} <= ${new Date(f.postedBefore)}`);
  if (f.shortlisted !== undefined) conds.push(eq(jobs.shortlisted, f.shortlisted));
  if (f.active !== undefined) conds.push(eq(jobs.isActive, f.active));
  const where = and(...conds);

  const order = f.sort === "oldest" ? [asc(dateExpr)]
    : f.sort === "score" ? [sql`${jobMatches.score} desc nulls last`, desc(dateExpr)]
    : f.sort === "salary" ? [sql`coalesce(${jobs.salaryMax}, ${jobs.salaryMin}) desc nulls last`, desc(dateExpr)]
    : f.sort === "company" ? [asc(companies.name), desc(dateExpr)]
    : [desc(dateExpr)];

  const base = db.select({ n: sql<number>`count(*)::int` }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId))).where(where);
  const [{ n: total }] = await base;

  const rows = await db.select({
    j: jobs, companyName: companies.name, score: jobMatches.score,
    contactCount: sql<number>`(select count(*)::int from ${recruiters} where ${recruiters.companyId} = ${jobs.companyId} and ${recruiters.userId} = ${userId})`,
  }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);

  const ids = rows.map((r) => r.j.id);
  const srcRows = ids.length ? await db.select({ jobId: jobSources.jobId, source: jobSources.source }).from(jobSources).where(and(eq(jobSources.userId, userId), inArray(jobSources.jobId, ids))) : [];
  const srcMap = new Map<string, string[]>();
  for (const s of srcRows) srcMap.set(s.jobId, [...new Set([...(srcMap.get(s.jobId) ?? []), s.source])]);

  const items: JobListItem[] = rows.map(({ j, companyName, score, contactCount }) => ({
    id: j.id, title: j.title, companyId: j.companyId, companyName, location: j.location, workMode: j.workMode, jobType: j.jobType,
    salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryCurrency: j.salaryCurrency, salaryText: j.salaryText,
    experienceMin: j.experienceMin, experienceMax: j.experienceMax, experienceText: j.experienceText,
    postedAt: j.postedAt?.toISOString() ?? null, discoveredAt: j.discoveredAt.toISOString(), applyUrl: j.applyUrl,
    status: j.status, shortlisted: j.shortlisted, isActive: j.isActive, expiredAt: j.expiredAt?.toISOString() ?? null,
    matchScore: score ?? null, matchCategory: score == null ? null : catOf(score, thresholds), contactCount: Number(contactCount), sources: srcMap.get(j.id) ?? [],
  }));
  return { items, total, page, pageSize, thresholds };
}

export async function getFacets(userId: string) {
  const [sources, statuses, modes, types] = await Promise.all([
    db.select({ v: jobSources.source, n: sql<number>`count(distinct ${jobSources.jobId})::int` }).from(jobSources).where(eq(jobSources.userId, userId)).groupBy(jobSources.source),
    db.select({ v: jobs.status, n: sql<number>`count(*)::int` }).from(jobs).where(eq(jobs.userId, userId)).groupBy(jobs.status),
    db.select({ v: jobs.workMode, n: sql<number>`count(*)::int` }).from(jobs).where(eq(jobs.userId, userId)).groupBy(jobs.workMode),
    db.select({ v: jobs.jobType, n: sql<number>`count(*)::int` }).from(jobs).where(eq(jobs.userId, userId)).groupBy(jobs.jobType),
  ]);
  return { sources, statuses, workModes: modes, jobTypes: types };
}

// ------------------------------------------------------------------ detail
export async function getJobDetail(userId: string, jobId: string): Promise<JobDetailData> {
  const j = await requireOwnedJob(userId, jobId);
  const [company] = await db.select().from(companies).where(eq(companies.id, j.companyId));
  const thresholds = (await getSettings(userId)).thresholds;
  const [skillRows, prov, [m], contacts, emails, convs, timeline, [app]] = await Promise.all([
    db.select({ name: skills.name, required: jobSkills.required }).from(jobSkills).innerJoin(skills, eq(skills.id, jobSkills.skillId)).where(eq(jobSkills.jobId, jobId)),
    db.select().from(jobSources).where(and(eq(jobSources.jobId, jobId), eq(jobSources.userId, userId))).orderBy(asc(jobSources.discoveredAt)),
    db.select().from(jobMatches).where(and(eq(jobMatches.jobId, jobId), eq(jobMatches.userId, userId))),
    db.select().from(recruiters).where(and(eq(recruiters.companyId, j.companyId), eq(recruiters.userId, userId))).orderBy(desc(recruiters.createdAt)),
    db.select().from(emailOutreach).where(and(eq(emailOutreach.jobId, jobId), eq(emailOutreach.userId, userId))).orderBy(desc(emailOutreach.createdAt)),
    db.select().from(emailConversations).where(and(eq(emailConversations.jobId, jobId), eq(emailConversations.userId, userId))).orderBy(desc(emailConversations.receivedAt)),
    db.select().from(activityLog).where(and(eq(activityLog.jobId, jobId), eq(activityLog.userId, userId))).orderBy(desc(activityLog.createdAt)).limit(100),
    db.select().from(applications).where(and(eq(applications.jobId, jobId), eq(applications.userId, userId))),
  ]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    job: {
      id: j.id, title: j.title, description: j.description, location: j.location, workMode: j.workMode, jobType: j.jobType,
      salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryCurrency: j.salaryCurrency, salaryText: j.salaryText,
      experienceMin: j.experienceMin, experienceMax: j.experienceMax, experienceText: j.experienceText,
      postedAt: iso(j.postedAt), deadline: iso(j.deadline), applyUrl: j.applyUrl, status: j.status, shortlisted: j.shortlisted,
      isActive: j.isActive, expiredAt: iso(j.expiredAt), lastCheckedAt: iso(j.lastCheckedAt), followUpDate: iso(j.followUpDate),
      interview: j.interview ?? null, notes: j.notes, discoveredAt: j.discoveredAt.toISOString(),
    },
    company: { id: company.id, name: company.name, domain: company.domain, website: company.website, careersUrl: company.careersUrl, contactUrl: company.contactUrl },
    skills: skillRows,
    provenance: prov.map((p) => ({ source: p.source, platform: p.platform, sourceJobId: p.sourceJobId, sourceUrl: p.sourceUrl, discoveredAt: p.discoveredAt.toISOString() })),
    match: m ? { score: m.score, category: catOf(m.score, thresholds), matchingSkills: m.matchingSkills, missingSkills: m.missingSkills, optionalMissingSkills: m.optionalMissingSkills, details: m.details, recommendation: m.recommendation, explanation: m.explanation, recommendedResumeId: m.recommendedResumeId, engine: m.engine, model: m.model } : null,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, designation: c.designation, email: c.email, profileUrl: c.profileUrl, verification: c.verification, doNotContact: c.doNotContact })),
    emails: emails.map((e) => ({ id: e.id, kind: e.kind, subject: e.subject, status: e.status, toEmail: e.toEmail, createdAt: e.createdAt.toISOString(), sentAt: iso(e.sentAt) })),
    conversations: convs.map((c) => ({ id: c.id, category: c.category, subject: c.subject, fromAddress: c.fromAddress, receivedAt: iso(c.receivedAt) })),
    timeline: timeline.map((t) => ({ id: t.id, kind: t.kind, title: t.title, detail: t.detail, createdAt: t.createdAt.toISOString() })),
    application: app ? { id: app.id, method: app.method, appliedAt: app.appliedAt.toISOString(), notes: app.notes } : null,
    thresholds,
  };
}

// ------------------------------------------------------------------ saved searches
export async function listSavedSearches(userId: string) {
  return db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt));
}
export async function createSavedSearch(userId: string, name: string, filters: Record<string, unknown>) {
  const [row] = await db.insert(savedSearches).values({ userId, name, filters }).returning();
  return row;
}
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export async function updateSavedSearch(userId: string, id: string, patch: { name?: string; filters?: Record<string, unknown> }) {
  if (!isUuid(id)) throw new HttpError(404, "Saved search not found");
  const [row] = await db.update(savedSearches).set(patch).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId))).returning();
  if (!row) throw new HttpError(404, "Saved search not found");
  return row;
}
export async function deleteSavedSearch(userId: string, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "Saved search not found");
  const r = await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId))).returning({ id: savedSearches.id });
  if (!r.length) throw new HttpError(404, "Saved search not found");
}
