import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs, jobSources, recruiters, recruiterSources, unsubscribes } from "@/lib/db/schema";
import { HttpError } from "@/lib/auth/session";
import { decryptJson } from "@/lib/utils/crypto";
import { logActivity } from "@/lib/services/activity.service";
import { getSettings } from "@/lib/services/profile.service";
import { getIntegration } from "@/lib/services/settings.service";
import { baselineVerification, computeVerification, inferEmail, providerResultToDeliverable, type SourceType, type Verification } from "@/lib/recruiters/verify";
import { crawlCompanySite, deriveCompanyDomain, extractContactsFromText, type ContactCandidate } from "@/lib/recruiters/discover";

const RANK: Record<string, number> = { verified: 3, public: 2, inferred: 1, unknown: 0 };
export type Recruiter = typeof recruiters.$inferSelect;
export type RecruiterWithSources = Recruiter & { sources: { id: string; sourceUrl: string; sourceType: string; note: string | null; capturedAt: Date }[]; companyName?: string; jobTitle?: string | null };

export async function isEmailBlocked(userId: string, email: string | null | undefined): Promise<{ unsubscribed: boolean; doNotContact: boolean }> {
  if (!email) return { unsubscribed: false, doNotContact: false };
  const e = email.trim().toLowerCase();
  const [u] = await db.select({ id: unsubscribes.id }).from(unsubscribes).where(and(eq(unsubscribes.userId, userId), eq(unsubscribes.email, e))).limit(1);
  const [d] = await db.select({ id: recruiters.id }).from(recruiters).where(and(eq(recruiters.userId, userId), sql`lower(${recruiters.email}) = ${e}`, eq(recruiters.doNotContact, true))).limit(1);
  return { unsubscribed: !!u, doNotContact: !!d };
}

export type UpsertInput = {
  companyId: string; jobId?: string | null; name?: string | null; designation?: string | null; email?: string | null; profileUrl?: string | null; notes?: string | null;
  /** Provenance is mandatory: every contact has a source URL. */
  source: { url: string; type: SourceType; note?: string | null };
  verification?: Verification;
};

/** Create-or-merge a contact (dedupe by company+email, else company+name) and record provenance. Never lowers an existing verification. */
export async function upsertRecruiter(userId: string, i: UpsertInput): Promise<Recruiter> {
  if (!i.source?.url) throw new HttpError(400, "A source URL is required for every contact");
  const [c] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, i.companyId), eq(companies.userId, userId)));
  if (!c) throw new HttpError(404, "Company not found");
  const email = i.email?.trim().toLowerCase() || null;
  const name = i.name?.trim() || null;
  if (!email && !name) throw new HttpError(400, "A contact needs an email or a name");
  const verification = i.verification ?? baselineVerification(i.source.type);
  let existing: Recruiter | undefined;
  if (email) [existing] = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.companyId, i.companyId), sql`lower(${recruiters.email}) = ${email}`));
  else [existing] = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.companyId, i.companyId), sql`${recruiters.email} is null`, sql`lower(${recruiters.name}) = ${name!.toLowerCase()}`));
  const blocked = await isEmailBlocked(userId, email);
  let row: Recruiter;
  if (existing) {
    const patch: Partial<typeof recruiters.$inferInsert> = {};
    if (!existing.name && name) patch.name = name;
    if (!existing.designation && i.designation) patch.designation = i.designation;
    if (!existing.email && email) patch.email = email;
    if (!existing.profileUrl && i.profileUrl) patch.profileUrl = i.profileUrl;
    if (!existing.jobId && i.jobId) patch.jobId = i.jobId;
    if ((RANK[verification] ?? 0) > (RANK[existing.verification] ?? 0)) patch.verification = verification;
    if (blocked.unsubscribed && !existing.doNotContact) patch.doNotContact = true;
    [row] = Object.keys(patch).length ? await db.update(recruiters).set(patch).where(eq(recruiters.id, existing.id)).returning() : [existing];
  } else {
    [row] = await db.insert(recruiters).values({ userId, companyId: i.companyId, jobId: i.jobId ?? null, name, designation: i.designation ?? null, email, profileUrl: i.profileUrl ?? null, notes: i.notes ?? null, verification, doNotContact: blocked.unsubscribed || blocked.doNotContact }).returning();
  }
  const [dupSrc] = await db.select({ id: recruiterSources.id }).from(recruiterSources).where(and(eq(recruiterSources.recruiterId, row.id), eq(recruiterSources.sourceUrl, i.source.url), eq(recruiterSources.sourceType, i.source.type))).limit(1);
  if (!dupSrc) await db.insert(recruiterSources).values({ recruiterId: row.id, sourceUrl: i.source.url, sourceType: i.source.type, note: i.source.note ?? null });
  return row;
}

