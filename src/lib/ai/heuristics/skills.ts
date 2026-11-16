import { normalizeSkill } from "@/lib/utils/skills";

/** Common tech vocabulary used to detect skills in free text (job descriptions, resumes). Display names. */
export const SKILL_VOCAB = [
  "Python", "FastAPI", "Django", "Flask", "Java", "Spring Boot", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "Vue", "Angular",
  "HTML", "CSS", "Tailwind CSS", "Redux", "GraphQL", "REST APIs", "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQL", "SQLite", "Elasticsearch",
  "AWS", "AWS Lambda", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Git", "GitHub", "Linux", "Microservices", "Celery", "RabbitMQ", "Kafka",
  "React Native", "Flutter", "Kotlin", "Swift", "Golang", "Rust", "C++", "C#", ".NET", "PHP", "Laravel", "Ruby", "Rails",
  "Machine Learning", "Deep Learning", "NLP", "LLM APIs", "Generative AI", "LangChain", "RAG", "PyTorch", "TensorFlow", "Pandas", "NumPy", "OpenAI",
  "Prisma", "Drizzle", "SQLAlchemy", "Jest", "Pytest", "Selenium", "Figma", "Agile", "Scrum", "Jira",
] as const;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Returns the skills from `vocab` (plus any `extra` names) that appear as whole words in text. Deduped by normalized form; display name preserved. */
export function extractSkillsFromText(text: string, extra: string[] = [], vocab: readonly string[] = SKILL_VOCAB): string[] {
  if (!text) return [];
  const found = new Map<string, string>();
  const candidates = [...vocab, ...extra];
  for (const name of candidates) {
    const n = normalizeSkill(name);
    if (found.has(n)) continue;
    const re = new RegExp(`(^|[^a-z0-9+#])${esc(name)}(?![a-z0-9+#])`, "i");
    if (re.test(text)) found.set(n, name);
  }
  // aliases (e.g. "React.js", "Postgres") that normalize to a vocab entry
  const aliasRe = /(?<![a-z0-9])(react\.?js|node\.?js|next\.?js|postgres|mongo|amazon web services|restful apis?|rest api|fast api|js|ts)(?![a-z0-9])/gi;
  for (const m of text.matchAll(aliasRe)) {
    const n = normalizeSkill(m[1]);
    const display = vocab.find((v) => normalizeSkill(v) === n);
    if (display && !found.has(n)) found.set(n, display);
  }
  return [...found.values()];
}
