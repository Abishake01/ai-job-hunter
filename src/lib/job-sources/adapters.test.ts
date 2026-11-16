import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapRemotive } from "./remotive";
import { mapArbeitnow } from "./arbeitnow";
import { mapRemoteOk } from "./remoteok";
import { mapGreenhouse } from "./greenhouse";
import { mapLever } from "./lever";
import { mapAshby } from "./ashby";
import { mapAdzuna } from "./adzuna";
import { mapJooble } from "./jooble";
import { parseFeed, splitTitleCompany } from "./rss";
import { SOURCES } from "./registry";

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", n), "utf8"));
const now = new Date("2026-11-16T00:00:00Z");

describe("adapters map recorded real responses", () => {
  it("remotive", () => {
    const r = mapRemotive(fx("remotive.json"), now);
    expect(r).toHaveLength(2);
    const j = r[0].job;
    expect(j).toMatchObject({ source: "remotive", workMode: "remote" });
    expect(j.sourceJobId).toMatch(/^\d+$/);
    expect(j.applyUrl).toMatch(/^https:\/\/remotive\.com/);
    expect(j.postedAt).toBeInstanceOf(Date);
    expect(j.description).not.toMatch(/<p>/);
  });
  it("arbeitnow", () => {
    const j = mapArbeitnow(fx("arbeitnow.json"), now)[0].job;
    expect(j.source).toBe("arbeitnow");
    expect(j.title).toBeTruthy();
    expect(j.postedAt!.getFullYear()).toBeGreaterThanOrEqual(2025);
    expect(j.description).not.toMatch(/<\/?(p|ul|li)>/);
  });
  it("remoteok skips the legal header and maps annual USD to monthly", () => {
    const r = mapRemoteOk(fx("remoteok.json"), now);
    expect(r.length).toBe(2);
    for (const { job } of r) {
      expect(job.workMode).toBe("remote");
      expect(job.source).toBe("remoteok");
      if (job.salaryMin !== null) expect(job.salaryCurrency).toBe("USD");
    }
    const synthetic = mapRemoteOk([{ id: "1", position: "Dev", company: "C", salary_min: 120000, salary_max: 180000, epoch: 1 }], now)[0].job;
    expect(synthetic).toMatchObject({ salaryMin: 10000, salaryMax: 15000, salaryCurrency: "USD" });
    expect(mapRemoteOk([{ id: "2", position: "Dev", company: "C", salary_min: 0, salary_max: 0 }], now)[0].job.salaryMin).toBeNull();
  });
  it("greenhouse decodes entity-escaped content and namespaces ids by board", () => {
    const r = mapGreenhouse(fx("greenhouse.json"), "stripe", undefined, now);
    expect(r[0].sourceJobId).toMatch(/^stripe:\d+$/);
    expect(r[0].company).toBe("Stripe");
    expect(r[0].description).not.toMatch(/&lt;|<p>|&amp;/);
    expect(r[0].description!.length).toBeGreaterThan(50);
  });
  it("lever maps salaryRange, workplaceType and plain description", () => {
    const r = mapLever(fx("lever.json"), "leverdemo", "Lever Demo", now);
    expect(r[0]).toMatchObject({ company: "Lever Demo", source: "lever" });
    expect(r[0].sourceJobId).toMatch(/^leverdemo:/);
    expect(r[0].workMode).toBe("hybrid");
    expect(r[0].salaryMin).toBe(Math.round(85000 / 12));
    expect(r[0].salaryMax).toBe(Math.round(175000 / 12));
    expect(r[0].salaryCurrency).toBe("USD");
  });
  it("ashby maps compensation, remote, listing flag", () => {
    const r = mapAshby(fx("ashby.json"), "ashby", "Ashby", now);
    expect(r[0].workMode).toBe("remote");
    expect(r[0].jobType).toBe("full_time");
    expect(r[0].salaryCurrency).toBe("EUR");
    expect(r[0].salaryMin).toBe(Math.round(150000 / 12));
    expect(mapAshby({ jobs: [{ id: "x", title: "T", isListed: false }] }, "a")).toHaveLength(0);
  });
  it("adzuna ignores predicted salary and converts annual to monthly", () => {
    const resp = { results: [
      { id: 1, title: "Dev", redirect_url: "https://a/1", company: { display_name: "Co" }, salary_min: 600000, salary_max: 900000, salary_is_predicted: "0", created: "2026-11-10T00:00:00Z" },
      { id: 2, title: "Dev2", redirect_url: "https://a/2", salary_min: 600000, salary_max: 900000, salary_is_predicted: "1" },
    ] };
    const r = mapAdzuna(resp, "in", now);
    expect(r[0]).toMatchObject({ salaryMin: 50000, salaryMax: 75000, salaryCurrency: "INR", company: "Co" });
    expect(r[1].salaryMin).toBeNull();
    expect(r[1].company).toBe("Unknown company");
  });
  it("jooble maps snippet", () => {
    const r = mapJooble({ jobs: [{ id: 5, title: "Python Dev", link: "https://j/5", company: "Z", snippet: "<b>2-3 years</b> experience", location: "Pune", updated: "2026-11-01T00:00:00" }] }, now);
    expect(r[0]).toMatchObject({ company: "Z", experienceMin: 2, experienceMax: 3, location: "Pune" });
  });
});

describe("rss", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[Python Developer at Acme]]></title><link>https://x.example/jobs/1</link><guid>g1</guid><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Remote role. 2-4 years of experience.</p>]]></description><category>python</category></item>
  <item><title>Mystery role</title><link>https://y.example/2</link></item>
  <item><title>no link</title></item></channel></rss>`;
  it("parses items, extracts company only from explicit patterns", () => {
    const r = parseFeed(xml, { name: "f", url: "https://x.example/feed" }, now);
    expect(r).toHaveLength(2);
    expect(r[0].job).toMatchObject({ title: "Python Developer", company: "Acme", workMode: "remote", experienceMin: 2, sourceJobId: "g1" });
    expect(r[1].job.company).toBe("Unknown company (y.example)");
  });
  it("splitTitleCompany", () => {
    expect(splitTitleCompany("Backend Engineer at Foo")).toEqual({ title: "Backend Engineer", company: "Foo" });
    expect(splitTitleCompany("Backend Engineer")).toEqual({ title: "Backend Engineer", company: null });
  });
});

describe("registry compliance", () => {
  it("restricted platforms are never fetchable and carry a compliance note", () => {
    for (const k of ["linkedin", "naukri", "indeed", "wellfound", "foundit", "instahyre", "cutshort", "hirist"]) {
      const s = SOURCES.find((x) => x.key === k)!;
      expect(s.fetch).toBeUndefined();
      expect(["gmail-alert", "manual", "rss"]).toContain(s.kind);
      expect(s.compliance.length).toBeGreaterThan(40);
    }
  });
});
