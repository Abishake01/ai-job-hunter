import type { BoardRef } from "./types";

/**
 * Built-in company career boards (public ATS APIs) that hire in India. Each was verified to return jobs
 * with India locations on 2026-11-17. Users can add more in Settings → Discovery; these are merged in
 * unless `discovery.useCuratedBoards` is false. Jobs are still filtered by the location policy + your keywords.
 */
export const CURATED_BOARDS: BoardRef[] = [
  // Indian product companies
  { ats: "lever", slug: "cred", name: "CRED" },
  { ats: "lever", slug: "meesho", name: "Meesho" },
  { ats: "lever", slug: "paytm", name: "Paytm" },
  { ats: "lever", slug: "zeta", name: "Zeta" },
  { ats: "lever", slug: "mindtickle", name: "Mindtickle" },
  { ats: "lever", slug: "hevodata", name: "Hevo Data" },
  { ats: "greenhouse", slug: "groww", name: "Groww" },
  { ats: "greenhouse", slug: "sigmoid", name: "Sigmoid" },
  { ats: "greenhouse", slug: "druva", name: "Druva" },
  { ats: "ashby", slug: "tekion", name: "Tekion" },
  { ats: "ashby", slug: "atlan", name: "Atlan" },
  // Global companies with large India engineering teams
  { ats: "greenhouse", slug: "okta", name: "Okta" },
  { ats: "greenhouse", slug: "zscaler", name: "Zscaler" },
  { ats: "greenhouse", slug: "databricks", name: "Databricks" },
  { ats: "greenhouse", slug: "mongodb", name: "MongoDB" },
  { ats: "greenhouse", slug: "stripe", name: "Stripe" },
  { ats: "greenhouse", slug: "rubrik", name: "Rubrik" },
  { ats: "greenhouse", slug: "gitlab", name: "GitLab" },
  { ats: "greenhouse", slug: "elastic", name: "Elastic" },
  { ats: "greenhouse", slug: "twilio", name: "Twilio" },
  { ats: "greenhouse", slug: "airbnb", name: "Airbnb" },
  { ats: "greenhouse", slug: "coinbase", name: "Coinbase" },
  { ats: "greenhouse", slug: "datadog", name: "Datadog" },
  { ats: "greenhouse", slug: "commvault", name: "Commvault" },
  { ats: "greenhouse", slug: "turing", name: "Turing" },
  { ats: "greenhouse", slug: "newrelic", name: "New Relic" },
  { ats: "greenhouse", slug: "mixpanel", name: "Mixpanel" },
  { ats: "greenhouse", slug: "samsara", name: "Samsara" },
  { ats: "greenhouse", slug: "workato", name: "Workato" },
  { ats: "greenhouse", slug: "figma", name: "Figma" },
  { ats: "ashby", slug: "snowflake", name: "Snowflake" },
  { ats: "ashby", slug: "clickhouse", name: "ClickHouse" },
  { ats: "ashby", slug: "notion", name: "Notion" },
  { ats: "ashby", slug: "redis", name: "Redis" },
  { ats: "ashby", slug: "amplitude", name: "Amplitude" },
];

export function mergeBoards(userBoards: BoardRef[], useCurated: boolean): BoardRef[] {
  const seen = new Set<string>(); const out: BoardRef[] = [];
  for (const b of [...userBoards, ...(useCurated ? CURATED_BOARDS : [])]) {
    const k = `${b.ats}:${b.slug.toLowerCase()}`;
    if (!seen.has(k)) { seen.add(k); out.push(b); }
  }
  return out;
}
