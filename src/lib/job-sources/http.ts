import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT = "AIJobHunter/1.0 (personal job search)";
const MIN_INTERVAL_MS = Number(process.env.JOB_HTTP_MIN_INTERVAL_MS ?? 700);
const lastByHost = new Map<string, Promise<void>>();

export class HttpFailure extends Error {
  constructor(public status: number, message: string, public url: string) { super(message); }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Per-host rate limit: calls to the same host are spaced by MIN_INTERVAL_MS. */
async function throttle(host: string) {
  const prev = lastByHost.get(host) ?? Promise.resolve();
  const next = prev.then(() => sleep(MIN_INTERVAL_MS));
  lastByHost.set(host, next.catch(() => undefined));
  await prev;
}

export interface FetchOpts {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

/** Polite fetch: UA, per-host spacing, timeout, retries on 429/5xx/network with backoff. Returns the Response (any status < 500 except 429). */
export async function politeFetch(url: string, opts: FetchOpts = {}, manualRedirect = false): Promise<Response> {
  const { method = "GET", headers = {}, body, timeoutMs = 15000, retries = 2, accept = "application/json, text/html;q=0.8, */*;q=0.5" } = opts;
  const host = new URL(url).host;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host);
    try {
      const res = await fetch(url, {
        method, body, redirect: manualRedirect ? "manual" : "follow",
        headers: { "user-agent": USER_AGENT, accept, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 800 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(800 * 2 ** attempt);
    }
  }
  throw new HttpFailure(0, `Network error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`, url);
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new HttpFailure(res.status, `HTTP ${res.status} from ${new URL(url).host}`, url);
  try { return (await res.json()) as T; } catch { throw new HttpFailure(res.status, `Invalid JSON from ${new URL(url).host}`, url); }
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new HttpFailure(res.status, `HTTP ${res.status} from ${new URL(url).host}`, url);
  return res.text();
}

// ---------- robots.txt ----------
interface RobotsRules { allow: string[]; disallow: string[]; unreachable: boolean }
const robotsCache = new Map<string, { at: number; rules: RobotsRules }>();

export function parseRobots(txt: string, agent = "aijobhunter"): Pick<RobotsRules, "allow" | "disallow"> {
  type G = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: G[] = [];
  let cur: G | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if (cur && (k === "allow" || k === "disallow")) {
      lastWasAgent = false;
      if (v) (k === "allow" ? cur.allow : cur.disallow).push(v);
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path);
}

export function robotsAllows(rules: Pick<RobotsRules, "allow" | "disallow">, path: string): boolean {
  let best = { len: -1, allow: true };
  for (const r of rules.disallow) if (ruleMatches(r, path) && r.length > best.len) best = { len: r.length, allow: false };
  for (const r of rules.allow) if (ruleMatches(r, path) && r.length >= best.len) best = { len: r.length, allow: true };
  return best.allow;
}

/** RFC 9309: 4xx robots => allowed; 5xx / unreachable => treated as disallowed (conservative). */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const key = u.origin;
  let entry = robotsCache.get(key);
  if (!entry || Date.now() - entry.at > 3600_000) {
    let rules: RobotsRules;
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`, { accept: "text/plain", timeoutMs: 8000, retries: 1 });
      if (res.ok) rules = { ...parseRobots(await res.text()), unreachable: false };
      else if (res.status >= 400 && res.status < 500) rules = { allow: [], disallow: [], unreachable: false };
      else rules = { allow: [], disallow: [], unreachable: true };
    } catch { rules = { allow: [], disallow: [], unreachable: true }; }
    entry = { at: Date.now(), rules };
    robotsCache.set(key, entry);
  }
  if (entry.rules.unreachable) return false;
  return robotsAllows(entry.rules, u.pathname + u.search);
}

// ---------- SSRF guard (user-supplied URLs) ----------
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new HttpFailure(400, "Invalid URL", raw); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpFailure(400, "Only http(s) URLs are supported", raw);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new HttpFailure(400, "Private addresses are not allowed", raw);
  if (isIP(host)) { if (isPrivateIp(host)) throw new HttpFailure(400, "Private addresses are not allowed", raw); return u; }
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.some((a) => isPrivateIp(a.address))) throw new HttpFailure(400, "Private addresses are not allowed", raw);
  } catch (e) {
    if (e instanceof HttpFailure) throw e;
    throw new HttpFailure(400, "Host could not be resolved", raw);
  }
  return u;
}
