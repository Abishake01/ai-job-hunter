/** Local hour (0-23) in tz. */
export function hourInTz(d: Date, tz: string): number {
  try { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d)) % 24; } catch { return d.getUTCHours(); }
}
export const isWorkflowDue = (now: Date, hour: number, tz: string) => hourInTz(now, tz) === hour;
