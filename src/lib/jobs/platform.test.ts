import { describe, it, expect } from "vitest";
import { detectPlatform, applyHost } from "./platform";

describe("platform detection", () => {
  it("maps job-portal links to a platform", () => {
    expect(detectPlatform("https://www.linkedin.com/jobs/view/123456789")).toBe("linkedin");
    expect(detectPlatform("https://www.naukri.com/job-listings-python-dev-chennai-1234567890")).toBe("naukri");
    expect(detectPlatform("https://www.foundit.in/job/x-123456")).toBe("foundit");
    expect(detectPlatform("https://unstop.com/jobs/backend-dev-12345")).toBe("unstop");
    expect(detectPlatform("https://job-boards.greenhouse.io/gitlab/jobs/8930224002")).toBe("greenhouse");
  });
  it("returns null for unknown or invalid links", () => {
    expect(detectPlatform("https://example.com/careers/1")).toBeNull();
    expect(detectPlatform("not a url")).toBeNull();
    expect(detectPlatform(null)).toBeNull();
  });
  it("does not match lookalike hosts", () => {
    expect(detectPlatform("https://notlinkedin.com/jobs/1")).toBeNull();
  });
  it("shows a clean host", () => { expect(applyHost("https://www.naukri.com/x")).toBe("naukri.com"); });
});
