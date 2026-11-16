export type ReportData = {
  date: string;
  newJobs: number; matchedJobs: number; excellentMatches: number; goodMatches: number;
  contactsFound: number; draftsCreated: number; pendingFollowUps: number; applicationsTotal: number; interviews: number;
  topMatches: { jobId: string; title: string; company: string; score: number }[];
  workflow?: { name: string; status: string; detail?: string }[];
};

/** YYYY-MM-DD in the given IANA timezone. */
export function dateInTz(d: Date, tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}

export function formatReportSummary(r: ReportData): string {
  const lines = [
    `Daily report for ${r.date}`,
    `- ${r.newJobs} new job${r.newJobs === 1 ? "" : "s"} discovered; ${r.matchedJobs} scored (${r.excellentMatches} excellent, ${r.goodMatches} good).`,
    `- ${r.contactsFound} HR contact${r.contactsFound === 1 ? "" : "s"} found; ${r.draftsCreated} email draft${r.draftsCreated === 1 ? "" : "s"} waiting for your review (nothing is sent automatically).`,
    `- ${r.pendingFollowUps} pending follow-up${r.pendingFollowUps === 1 ? "" : "s"}; ${r.interviews} interview${r.interviews === 1 ? "" : "s"} scheduled; ${r.applicationsTotal} application${r.applicationsTotal === 1 ? "" : "s"} tracked.`,
  ];
  if (r.topMatches.length) lines.push(`- Top matches: ${r.topMatches.map((m) => `${m.title} @ ${m.company} (${m.score}%)`).join("; ")}.`);
  const failed = (r.workflow ?? []).filter((s) => s.status === "failed");
  if (failed.length) lines.push(`- Steps with problems: ${failed.map((s) => `${s.name}${s.detail ? ` (${s.detail})` : ""}`).join("; ")}.`);
  return lines.join("\n");
}
