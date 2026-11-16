export type AppRow = {
  id: string; title: string; company: string; status: string; applyUrl: string | null; score: number | null;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryText: string | null;
  location: string | null; workMode: string | null; appliedAt: string | null; applicationMethod: string | null;
  recruiter: { id: string; name: string | null; email: string | null; verification: string } | null;
  emailStatus: string | null; followUpDate: string | null;
  interview: { date?: string; mode?: string; link?: string; notes?: string } | null; notes: string | null; updatedAt: string;
};
export function salaryLabel(r: Pick<AppRow, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryText">) {
  if (r.salaryMin == null && r.salaryMax == null) return r.salaryText ?? "Unknown";
  const cur = r.salaryCurrency ?? "";
  return `${cur} ${r.salaryMin ?? "?"}–${r.salaryMax ?? "?"}/mo`.trim();
}
