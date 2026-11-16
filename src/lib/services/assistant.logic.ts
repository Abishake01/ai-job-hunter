import { normalizeSkill } from "@/lib/utils/skills";

export const ASSISTANT_TOOLS = ["search_jobs", "top_matches", "hiring_companies", "not_applied_companies", "contacts_for_shortlisted", "generate_email", "jobs_by_skills", "contact_today", "pending_followups", "daily_report", "scan_now"] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];
export type ToolArgs = { query?: string; skills?: string[]; company?: string; kind?: string; location?: string; limit?: number };
export type Intent = { tool: AssistantTool; args: ToolArgs } | null;

export const SUGGESTED_COMMANDS = [
  "Find Python developer jobs in Bangalore",
  "Show my top matching jobs",
  "Which companies are hiring React developers?",
  "Show companies I haven't applied to",
  "Show HR contacts for shortlisted jobs",
  "Generate a cold email for Acme",
  "Show jobs matching Python and FastAPI",
  "Who should I contact today?",
  "What follow-ups are pending?",
  "Show today's report",
  "Scan for new jobs now",
];

const KNOWN_SKILLS = ["python", "fastapi", "django", "flask", "react", "react native", "next.js", "nextjs", "node", "node.js", "nodejs", "typescript", "javascript", "java", "golang", "go", "rust", "c++", "c#", ".net", "html", "css", "postgresql", "postgres", "mysql", "mongodb", "redis", "aws", "azure", "gcp", "docker", "kubernetes", "graphql", "rest apis", "rest", "sql", "git", "llm", "langchain", "openai", "machine learning", "pytorch", "tensorflow", "vue", "angular", "tailwind", "lambda", "aws lambda", "kafka", "terraform", "linux", "php", "laravel", "spring", "kotlin", "swift", "flutter"];
const KNOWN_SORTED = [...KNOWN_SKILLS].sort((a, b) => b.length - a.length);

export function extractSkills(text: string): string[] {
  let t = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const k of KNOWN_SORTED) {
    const re = new RegExp(`(?<![a-z0-9+#.])${k.replace(/[.+#]/g, "\\$&")}(?![a-z0-9+#])`, "i");
    if (re.test(t)) { found.push(normalizeSkill(k)); t = t.replace(re, " "); }
  }
  return [...new Set(found)];
}