async function withSources(rows: (Recruiter & { companyName?: string; jobTitle?: string | null })[]): Promise<RecruiterWithSources[]> {
  if (!rows.length) return [];
  const src = await db.select().from(recruiterSources).where(inArray(recruiterSources.recruiterId, rows.map((r) => r.id))).orderBy(asc(recruiterSources.capturedAt));
  return rows.map((r) => ({ ...r, sources: src.filter((s) => s.recruiterId === r.id).map(({ recruiterId: _r, ...s }) => s) }));
}

export type RecruiterFilters = { q?: string; companyId?: string; jobId?: string; verification?: string; page?: number; pageSize?: number };
export async function listRecruiters(userId: string, f: RecruiterFilters = {}) {
  const page = Math.max(1, f.page ?? 1), pageSize = Math.min(100, f.pageSize ?? 25);
  let companyId = f.companyId;
  if (f.jobId) { const [j] = await db.select({ c: jobs.companyId }).from(jobs).where(and(eq(jobs.id, f.jobId), eq(jobs.userId, userId))); if (!j) throw new HttpError(404, "Job not found"); companyId = j.c; } // job filter => all contacts at the job's company
  const where = and(
    eq(recruiters.userId, userId), companyId ? eq(recruiters.companyId, companyId) : undefined,
    f.verification ? eq(recruiters.verification, f.verification) : undefined,
    f.q ? or(ilike(recruiters.name, `%${f.q}%`), ilike(recruiters.email, `%${f.q}%`), ilike(companies.name, `%${f.q}%`), ilike(recruiters.designation, `%${f.q}%`)) : undefined,
  );
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(recruiters).innerJoin(companies, eq(companies.id, recruiters.companyId)).where(where);
  const rows = await db.select({ r: recruiters, companyName: companies.name, jobTitle: jobs.title }).from(recruiters)
    .innerJoin(companies, eq(companies.id, recruiters.companyId)).leftJoin(jobs, eq(jobs.id, recruiters.jobId))
    .where(where).orderBy(desc(recruiters.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items: await withSources(rows.map((x) => ({ ...x.r, companyName: x.companyName, jobTitle: x.jobTitle }))), total: n, page, pageSize };
}

export async function getRecruiter(userId: string, id: string): Promise<RecruiterWithSources> {
  const [r] = await db.select().from(recruiters).where(and(eq(recruiters.id, id), eq(recruiters.userId, userId)));
  if (!r) throw new HttpError(404, "Contact not found");
  return (await withSources([r]))[0];
}

export async function createRecruiterManual(userId: string, i: { companyId?: string; companyName?: string; jobId?: string | null; name?: string | null; designation?: string | null; email?: string | null; profileUrl?: string | null; sourceUrl?: string | null; notes?: string | null }) {
  let companyId = i.companyId;
  if (!companyId && i.jobId) { const [j] = await db.select({ c: jobs.companyId }).from(jobs).where(and(eq(jobs.id, i.jobId), eq(jobs.userId, userId))); companyId = j?.c; }
  if (!companyId && i.companyName) {
    const norm = i.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const [c] = await db.insert(companies).values({ userId, name: i.companyName.trim(), normalizedName: norm }).onConflictDoUpdate({ target: [companies.userId, companies.normalizedName], set: { name: sql`${companies.name}` } }).returning();
    companyId = c.id;
  }
  if (!companyId) throw new HttpError(400, "companyId, jobId or companyName is required");
  if (i.jobId) { const [j] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, i.jobId), eq(jobs.userId, userId))); if (!j) throw new HttpError(404, "Job not found"); }
  // Manual entries are the user's own data: provenance is the user-supplied URL, or an explicit "entered manually" marker.
  return upsertRecruiter(userId, { companyId, jobId: i.jobId ?? null, name: i.name, designation: i.designation, email: i.email, profileUrl: i.profileUrl, notes: i.notes, source: { url: i.sourceUrl || "manual://entered-by-user", type: "manual", note: i.sourceUrl ? "Source URL supplied by user" : "Entered manually by the user (unverified)" } });
}

