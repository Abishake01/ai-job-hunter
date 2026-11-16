import { describe, expect, it } from "vitest";
import { baselineVerification, computeVerification, detectPattern, inferEmail, isGenericMailbox, providerResultToDeliverable, type SourceType } from "./verify";
import { deriveCompanyDomain, extractContactsFromText, findPageLinks, htmlToText } from "./discover";

describe("verification labelling", () => {
  it("never labels a contact verified without a provider", () => {
    const sources: SourceType[] = ["job_ad", "company_site", "gmail", "public_profile", "manual", "pattern"];
    for (const s of sources) expect(baselineVerification(s)).not.toBe("verified");
    expect(baselineVerification("company_site")).toBe("public");
    expect(baselineVerification("pattern")).toBe("inferred");
    expect(baselineVerification("manual")).toBe("unknown");
  });
  it("provider verdict drives verified; stale verified drops", () => {
    expect(computeVerification("public", true)).toBe("verified");
    expect(computeVerification("verified", false)).toBe("unknown");
    expect(computeVerification("public", null)).toBe("public");
    expect(computeVerification("verified", null)).toBe("unknown");
  });
  it("maps provider payloads", () => {
    expect(providerResultToDeliverable("hunter", { data: { status: "valid" } })).toBe(true);
    expect(providerResultToDeliverable("hunter", { data: { status: "accept_all" } })).toBeNull();
    expect(providerResultToDeliverable("hunter", { data: { status: "invalid" } })).toBe(false);
    expect(providerResultToDeliverable("zerobounce", { status: "valid" })).toBe(true);
    expect(providerResultToDeliverable("zerobounce", { status: "catch-all" })).toBeNull();
    expect(providerResultToDeliverable("zerobounce", { status: "do_not_mail" })).toBe(false);
    expect(providerResultToDeliverable("zerobounce", null)).toBeNull();
  });
  it("infers an email only from an observed public name+email pattern", () => {
    expect(detectPattern("Jane Doe", "jane.doe@acme.com")).toBe("first.last");
    expect(inferEmail("Ravi Kumar", "acme.com", [{ name: "Jane Doe", email: "jane.doe@acme.com" }])).toMatchObject({ email: "ravi.kumar@acme.com", pattern: "first.last" });
    expect(inferEmail("Ravi Kumar", "acme.com", [])).toBeNull();
    expect(inferEmail("Ravi Kumar", "acme.com", [{ name: "Jane Doe", email: "jane.doe@other.com" }])).toBeNull();
    expect(inferEmail("Ravi Kumar", "acme.com", [{ name: null, email: "hr@acme.com" }])).toBeNull();
    expect(isGenericMailbox("careers@acme.com")).toBe(true);
  });
});

describe("public discovery parsing", () => {
  it("derives company domain but skips ATS/job boards", () => {
    expect(deriveCompanyDomain(["https://boards.greenhouse.io/acme/jobs/1", "https://www.linkedin.com/jobs/view/1"])).toBeNull();
    expect(deriveCompanyDomain(["https://boards.greenhouse.io/x", "https://careers.acme.com/jobs/1"])).toBe("acme.com");
  });
  it("extracts emails with explicit name/designation and requires the source URL", () => {
    const text = "Contact our team\nPriya Sharma - Technical Recruiter\nEmail: priya.sharma@acme.com\nGeneral: careers@acme.com\nno-reply@acme.com\nlogo@2x.png";
    const out = extractContactsFromText(text, { sourceUrl: "https://acme.com/careers", sourceType: "company_site", companyDomain: "acme.com" });
    expect(out.map((o) => o.email)).toEqual(["priya.sharma@acme.com", "careers@acme.com"]);
    expect(out[0]).toMatchObject({ name: "Priya Sharma", designation: "Technical Recruiter" });
    expect(out[1].generic).toBe(true);
    expect(out.every((o) => o.sourceUrl === "https://acme.com/careers")).toBe(true);
  });
  it("company pages ignore off-domain emails; job ads keep what the ad publishes", () => {
    expect(extractContactsFromText("mail partner@other.com", { sourceUrl: "https://acme.com/x", sourceType: "company_site", companyDomain: "acme.com" })).toEqual([]);
    expect(extractContactsFromText("Send CV to hiring@startup.io", { sourceUrl: "https://j.com/1", sourceType: "job_ad" })).toHaveLength(1);
  });
  it("never invents a name from an email local part", () => {
    const [c] = extractContactsFromText("Write to jane.doe@acme.com", { sourceUrl: "https://acme.com/c", sourceType: "company_site", companyDomain: "acme.com" });
    expect(c.name).toBeNull();
  });
  it("finds careers/contact links and de-obfuscates mailto", () => {
    const html = '<a href="/careers">Careers</a><a href="/contact-us">Contact</a><a href="mailto:hr@acme.com">Mail</a>';
    expect(findPageLinks(html, "https://acme.com/")).toEqual({ careersUrl: "https://acme.com/careers", contactUrl: "https://acme.com/contact-us" });
    expect(htmlToText(html)).toContain("hr@acme.com");
  });
});
