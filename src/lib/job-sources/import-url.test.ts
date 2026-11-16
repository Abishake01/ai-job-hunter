import { describe, expect, it } from "vitest";
import { extractFromHtml } from "./import-url";

const ld = (o: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;
const now = new Date("2026-11-16");

describe("import-url extraction", () => {
  it("reads JSON-LD JobPosting incl. @graph, salary, remote, deadline", () => {
    const html = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, {
      "@type": "JobPosting", title: "Backend Engineer", description: "&lt;p&gt;Build APIs with Python. 2-4 years of experience.&lt;/p&gt;",
      hiringOrganization: { "@type": "Organization", name: "Acme" }, employmentType: ["FULL_TIME"], jobLocationType: "TELECOMMUTE",
      jobLocation: { address: { addressLocality: "Pune", addressCountry: "IN" } }, datePosted: "2026-11-10",
      baseSalary: { currency: "INR", value: { minValue: 600000, maxValue: 900000, unitText: "YEAR" } }, validThrough: "2026-12-31",
    }] });
    const r = extractFromHtml(html, "https://acme.example/jobs/1", now);
    expect(r.method).toBe("jsonld");
    expect(r.job).toMatchObject({ title: "Backend Engineer", company: "Acme", workMode: "remote", jobType: "full_time", location: "Pune, IN", salaryMin: 50000, salaryMax: 75000, salaryCurrency: "INR", experienceMin: 2, experienceMax: 4 });
    expect(r.job.description).toBe("Build APIs with Python. 2-4 years of experience.");
    expect(r.closed).toBe(false);
    expect(r.missing).not.toContain("company");
  });
  it("flags expired validThrough and unknown salary unit", () => {
    const r = extractFromHtml(ld({ "@type": "JobPosting", title: "T", hiringOrganization: { name: "C" }, validThrough: "2026-01-01", baseSalary: { currency: "USD", value: { value: 50 } } }), "https://x.example/j", now);
    expect(r.closed).toBe(true);
    expect(r.job.salaryMin).toBeNull();
    expect(r.missing).toContain("salary");
  });
  it("falls back to OpenGraph and reports missing fields (never invents)", () => {
    const r = extractFromHtml(`<html><head><meta property="og:title" content="Data Analyst &amp; Co"><meta property="og:site_name" content="Foo"></head></html>`, "https://x.example/j", now);
    expect(r.method).toBe("meta");
    expect(r.job).toMatchObject({ title: "Data Analyst & Co", company: "Foo", salaryMin: null, location: null });
    expect(r.missing).toEqual(expect.arrayContaining(["description", "location", "salary"]));
  });
  it("throws when no posting data", () => {
    expect(() => extractFromHtml("<html><body>hi</body></html>", "https://x.example", now)).toThrow(/Could not find/);
  });
});