export async function updateRecruiter(userId: string, id: string, patch: { name?: string | null; designation?: string | null; email?: string | null; profileUrl?: string | null; notes?: string | null; doNotContact?: boolean }) {
  const cur = await getRecruiter(userId, id);
  const set: Partial<typeof recruiters.$inferInsert> = {};
  for (const k of ["name", "designation", "profileUrl", "notes", "doNotContact"] as const) if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  if (patch.email !== undefined) {
    const e = patch.email?.trim().toLowerCase() || null;
    if (e !== (cur.email?.toLowerCase() ?? null)) { set.email = e; set.verification = "unknown"; set.verifiedAt = null; } // changed address => previous label no longer applies
    if (e && !cur.sources.some((s) => s.sourceType === "manual")) await db.insert(recruiterSources).values({ recruiterId: id, sourceUrl: "manual://entered-by-user", sourceType: "manual", note: "Email edited by the user" });
  }
  if (!Object.keys(set).length) return cur;
  await db.update(recruiters).set(set).where(and(eq(recruiters.id, id), eq(recruiters.userId, userId)));
  return getRecruiter(userId, id);
}

export async function deleteRecruiter(userId: string, id: string) {
  await getRecruiter(userId, id);
  await db.delete(recruiters).where(and(eq(recruiters.id, id), eq(recruiters.userId, userId)));
  return { deleted: true };
}

/** Provider-backed deliverability check (Hunter / ZeroBounce key from Settings). The ONLY path to "verified". */
export async function verifyRecruiterEmail(userId: string, id: string) {
  const r = await getRecruiter(userId, id);
  if (!r.email) throw new HttpError(400, "This contact has no email to verify");
  const provider = (await getSettings(userId)).emailVerification.provider;
  if (provider === "none") throw new HttpError(400, "No email-verification provider selected. Choose Hunter or ZeroBounce in Settings → Email verification.");
  const integ = await getIntegration(userId, provider);
  const key = integ?.secretsEnc ? decryptJson<{ apiKey?: string }>(integ.secretsEnc).apiKey : null;
  if (!key) throw new HttpError(400, `No ${provider} API key saved. Add it in Settings → Email verification.`);
  const url = provider === "hunter"
    ? `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(r.email)}&api_key=${encodeURIComponent(key)}`
    : `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(r.email)}`;
  let json: unknown;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`${provider} responded ${res.status}`);
    json = await res.json();
  } catch (e) { throw new HttpError(502, `Verification failed: ${e instanceof Error ? e.message.replace(key, "***") : "error"}`); }
  const deliverable = providerResultToDeliverable(provider, json);
  const verification = computeVerification(r.verification as Verification, deliverable);
  await db.update(recruiters).set({ verification, verifiedAt: deliverable === true ? new Date() : null }).where(eq(recruiters.id, id));
  return { recruiter: await getRecruiter(userId, id), provider, deliverable, note: deliverable === null ? "Provider result was inconclusive (e.g. catch-all); label unchanged." : undefined };
}

export type FindContactsResult = { contacts: RecruiterWithSources[]; added: number; domain: string | null; careersUrl: string | null; contactUrl: string | null; notes: string[] };

/**
 * Discovers contacts for a job from permitted public sources (job-ad text, the company's own public pages with robots.txt,
 * Gmail-sourced ones already stored). Falls back to careers/contact URLs. Idempotent.
 */
