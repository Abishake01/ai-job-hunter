# Improvement plan: more jobs, profile-driven search, auto-apply (2026-11-21)

## Findings (why only 34 jobs)
- Adzuna/Jooble (best India coverage) enabled but no keys → skipped; no UI existed to add them (DiscoveryPanel was a stub).
- Only Remotive/Remote OK/Arbeitnow + 36 curated ATS boards; 14-day age + keyword + location filters; dedupe against existing jobs.
- Search keywords came from a settings list, not the profile; profile edits did not change discovery.
- LinkedIn/Naukri/Indeed forbid scraping → only reachable through Gmail job alerts, manual add, import-URL.

## Done
1. Profile completeness (`lib/profile/completeness.ts`, `/api/profile/completeness`) + top-center toast until 100% (`components/common/profile-toast.tsx`).
2. Profile-driven keywords (`job-sources/keywords.ts`): roles + title-worthy skills (+ junior/associate variants for <2 yrs) feed every adapter; Adzuna/Jooble now page + query many terms.
3. New key-less sources: Himalayas, Jobicy, We Work Remotely (on by default). 8 more verified India-hiring company boards. Max job age default 30 days.
4. Real Discovery settings panel: source toggles + health, Adzuna/Jooble keys, paste-a-careers-link to add Greenhouse/Lever/Ashby boards, keywords, age, country.
5. Scan Now now also scores new jobs.
6. Auto-apply (`services/auto-apply.service.ts`): opt-in, 100% profile + Gmail required, min score, daily cap, public/verified contacts only, duplicate-safe, runs as a daily-workflow step and via `/api/auto-apply/run`; UI in Settings → Daily workflow.

## Not done / needs the owner
- Direct ATS form submission (Greenhouse/Lever/Ashby): requires employer API keys or solving CAPTCHAs; deliberately not implemented. Jobs without a contact email are left as Ready to Apply.
- LinkedIn/Naukri direct scraping: not done (ToS). Use Gmail alerts, or add a paid aggregator (JSearch/SerpAPI) later.
- Add free Adzuna + Jooble keys in Settings → Discovery for India coverage.
