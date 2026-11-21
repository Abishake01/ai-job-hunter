import { fetchAdzuna } from "./adzuna";
import { fetchArbeitnow } from "./arbeitnow";
import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchJooble } from "./jooble";
import { fetchLever } from "./lever";
import { fetchRemoteOk } from "./remoteok";
import { fetchRemotive } from "./remotive";
import { fetchRss } from "./rss";
import { fetchHimalayas } from "./himalayas";
import { fetchJobicy } from "./jobicy";
import { fetchWeWorkRemotely } from "./weworkremotely";
import type { SourceDef } from "./types";

const NO_SCRAPE = "Direct scraping is not done (their terms prohibit it and they require login / anti-bot checks). ";

export const SOURCES: SourceDef[] = [
  { key: "remotive", label: "Remotive", kind: "api", website: "https://remotive.com", compliance: "Official public API (remotive.com/api/remote-jobs). Called at most a few times a day; every job links back to Remotive and credits it as the source, per their API terms.", fetch: fetchRemotive },
  { key: "arbeitnow", label: "Arbeitnow", kind: "api", website: "https://www.arbeitnow.com", compliance: "Official public job-board API (arbeitnow.com/api/job-board-api). Mostly Europe-based roles plus remote.", fetch: fetchArbeitnow },
  { key: "remoteok", label: "Remote OK", kind: "api", website: "https://remoteok.com", compliance: "Official public JSON API (remoteok.com/api). Each job links back to Remote OK as the source, per their terms.", fetch: fetchRemoteOk },
  { key: "himalayas", label: "Himalayas", kind: "api", website: "https://himalayas.app", compliance: "Official public search API (himalayas.app/jobs/api/search), queried per your profile keywords for India-eligible and worldwide remote roles. Every job links back to Himalayas.", fetch: fetchHimalayas },
  { key: "jobicy", label: "Jobicy", kind: "api", website: "https://jobicy.com", compliance: "Official public remote-jobs API (jobicy.com/api/v2/remote-jobs), queried per profile keyword. Jobs link back to Jobicy as the source, per their notice.", fetch: fetchJobicy },
  { key: "weworkremotely", label: "We Work Remotely", kind: "rss", website: "https://weworkremotely.com", compliance: "Their public category RSS feeds. Region-locked (US/EU-only) listings are skipped; every job links back to We Work Remotely.", fetch: fetchWeWorkRemotely },
  { key: "greenhouse", label: "Greenhouse boards", kind: "ats", needs: "boards", compliance: "Public Greenhouse Job Board API (boards-api.greenhouse.io) for company boards you add. No login or scraping.", fetch: fetchGreenhouse },
  { key: "lever", label: "Lever boards", kind: "ats", needs: "boards", compliance: "Public Lever Postings API (api.lever.co/v0/postings) for company boards you add. No login or scraping.", fetch: fetchLever },
  { key: "ashby", label: "Ashby boards", kind: "ats", needs: "boards", compliance: "Public Ashby Job Posting API (api.ashbyhq.com/posting-api) for company boards you add. No login or scraping.", fetch: fetchAshby },
  { key: "adzuna", label: "Adzuna", kind: "api", needs: "apiKey", website: "https://developer.adzuna.com", compliance: "Official Adzuna API using your own free app id/key (stored encrypted). Predicted salaries are ignored.", fetch: fetchAdzuna },
  { key: "jooble", label: "Jooble", kind: "api", needs: "apiKey", website: "https://jooble.org/api/about", compliance: "Official Jooble REST API using your own API key (stored encrypted).", fetch: fetchJooble },
  { key: "rss", label: "RSS / Atom feeds", kind: "rss", needs: "feeds", compliance: "Only feeds you add yourself (e.g. a saved-search RSS a job site offers). robots.txt is checked before each fetch.", fetch: fetchRss },
  { key: "linkedin", label: "LinkedIn", kind: "gmail-alert", website: "https://www.linkedin.com/jobs", compliance: NO_SCRAPE + "Use LinkedIn job-alert emails via the Gmail integration, add a job manually, or paste a posting URL into Import URL (only works where the page permits automated access)." },
  { key: "naukri", label: "Naukri", kind: "gmail-alert", website: "https://www.naukri.com", compliance: NO_SCRAPE + "Create Naukri job alerts and connect Gmail so alert emails are turned into jobs, or add jobs manually." },
  { key: "indeed", label: "Indeed", kind: "gmail-alert", website: "https://www.indeed.com", compliance: NO_SCRAPE + "Use Indeed job-alert emails via Gmail, or add jobs manually / via Import URL." },
  { key: "wellfound", label: "Wellfound", kind: "gmail-alert", website: "https://wellfound.com", compliance: NO_SCRAPE + "Use Wellfound alert emails via Gmail or add jobs manually." },
  { key: "foundit", label: "Foundit", kind: "gmail-alert", website: "https://www.foundit.in", compliance: NO_SCRAPE + "Use Foundit alert emails via Gmail or add jobs manually." },
  { key: "instahyre", label: "Instahyre", kind: "gmail-alert", website: "https://www.instahyre.com", compliance: NO_SCRAPE + "Use Instahyre emails via Gmail or add jobs manually." },
  { key: "cutshort", label: "Cutshort", kind: "gmail-alert", website: "https://cutshort.io", compliance: NO_SCRAPE + "Use Cutshort emails via Gmail or add jobs manually." },
  { key: "hirist", label: "Hirist", kind: "gmail-alert", website: "https://www.hirist.tech", compliance: NO_SCRAPE + "Use Hirist emails via Gmail or add jobs manually." },
  { key: "unstop", label: "Unstop", kind: "gmail-alert", website: "https://unstop.com", compliance: NO_SCRAPE + "Turn on Unstop job/internship alert emails and connect Gmail, or add jobs manually (pick Unstop as the platform, or paste its link)." },
  { key: "internshala", label: "Internshala", kind: "gmail-alert", website: "https://internshala.com", compliance: NO_SCRAPE + "Use Internshala alert emails via Gmail or add jobs manually." },
  { key: "glassdoor", label: "Glassdoor", kind: "gmail-alert", website: "https://www.glassdoor.co.in", compliance: NO_SCRAPE + "Use Glassdoor alert emails via Gmail or add jobs manually." },
  { key: "gmail", label: "Gmail job alerts", kind: "gmail-alert", compliance: "Jobs created from classified job-alert emails by the Gmail integration (Settings → Gmail). Only metadata and extracted fields are stored." },
  { key: "manual", label: "Manual / Import URL", kind: "manual", compliance: "Jobs you add by hand or import from a posting URL (JSON-LD first; robots.txt respected)." },
];
export const SOURCE_BY_KEY = new Map(SOURCES.map((s) => [s.key, s]));
export const RUNNABLE_SOURCES = SOURCES.filter((s) => s.fetch);