export async function findContactsForJob(userId: string, jobId: string): Promise<FindContactsResult> {
  const [row] = await db.select({ job: jobs, company: companies }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  if (!row) throw new HttpError(404, "Job not found");
  const { job, company } = row;
  const notes: string[] = [];
  const before = new Set((await db.select({ id: recruiters.id }).from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.companyId, company.id)))).map((r) => r.id));
  const srcUrls = (await db.select({ u: jobSources.sourceUrl }).from(jobSources).where(and(eq(jobSources.userId, userId), eq(jobSources.jobId, jobId)))).map((s) => s.u);

  // 1) job-ad text (provenance = the ad URL)
  const adUrl = job.applyUrl ?? srcUrls.find((u): u is string => !!u) ?? null;
  const found: ContactCandidate[] = [];
  if (job.description) {
    if (adUrl) found.push(...extractContactsFromText(job.description, { sourceUrl: adUrl, sourceType: "job_ad" }));
    else notes.push("Job ad has no URL, so contacts in its text were not recorded (a source URL is required).");
  }
  // 2) company public pages
  const domain = company.domain ?? deriveCompanyDomain([company.website, job.applyUrl, ...srcUrls]);
  let careersUrl = company.careersUrl, contactUrl = company.contactUrl;
  if (domain) {
    const crawl = await crawlCompanySite(domain, { careersUrl, contactUrl });
    found.push(...crawl.candidates);
    careersUrl ??= crawl.careersUrl; contactUrl ??= crawl.contactUrl;
    for (const s of crawl.skipped) if (s.reason.startsWith("robots")) notes.push(`Skipped ${s.url}: ${s.reason}`);
    if (!crawl.fetched.length) notes.push(`Could not read any public page on ${domain}.`);
  } else notes.push("Company website could not be derived from the apply URL (ATS/job-board link); add the company website to look at its public pages.");

  for (const c of found) {
    await upsertRecruiter(userId, { companyId: company.id, jobId, name: c.name, designation: c.designation, email: c.email, source: { url: c.sourceUrl, type: c.sourceType, note: c.generic ? "Generic mailbox published on the page" : null } });
  }
  // 3) labelled pattern guesses for named contacts without an email (needs an observed public name+email pair)
  if (domain) {
    const all = await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.companyId, company.id)));
    const observed = all.flatMap((r) => (r.email && (r.verification === "public" || r.verification === "verified") ? [{ name: r.name, email: r.email }] : []));
    for (const r of all.filter((x) => x.name && !x.email && !x.doNotContact)) {
      const g = inferEmail(r.name!, domain, observed);
      if (!g) continue;
      const basis = (await db.select().from(recruiterSources).innerJoin(recruiters, eq(recruiters.id, recruiterSources.recruiterId)).where(and(eq(recruiters.userId, userId), eq(recruiters.email, g.basedOn))).limit(1))[0]?.recruiter_sources;
      if (!basis) continue;
      await db.update(recruiters).set({ email: g.email, verification: "inferred" }).where(eq(recruiters.id, r.id));
      await db.insert(recruiterSources).values({ recruiterId: r.id, sourceUrl: basis.sourceUrl, sourceType: "pattern", note: `Guessed from the ${g.pattern} pattern seen in ${g.basedOn}; not verified` });
    }
  }
  const patch: Partial<typeof companies.$inferInsert> = {};
  if (domain && !company.domain) patch.domain = domain;
  if (careersUrl && !company.careersUrl) patch.careersUrl = careersUrl;
  if (contactUrl && !company.contactUrl) patch.contactUrl = contactUrl;
  if (Object.keys(patch).length) await db.update(companies).set(patch).where(eq(companies.id, company.id));

  const contacts = (await db.select().from(recruiters).where(and(eq(recruiters.userId, userId), eq(recruiters.companyId, company.id))).orderBy(desc(recruiters.createdAt)));
  const withSrc = (await withSources(contacts)).sort((a, b) => (RANK[b.verification] ?? 0) - (RANK[a.verification] ?? 0));
  const added = withSrc.filter((c) => !before.has(c.id)).length;
  if (!withSrc.length) notes.push(`No public contact found. Use the company's ${contactUrl ? "contact page" : careersUrl ? "careers page" : "website"} directly${careersUrl ? `: ${careersUrl}` : ""}${contactUrl ? ` / ${contactUrl}` : ""}.`);
  await logActivity(userId, jobId, "contact", `Contact search: ${withSrc.length} contact(s), ${added} new`, notes.join(" ") || null, { added, domain });
  return { contacts: withSrc, added, domain, careersUrl: careersUrl ?? null, contactUrl: contactUrl ?? null, notes };
}
