import { describe, expect, it } from "vitest";
import { classifyPage } from "@/lib/job-sources/closed";

describe("classifyPage", () => {
  it("404/410 => expired", () => {
    expect(classifyPage(404, "").status).toBe("expired");
    expect(classifyPage(410, "").status).toBe("expired");
  });
  it("closed-listing phrases => expired", () => {
    expect(classifyPage(200, "<p>Sorry, this position has been filled.</p>").status).toBe("expired");
    expect(classifyPage(200, "<h1>This job has expired</h1>").status).toBe("expired");
    expect(classifyPage(200, "<p>Applications are now closed</p>").status).toBe("expired");
  });
  it("normal page => available; blocked => unknown (never expires)", () => {
    expect(classifyPage(200, "<h1>Backend Engineer</h1><p>Apply now</p>").status).toBe("available");
    expect(classifyPage(403, "").status).toBe("unknown");
    expect(classifyPage(429, "").status).toBe("unknown");
    expect(classifyPage(500, "").status).toBe("unknown");
  });
});
