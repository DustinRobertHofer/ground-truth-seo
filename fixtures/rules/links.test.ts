import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, reportOf, xml, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/` };

function sitemap(paths: string[]) {
  const urls = paths.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join("\n");
  return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

/** The baseline with extra responses merged in. */
function site(extra: FakeSite["responses"]): FakeSite {
  const base = baselineSite(ORIGIN);
  return { ...base, responses: { ...base.responses, ...extra } };
}

const HOME_HEAD = `<link rel="canonical" href="${ORIGIN}/"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"${ORIGIN}/"}</script>`;
const HOME_BODY = `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <img src="/photo.png" alt="Office" width="100" height="100">`;

function home(bodyExtra: string): ReturnType<typeof page> {
  return page("Example Home", HOME_HEAD, `${HOME_BODY} ${bodyExtra}`);
}

function expectWellFormedFails(findings: Finding[]) {
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    expect(f.reason, `${f.rule_id}/${f.condition}`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(f.citations.length, `${f.rule_id}/${f.condition}`).toBeGreaterThan(0);
  }
}

describe("SEO-LINK-02 every intended page is linked", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-LINK-02")).toEqual([]);
    expect(findingsOf(report, "SEO-LINK-02", "pass").map((f) => f.unit).sort()).toEqual([`${ORIGIN}/about`, `${ORIGIN}/contact`]);
  });

  it("fails orphan for a sitemap-listed page nobody links to", async () => {
    const s = site({
      [`${ORIGIN}/sitemap.xml`]: sitemap(["/", "/about", "/contact", "/orphan"]),
      [`${ORIGIN}/orphan`]: page("Orphan", `<link rel="canonical" href="${ORIGIN}/orphan"><meta name="description" content="An orphan page."><meta name="viewport" content="width=device-width">`, `<h1>Orphan</h1><p>Nobody links here.</p><a href="/">Home page</a>`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-LINK-02")).toContain("orphan");
    const fails = findingsOf(report, "SEO-LINK-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/orphan`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain(`${ORIGIN}/sitemap.xml`);
  });

  it("fails only_nofollow when every inbound link carries nofollow", async () => {
    const s = site({
      [`${ORIGIN}/sitemap.xml`]: sitemap(["/", "/about", "/contact", "/newsletter"]),
      [`${ORIGIN}/`]: home(`<a href="/newsletter" rel="nofollow">Newsletter archive</a>`),
      [`${ORIGIN}/newsletter`]: page("Newsletter", `<link rel="canonical" href="${ORIGIN}/newsletter"><meta name="description" content="The newsletter."><meta name="viewport" content="width=device-width">`, `<h1>Newsletter</h1><p>Text.</p><a href="/">Home page</a>`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-LINK-02")).toContain("only_nofollow");
    const fails = findingsOf(report, "SEO-LINK-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/newsletter`]);
    expectWellFormedFails(fails);
  });
});

describe("SEO-LINK-03 anchor text is descriptive", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-LINK-03")).toEqual([]);
    expect(findingsOf(report, "SEO-LINK-03", "pass").length).toBe(3);
  });

  it("fails generic_text for 'click here'", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<a href="/about">Click here</a>`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-LINK-03")).toEqual(["generic_text"]);
    const fails = findingsOf(report, "SEO-LINK-03", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("Click here");
  });

  it("fails empty_text for a link with neither text nor image alt", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<a href="/about"><img src="/photo.png" alt="" width="10" height="10"></a>`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-LINK-03")).toEqual(["empty_text"]);
    const fails = findingsOf(report, "SEO-LINK-03", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain(`${ORIGIN}/about`);
  });

  it("reports aria_label_only as info, not a failure", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<a href="/about" aria-label="About the company"></a>`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-LINK-03")).toEqual([]);
    expect(findingsOf(report, "SEO-LINK-03", "info").map((f) => f.condition)).toEqual(["aria_label_only"]);
  });
});

describe("SEO-HDG-02 heading levels do not skip", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-HDG-02")).toEqual([]);
    expect(findingsOf(report, "SEO-HDG-02", "pass").length).toBe(3);
  });

  it("fails skipped_level for an h1 followed by an h3", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<h3>Deep heading</h3>`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-HDG-02")).toEqual(["skipped_level"]);
    const fails = findingsOf(report, "SEO-HDG-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("<h1>");
    expect(fails[0]!.reason).toContain("<h3>");
    expect(fails[0]!.reason).toContain("Deep heading");
  });

  it("allows going back up and down by one level", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<h2>Section</h2><h3>Sub</h3><h2>Another</h2><h3>Sub two</h3>`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-HDG-02")).toEqual([]);
  });
});

describe("informational link and heading rules", () => {
  it("SEO-HDG-01 reports the heading inventory for every page", async () => {
    const { report } = await reportOf(baselineSite(), START);
    const infos = findingsOf(report, "SEO-HDG-01", "info");
    expect(infos.length).toBe(3);
    const homeInfo = infos.find((f) => f.unit === `${ORIGIN}/`)!;
    expect(homeInfo.condition).toBe("inventory");
    expect(homeInfo.observed.n).toBe(1);
    expect(homeInfo.observed.text).toBe("Example");
    expect(homeInfo.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-HDG-01")).toEqual([]);
  });

  it("SEO-LINK-01 reports uncrawlable links", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<a>Menu</a> <a href="javascript:void(0)">Open</a> <span href="/contact">Contact</span> <div routerLink="/about">About</div>`) });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-LINK-01", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expect(infos[0]!.condition).toBe("uncrawlable");
    expect(infos[0]!.observed.n).toBe(4);
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(infos[0]!.citations.length).toBeGreaterThan(0);
    expect(conditionsOf(report, "SEO-LINK-01")).toEqual([]);
    // The baseline has none.
    const clean = await reportOf(baselineSite(), START);
    expect(findingsOf(clean.report, "SEO-LINK-01")).toEqual([]);
  });

  it("SEO-LINK-06 reports internal links to error URLs", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<a href="/missing-page">Old brochure</a>`) });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-LINK-06", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expect(infos[0]!.condition).toBe("error_targets");
    expect(infos[0]!.observed.target).toBe(`${ORIGIN}/missing-page`);
    expect(infos[0]!.observed.status).toBe(404);
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-LINK-06")).toEqual([]);
  });
});
