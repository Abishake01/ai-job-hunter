const ALIASES: Record<string, string> = {
  "react.js": "react", reactjs: "react", "react js": "react", "node.js": "nodejs", node: "nodejs", "next.js": "nextjs",
  js: "javascript", ts: "typescript", postgres: "postgresql", "postgre sql": "postgresql", mongo: "mongodb",
  "rest api": "rest apis", "restful apis": "rest apis", "rest": "rest apis", "restful api": "rest apis",
  "amazon web services": "aws", "aws lambda": "aws lambda", "html5": "html", "css3": "css", "fast api": "fastapi",
  "llm": "llm apis", "llms": "llm apis", "openai api": "llm apis", "github": "github", "gen ai": "generative ai", genai: "generative ai",
};
export function normalizeSkill(s: string): string {
  const k = s.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[k] ?? k;
}
