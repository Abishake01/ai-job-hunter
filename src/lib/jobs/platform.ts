/** Job portals the user may pick or that are auto-detected from a link. Client-safe (no server imports). */
export const PLATFORMS: { key: string; label: string; hosts: string[] }[] = [
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { key: "naukri", label: "Naukri", hosts: ["naukri.com"] },
  { key: "foundit", label: "Foundit", hosts: ["foundit.in", "monsterindia.com", "monster.com"] },
  { key: "unstop", label: "Unstop", hosts: ["unstop.com"] },
  { key: "indeed", label: "Indeed", hosts: ["indeed.com", "indeed.co.in"] },
  { key: "glassdoor", label: "Glassdoor", hosts: ["glassdoor.com", "glassdoor.co.in"] },
  { key: "wellfound", label: "Wellfound", hosts: ["wellfound.com", "angel.co"] },
  { key: "instahyre", label: "Instahyre", hosts: ["instahyre.com"] },
  { key: "cutshort", label: "Cutshort", hosts: ["cutshort.io"] },
  { key: "hirist", label: "Hirist", hosts: ["hirist.tech", "hirist.com"] },
  { key: "internshala", label: "Internshala", hosts: ["internshala.com"] },
  { key: "iimjobs", label: "IIMJobs", hosts: ["iimjobs.com"] },
  { key: "shine", label: "Shine", hosts: ["shine.com"] },
  { key: "apna", label: "Apna", hosts: ["apna.co"] },
  { key: "greenhouse", label: "Greenhouse", hosts: ["greenhouse.io"] },
  { key: "lever", label: "Lever", hosts: ["lever.co"] },
  { key: "ashby", label: "Ashby", hosts: ["ashbyhq.com"] },
];
export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.key, p.label]));

const hostOf = (url: string | null | undefined) => { try { return url ? new URL(url).hostname.replace(/^www\./, "").toLowerCase() : null; } catch { return null; } };

/** Platform key from a job link's hostname (linkedin.com → "linkedin"), or null. */
export function detectPlatform(url: string | null | undefined): string | null {
  const h = hostOf(url);
  if (!h) return null;
  return PLATFORMS.find((p) => p.hosts.some((x) => h === x || h.endsWith("." + x)))?.key ?? null;
}
/** Short hostname for "Apply on …" labels. */
export const applyHost = hostOf;
