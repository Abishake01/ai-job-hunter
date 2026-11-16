export type Count = { name: string; value: number };

export function countBy<T>(items: T[], key: (t: T) => string | null | undefined, fallback = "Unknown"): Count[] {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it) || fallback; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Percentage with 1 decimal; null when denominator is 0 (Unknown, never 0%/NaN). */
export function pct(n: number, d: number): number | null { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }

const ROLE_RULES: [RegExp, string][] = [
  [/full[\s-]?stack/i, "Full Stack"], [/\b(ai|ml|machine learning|llm|genai|generative|data scien)/i, "AI / ML"],
  [/python|django|fastapi|flask/i, "Python"], [/back[\s-]?end|server[\s-]?side|api engineer|node/i, "Backend"],
  [/front[\s-]?end|react|ui engineer|web developer/i, "Frontend"], [/devops|cloud|sre|platform|infrastructure/i, "DevOps / Cloud"],
  [/mobile|android|ios|react native|flutter/i, "Mobile"], [/\bqa\b|test|sdet/i, "QA"], [/data (engineer|analyst)|analytics|bi\b/i, "Data"],
  [/software|developer|engineer|programmer/i, "Software Engineer"],
];
export function roleBucket(title: string): string {
  for (const [re, label] of ROLE_RULES) if (re.test(title)) return label;
  return "Other";
}

/** Monday (UTC) of the week containing d, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export type WeeklyPoint = { week: string; discovered: number; applied: number; emailsSent: number };
/** Fixed `weeks` buckets ending with the week of `now`, zero-filled. */
export function weeklyBuckets(series: { discovered: Date[]; applied: Date[]; emailsSent: Date[] }, now: Date, weeks = 12): WeeklyPoint[] {
  const out: WeeklyPoint[] = [];
  const end = new Date(weekStart(now) + "T00:00:00Z");
  for (let i = weeks - 1; i >= 0; i--) { const w = new Date(end); w.setUTCDate(w.getUTCDate() - 7 * i); out.push({ week: w.toISOString().slice(0, 10), discovered: 0, applied: 0, emailsSent: 0 }); }
  const idx = new Map(out.map((p, i) => [p.week, i]));
  (["discovered", "applied", "emailsSent"] as const).forEach((k) => {
    for (const d of series[k]) { const i = idx.get(weekStart(d)); if (i !== undefined) out[i][k]++; }
  });
  return out;
}

export type SentLite = { jobId: string; sentAt: Date };
export type ReplyLite = { jobId: string | null; receivedAt: Date | null; category: string };
const REPLY = new Set(["recruiter_message", "interview_invite", "rejection", "selection", "follow_up"]);
/** Share of distinct emailed jobs that got any reply after the email was sent. */
export function responseRate(sent: SentLite[], replies: ReplyLite[]) {
  const jobs = new Map<string, Date>();
  for (const s of sent) { const c = jobs.get(s.jobId); if (!c || s.sentAt < c) jobs.set(s.jobId, s.sentAt); }
  let replied = 0;
  for (const [jobId, at] of jobs) if (replies.some((r) => r.jobId === jobId && REPLY.has(r.category) && r.receivedAt && r.receivedAt > at)) replied++;
  return { sent: jobs.size, replied, rate: pct(replied, jobs.size) };
}

/** Interview conversion = jobs that reached interview/selected / jobs applied-or-emailed (engaged). */
export function interviewConversion(statusCounts: Record<string, number>) {
  const interviews = (statusCounts.interview_scheduled ?? 0) + (statusCounts.selected ?? 0);
  const engaged = interviews + ["applied", "email_sent", "follow_up_required", "rejected"].reduce((a, k) => a + (statusCounts[k] ?? 0), 0);
  return { interviews, engaged, rate: pct(interviews, engaged) };
}

export const STATUS_ORDER = ["discovered", "shortlisted", "ready_to_apply", "applied", "cold_email_drafted", "email_sent", "follow_up_required", "interview_scheduled", "selected", "rejected", "not_interested"];
export function orderStatuses(counts: Record<string, number>): Count[] {
  return STATUS_ORDER.map((name) => ({ name, value: counts[name] ?? 0 }));
}
