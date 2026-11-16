import { cn } from "@/lib/utils";
export type MatchCategory = "excellent" | "good" | "low";
export function categorize(score: number, t: { excellent: number; good: number } = { excellent: 80, good: 60 }): MatchCategory {
  return score >= t.excellent ? "excellent" : score >= t.good ? "good" : "low";
}
const COLORS: Record<MatchCategory, string> = {
  excellent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  good: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};
export function ScoreBadge({ score, thresholds, className }: { score: number | null | undefined; thresholds?: { excellent: number; good: number }; className?: string }) {
  if (score == null) return <span className={cn("inline-flex rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground", className)}>Not scored</span>;
  const c = categorize(score, thresholds);
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", COLORS[c], className)}>{score}% · {c}</span>;
}
