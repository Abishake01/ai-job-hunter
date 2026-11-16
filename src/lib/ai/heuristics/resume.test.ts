import { describe, it, expect } from "vitest";
import { analyzeResumeHeuristic, pickResume, compareResumeTexts, extractContact } from "./resume";

const good = `Jane Doe
jane@example.com +91 98765 43210 github.com/jane linkedin.com/in/jane
Summary
Backend engineer.
Experience
- Built FastAPI services handling 10k users with 99% uptime
- Reduced latency by 40%
- Deployed on AWS with Docker
- Wrote Python scripts
- Used PostgreSQL
Education
B.E. Computer Science
Skills
Python, FastAPI, Django, React, PostgreSQL, AWS, Docker, Git
Projects
Job tracker - Next.js app
` + "word ".repeat(250);

describe("analyzeResumeHeuristic", () => {
  it("detects sections, skills and contact", () => {
    const a = analyzeResumeHeuristic(good, { profileSkills: ["Python", "Kubernetes"] });
    expect(a.engine).toBe("heuristic");
    expect(a.sections.filter((s) => s.present).map((s) => s.name)).toEqual(expect.arrayContaining(["Experience", "Education", "Skills", "Projects"]));
    expect(a.detectedSkills).toEqual(expect.arrayContaining(["Python", "FastAPI", "AWS"]));
    expect(a.missingTargetSkills).toEqual(["Kubernetes"]);
    expect(a.contact.email).toBe("jane@example.com");
    expect(a.atsScore).toBeGreaterThan(70);
  });
  it("flags thin text", () => {
    const a = analyzeResumeHeuristic("hello world", { profileSkills: [] });
    expect(a.atsScore).toBeLessThan(40);
    expect(a.improvements.join(" ")).toMatch(/words extracted/);
  });
  it("never recommends fabricating skills", () => {
    const a = analyzeResumeHeuristic("hello", { profileSkills: ["Rust"] });
    expect(a.improvements.join(" ")).toMatch(/only if you genuinely have/);
  });
});

describe("pickResume", () => {
  const rs = [
    { id: "a", name: "Backend", extractedText: "Python FastAPI Django PostgreSQL", isDefault: false },
    { id: "b", name: "Frontend", extractedText: "React TypeScript Tailwind CSS", isDefault: true },
  ];
  it("picks by overlap", () => {
    expect(pickResume(["Python", "FastAPI"], rs)?.id).toBe("a");
    expect(pickResume(["React", "TypeScript"], rs)?.id).toBe("b");
  });
  it("ties resolve to default; none => null", () => {
    expect(pickResume(["Kafka"], rs)?.id).toBe("b");
    expect(pickResume(["Python"], [])).toBeNull();
  });
});

describe("compareResumeTexts / extractContact", () => {
  it("reports skill differences", () => {
    const c = compareResumeTexts("Python Django", "Python React", { a: "A", b: "B" }, []);
    expect(c.common).toEqual(["Python"]); expect(c.onlyA).toEqual(["Django"]); expect(c.onlyB).toEqual(["React"]);
  });
  it("extracts contact", () => {
    expect(extractContact("mail me: a.b@x.io").email).toBe("a.b@x.io");
  });
});