const STOP = new Set(["find", "search", "show", "list", "get", "me", "my", "all", "the", "a", "an", "for", "jobs", "job", "openings", "positions", "roles", "role", "in", "at", "please", "any", "new", "latest", "with", "of", "to", "i", "can", "you", "give", "need", "looking", "want", "work", "available"]);
export function extractQuery(text: string): string {
  return text.toLowerCase().replace(/[?!.,]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");
}

const has = (t: string, ...res: RegExp[]) => res.some((r) => r.test(t));

/**
 * Deterministic intent router (used when no LLM is configured or the LLM call fails).
 * Order matters: more specific intents first.
 */
export function routeIntent(message: string): Intent {
  const t = message.toLowerCase().trim();
  if (!t) return null;
  const skills = extractSkills(t);

  if (has(t, /\b(scan|refresh|fetch|discover|pull)\b.*\b(jobs?|listings?|openings?|sources?)\b/, /\b(scan|discovery|run a scan)\b.*\bnow\b/, /^scan\b/, /\bscan now\b/)) return { tool: "scan_now", args: {} };

  if (has(t, /\b(generate|write|draft|compose|create|prepare)\b.*\b(e-?mail|mail|outreach|message)\b/, /\b(cold|follow[- ]?up|intro(duction)?)\s+(e-?mail|mail)\b/)) {
    const m = t.match(/\bfor\s+(?:the\s+)?(.+?)(?:\s+(?:job|role|position|opening)s?)?\s*[?.!]*$/) ?? t.match(/\bto\s+(.+?)\s*[?.!]*$/) ?? t.match(/\bat\s+(.+?)\s*[?.!]*$/);
    const company = m?.[1]?.replace(/^(a|an|the)\s+/, "").trim();
    const kind = /follow[- ]?up/.test(t) ? "follow_up" : /hiring manager|intro/.test(t) ? "hiring_manager_intro" : /direct|apply|application/.test(t) ? "direct_application" : /general|inquiry|enquiry/.test(t) ? "general_inquiry" : "recruiter_outreach";
    return { tool: "generate_email", args: { company, kind } };
  }

  if (has(t, /follow[- ]?ups?\b/, /\bpending (replies|responses)\b/, /\bno reply\b/, /\boverdue\b/)) return { tool: "pending_followups", args: {} };

  if (has(t, /\b(daily|today'?s?|morning|my)\s+(job\s+)?(report|summary|digest)\b/, /\b(report|summary|digest)\b.*\btoday\b/, /^(give me |show )?(the )?(report|summary)$/, /\bwhat('s| is| was) new today\b/)) return { tool: "daily_report", args: {} };

  if (has(t, /\b(who|whom|which)\b.*\b(contact|reach out|reach|email|message|write|ping|talk)\b.*\btoday\b/, /\b(contact|reach out to)\b.*\btoday\b/, /\bwho should i (contact|email|reach|message)\b/)) return { tool: "contact_today", args: {} };

  if (has(t, /\b(hr|recruiters?|contacts?|hiring managers?)\b.*\bshortlisted\b/, /\bshortlisted\b.*\b(hr|recruiters?|contacts?)\b/)) return { tool: "contacts_for_shortlisted", args: {} };

  if (has(t, /\bcompan(y|ies)\b.*\b(haven'?t|have not|not|never|yet to|not yet|didn'?t)\b.*\bappl/, /\b(haven'?t|have not|not yet|never)\s+appl(y|ied)\b.*\bcompan/, /\bunapplied\b/, /\bnot applied\b/, /\bwhere (have i|haven'?t i|i haven'?t) (not )?appl/)) return { tool: "not_applied_companies", args: {} };

  if (has(t, /\bcompan(y|ies)\b.*\b(hiring|hire|recruiting|looking for|openings?)\b/, /\bwho('s| is| are)? hiring\b/, /\bhiring\b.*\bcompan/)) {
    const after = t.match(/\b(?:hiring|hire|recruiting|looking for)\s+(.+?)\s*(?:developers?|engineers?|devs?|roles?|jobs?)?\s*[?.!]*$/)?.[1];
    return { tool: "hiring_companies", args: { skills: skills.length ? skills : after ? extractQuery(after).split(" ").filter(Boolean).slice(0, 3) : [] } };
  }

  if (skills.length && has(t, /\b(match(ing|es)?|requir(e|es|ing)|using|with|needing|needs|skills?|know(s|ing)?|that use)\b/) && has(t, /\bjobs?\b|\broles?\b|\bpositions?\b|\bopenings?\b/)) return { tool: "jobs_by_skills", args: { skills } };

  if (has(t, /\b(top|best|highest|strongest)\b.*\b(match(es|ing)?|jobs?|scor(e|ing|ed)|fit|roles?)\b/, /\brecommend(ed|ations?)?\b/, /\bbest fit\b/)) return { tool: "top_matches", args: { limit: 10 } };

  if (has(t, /\b(find|search|look for|looking for|show|list|get|any)\b.*\b(jobs?|roles?|openings?|positions?|vacanc)/, /\bjobs?\b.*\b(in|at|for|near)\b/, /\b(developer|engineer)\b.*\bjobs?\b/)) {
    const loc = t.match(/\b(?:in|near|at)\s+([a-z][a-z ,]+?)\s*[?.!]*$/)?.[1]?.trim();
    const q = extractQuery(loc ? t.replace(/\b(?:in|near|at)\s+[a-z][a-z ,]+?\s*[?.!]*$/, "") : t);
    return { tool: "search_jobs", args: { query: q, location: loc, skills } };
  }
  return null;
}
