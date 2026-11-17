import { describe, it, expect } from "vitest";
import { applyLocationPolicy, isIndiaLocation, preferredCityHit } from "./location-policy";

describe("location policy", () => {
  it("keeps every work mode in India", () => {
    for (const wm of ["remote", "hybrid", "onsite", null] as const) expect(applyLocationPolicy({ location: "Chennai, Tamil Nadu", workMode: wm }).keep).toBe(true);
    expect(applyLocationPolicy({ location: "Bengaluru, India", workMode: "hybrid" }).region).toBe("india");
  });
  it("drops abroad on-site / hybrid, keeps abroad remote", () => {
    expect(applyLocationPolicy({ location: "Berlin", workMode: "onsite" }).keep).toBe(false);
    expect(applyLocationPolicy({ location: "Zug, Schweiz", workMode: "hybrid" }).keep).toBe(false);
    expect(applyLocationPolicy({ location: "Berlin", workMode: null }).keep).toBe(false);
    expect(applyLocationPolicy({ location: "Worldwide", workMode: "remote" }).keep).toBe(true);
    expect(applyLocationPolicy({ location: "Asia / APAC", workMode: "remote" }).keep).toBe(true);
  });
  it("drops remote roles restricted to local residents", () => {
    expect(applyLocationPolicy({ location: "USA Only", workMode: "remote" }).keep).toBe(false);
    expect(applyLocationPolicy({ location: "Remote - Worldwide", workMode: "remote" }).keep).toBe(true);
  });
  it("drops remote roles tied to a foreign city/country (Netherlands, Belgium, Berlin, Europe)", () => {
    for (const loc of ["Amsterdam, Netherlands", "Brussels, Belgium", "Berlin", "Europe", "Homeoffice, Germany"]) expect(applyLocationPolicy({ location: loc, workMode: "remote" }).keep).toBe(false);
  });
  it("keeps remote roles with no location restriction listed", () => {
    expect(applyLocationPolicy({ location: null, workMode: "remote" }).keep).toBe(true);
    expect(applyLocationPolicy({ location: "Remote", workMode: "remote" }).keep).toBe(true);
  });
  it("treats text-only remote as remote", () => {
    expect(applyLocationPolicy({ location: "Remote", workMode: null }).keep).toBe(true);
  });
  it("does not confuse substrings (Indianapolis is not India)", () => {
    expect(isIndiaLocation("Indianapolis, IN")).toBe(false);
    expect(isIndiaLocation("Pune")).toBe(true);
  });
  it("matches preferred cities with aliases", () => {
    expect(preferredCityHit("Bangalore, Karnataka", ["Chennai", "Bengaluru"])).toBe("Bengaluru");
    expect(preferredCityHit("Chennai", ["Chennai", "Bengaluru"])).toBe("Chennai");
    expect(preferredCityHit("Mumbai", ["Chennai", "Bengaluru"])).toBeNull();
  });
});
