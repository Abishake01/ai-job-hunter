export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "Unknown";
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Unknown");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "Unknown");
export const SOURCE_LABELS: Record<string, string> = { remotive: "Remotive", arbeitnow: "Arbeitnow", remoteok: "Remote OK", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", adzuna: "Adzuna", jooble: "Jooble", rss: "RSS", gmail: "Gmail alert", manual: "Manual", "import-url": "Imported URL" };
export const sourceLabel = (k: string) => SOURCE_LABELS[k] ?? k;
