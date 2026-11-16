import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysBetween } from "./business-days";

describe("business days", () => {
  it("adds across a weekend", () => { expect(addBusinessDays(new Date(2026, 10, 6), 1).getDay()).toBe(1); }); // Fri -> Mon
  it("adds 5 business days = next same weekday", () => { const d = addBusinessDays(new Date(2026, 10, 2), 5); expect(d.getDate()).toBe(9); });
  it("zero adds nothing", () => { expect(addBusinessDays(new Date(2026, 10, 2), 0).getDate()).toBe(2); });
  it("counts between dates skipping weekends", () => { expect(businessDaysBetween(new Date(2026, 10, 6), new Date(2026, 10, 10))).toBe(2); expect(businessDaysBetween(new Date(2026, 10, 7), new Date(2026, 10, 8))).toBe(0); });
  it("is symmetric with addBusinessDays", () => { const a = new Date(2026, 10, 3); expect(businessDaysBetween(a, addBusinessDays(a, 7))).toBe(7); });
});
