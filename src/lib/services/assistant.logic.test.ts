import { describe, expect, it } from "vitest";
import { extractSkills, routeIntent, SUGGESTED_COMMANDS } from "./assistant.logic";

const cases: [string, string][] = [
  ["Find Python developer jobs in Bangalore", "search_jobs"],
  ["Show my top matching jobs", "top_matches"],
  ["Which companies are hiring React developers?", "hiring_companies"],
  ["Show companies I haven't applied to", "not_applied_companies"],
  ["Show HR contacts for shortlisted jobs", "contacts_for_shortlisted"],
  ["Generate a cold email for Acme", "generate_email"],
  ["Show jobs matching Python and FastAPI", "jobs_by_skills"],
  ["Who should I contact today?", "contact_today"],
  ["What follow-ups are pending?", "pending_followups"],
  ["Show today's report", "daily_report"],
  ["Scan for new jobs now", "scan_now"],
];

describe("assistant routeIntent fallback", () => {
  it.each(cases)("%s -> %s", (msg, tool) => { expect(routeIntent(msg)?.tool).toBe(tool); });
  it("covers every suggested command", () => { expect(SUGGESTED_COMMANDS.map((c) => routeIntent(c)?.tool)).toEqual(cases.map((c) => c[1])); });
  it("extracts skills and location", () => {
    expect(routeIntent("Show jobs matching Python and FastAPI")?.args.skills?.sort()).toEqual(["fastapi", "python"]);
    expect(routeIntent("Which companies are hiring React developers?")?.args.skills).toEqual(["react"]);
    expect(routeIntent("Find Python developer jobs in Bangalore")?.args.location).toBe("bangalore");
  });
  it("parses company and email kind", () => {
    expect(routeIntent("Generate a cold email for Acme")?.args).toMatchObject({ company: "acme", kind: "recruiter_outreach" });
    expect(routeIntent("Write a follow-up email to Globex")?.args).toMatchObject({ company: "globex", kind: "follow_up" });
  });
  it("returns null for unrelated text", () => { expect(routeIntent("tell me a joke")).toBeNull(); expect(routeIntent("")).toBeNull(); });
  it("skill extraction avoids substrings", () => { expect(extractSkills("javascript and java")).toEqual(expect.arrayContaining(["javascript", "java"])); expect(extractSkills("django")).toEqual(["django"]); });
});
