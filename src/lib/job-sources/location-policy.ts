/**
 * Location policy (pure, client/server safe):
 *  - Jobs in INDIA: keep every work mode (remote / hybrid / on-site).
 *  - Jobs OUTSIDE India: keep only REMOTE roles that are not explicitly restricted to local residents.
 * Unknown location + unknown work mode is kept only when the text clearly says remote/anywhere.
 */
export const INDIAN_PLACES = [
  "india", "bangalore", "bengaluru", "mumbai", "pune", "hyderabad", "chennai", "delhi", "new delhi", "gurgaon", "gurugram", "noida", "kolkata",
  "ahmedabad", "kochi", "cochin", "coimbatore", "jaipur", "indore", "chandigarh", "trivandrum", "thiruvananthapuram", "mysore", "mysuru", "nagpur",
  "bhubaneswar", "lucknow", "vadodara", "surat", "visakhapatnam", "vizag", "madurai", "tamil nadu", "karnataka", "maharashtra", "telangana", "kerala", "haryana", "uttar pradesh", "navi mumbai", "mohali", "remote - india", "pan india",
];
export const PREFERRED_CITY_ALIASES: Record<string, string[]> = {
  chennai: ["chennai", "madras"],
  bengaluru: ["bengaluru", "bangalore", "bengalooru"],
  bangalore: ["bengaluru", "bangalore", "bengalooru"],
};
const WORLDWIDE = /\b(worldwide|anywhere|global|globally|international|work from anywhere|asia|apac|south asia|emea\/apac)\b/i;
const RESTRICTED = /\b(only|residents?|must (be|reside|live)|citizens?|eligible to work|work authori[sz]ation|us-based|eu-based|uk-based)\b/i;

const wordIn = (hay: string, needle: string) => new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(hay);

export function isIndiaLocation(location: string | null | undefined): boolean {
  const l = (location ?? "").toLowerCase();
  return !!l && INDIAN_PLACES.some((p) => wordIn(l, p));
}

/** Returns which preferred city (e.g. "Chennai") the location hits, honoring aliases such as Bangalore/Bengaluru. */
export function preferredCityHit(location: string | null | undefined, preferred: string[]): string | null {
  const l = (location ?? "").toLowerCase();
  if (!l) return null;
  for (const p of preferred) {
    const key = p.toLowerCase().trim();
    const names = PREFERRED_CITY_ALIASES[key] ?? [key];
    if (key !== "india" && key !== "remote" && names.some((n) => wordIn(l, n))) return p;
  }
  return null;
}

export type PolicyJob = { location: string | null; workMode: "remote" | "hybrid" | "onsite" | null; title?: string | null };
export type PolicyResult = { keep: boolean; region: "india" | "abroad" | "unknown"; reason: string };

export function applyLocationPolicy(job: PolicyJob, opts: { abroadRemoteOnly?: boolean } = {}): PolicyResult {
  const abroadRemoteOnly = opts.abroadRemoteOnly ?? true;
  const loc = job.location ?? "";
  if (isIndiaLocation(loc)) return { keep: true, region: "india", reason: "India: all work modes allowed" };
  const textRemote = /\b(remote|work from home|wfh|anywhere|worldwide)\b/i.test(`${loc} ${job.title ?? ""}`);
  const isRemote = job.workMode === "remote" || (job.workMode == null && textRemote);
  if (!abroadRemoteOnly) return { keep: true, region: loc ? "abroad" : "unknown", reason: "Abroad filter disabled" };
  if (!loc && job.workMode == null && !textRemote) return { keep: false, region: "unknown", reason: "Unknown location and not clearly remote" };
  if (!isRemote) return { keep: false, region: "abroad", reason: "Outside India and not remote" };
  if (!WORLDWIDE.test(loc) && RESTRICTED.test(loc)) return { keep: false, region: "abroad", reason: "Remote but restricted to local residents" };
  return { keep: true, region: loc ? "abroad" : "unknown", reason: "Remote role outside India" };
}
