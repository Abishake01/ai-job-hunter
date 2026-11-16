/** Adds N business days (Mon–Fri) to a date. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) left--; }
  return d;
}
export function businessDaysBetween(a: Date, b: Date): number {
  let n = 0; const d = new Date(a);
  while (d < b) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
