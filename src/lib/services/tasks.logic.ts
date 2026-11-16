/** Exponential backoff with cap: attempt 1 → 1s, 2 → 4s, 3 → 16s ... (max 60s). */
export function backoffMs(attempt: number, baseMs = 1000): number {
  return Math.min(60_000, baseMs * 4 ** Math.max(0, attempt - 1));
}
export const STALE_RUNNING_MS = 10 * 60_000;
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export function isStale(startedAt: Date | null, now = new Date(), ms = STALE_RUNNING_MS) { return !!startedAt && now.getTime() - startedAt.getTime() > ms; }
