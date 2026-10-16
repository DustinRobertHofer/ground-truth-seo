import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/scanner/evaluate/index.js";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, reportOf, snapshotOf, text, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const CONFIG = { start_url: HOME, max_pages: 20 };

/** The baseline site with some responses replaced or added. */
function siteWith(overrides: FakeSite["responses"]): FakeSite {
  const site = baselineSite(ORIGIN);
  return { ...site, responses: { ...site.responses, ...overrides } };
}

/** A home page that also links to `/hidden`, a page the sitemap does not list (so it is fetched but not intended). */
function homeLinkingTo(path: string) {
  return page(
    "Example Home",
    `<link rel="canonical" href="${HOME}"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width">`,
    `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <a href="${path}">Hidden page</a>`,
  );
}

function expectWellFormedFails(report: Report, ruleId: string): void {
  const fails = findingsOf(report, ruleId, "fail");
  expect(fails.length).toBeGreaterThan(0);
  for (const finding of fails) {
    expect(finding.reason, `${ruleId}/${finding.condition} reason`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(finding.citations.length, `${ruleId}/${finding.condition} citations`).toBeGreaterThan(0);
  }
}

describe("SEO-IDX-06 intended URLs carry no noindex", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(conditionsOf(report, "SEO-IDX-06")).toEqual([]);
    expect(findingsOf(report, "SEO-IDX-06", "pass").length).toBe(3);
  });

  it("fails noindex for a sitemap-listed page with a robots meta noindex", async () => {
    const site = siteWith({ [`${ORIGIN}/about`]: page("About Example", `<meta name="robots" content="noindex">`) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-IDX-06")).toEqual(["noindex"]);
    expectWellFormedFails(report, "SEO-IDX-06");
    const finding = findingsOf(report, "SEO-IDX-06", "fail")[0]!;
    expect(finding.unit).toBe(`${ORIGIN}/about`);
    expect(finding.reason).toContain(`it is in ${ORIGIN}/sitemap.xml`);
    expect(report.headline.blocked).toBe(1);
    // The blocked page is judged by its gate alone: no other page rule reports it.
    expect(findingsOf(report, "SEO-HEAD-01").map((f) => f.unit)).not.toContain(`${ORIGIN}/about`);
  });

  it("fails unavailable_after_passed when the date is before completed_at", async () => {
    const site = siteWith({ [`${ORIGIN}/contact`]: page("Contact Example", `<meta name="robots" content="unavailable_after: 2020-01-01T00:00:00Z">`) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-IDX-06")).toEqual(["unavailable_after_passed"]);
    expectWellFormedFails(report, "SEO-IDX-06");
    expect(findingsOf(report, "SEO-IDX-06", "fail")[0]!.reason).toContain("2020-01-01T00:00:00Z");
  });

  it("fails noindex_after_render only in rendered mode when JavaScript adds noindex", async () => {
    const { snapshot, config } = await snapshotOf(baselineSite(), CONFIG);
    snapshot.rendered = { [`${ORIGIN}/about`]: "<html><head><meta name=robots content=noindex><title>x</title></head><body></body></html>" };
    const raw = evaluate(snapshot, config);
    expect(conditionsOf(raw, "SEO-IDX-06")).toEqual([]);
    const rendered = evaluate(snapshot, { ...config, render: true });
    expect(conditionsOf(rendered, "SEO-IDX-06")).toEqual(["noindex_after_render"]);
    expectWellFormedFails(rendered, "SEO-IDX-06");
    expect(findingsOf(rendered, "SEO-IDX-06", "fail")[0]!.unit).toBe(`${ORIGIN}/about`);
  });
});

describe("SEO-IDX-02 noindex is not hidden behind a robots.txt disallow", () => {
  it("passes for a crawlable noindexed page", async () => {
    const site = siteWith({
      [HOME]: homeLinkingTo("/hidden"),
      [`${ORIGIN}/hidden`]: page("Hidden", `<meta name="robots" content="noindex">`),
    });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-IDX-02")).toEqual([]);
    expect(findingsOf(report, "SEO-IDX-02", "pass").map((f) => f.unit)).toEqual([`${ORIGIN}/hidden`]);
  });

  it("fails noindex_behind_disallow when Googlebot may not fetch the noindexed page", async () => {
    const site = siteWith({
      [`${ORIGIN}/robots.txt`]: text(`User-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap.xml\n\nUser-agent: Googlebot\nDisallow: /hidden\n`),
      [HOME]: homeLinkingTo("/hidden"),
      [`${ORIGIN}/hidden`]: page("Hidden", `<meta name="robots" content="noindex">`),
    });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-IDX-02")).toEqual(["noindex_behind_disallow"]);
    expectWellFormedFails(report, "SEO-IDX-02");
    const finding = findingsOf(report, "SEO-IDX-02", "fail")[0]!;
    expect(finding.unit).toBe(`${ORIGIN}/hidden`);
    expect(finding.reason).toContain("Disallow: /hidden");
  });
});

describe("SEO-IDX-03 noindex is not placed in robots.txt", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(conditionsOf(report, "SEO-IDX-03")).toEqual([]);
    expect(findingsOf(report, "SEO-IDX-03", "pass").map((f) => f.unit)).toEqual([ORIGIN]);
  });

  it("fails noindex_in_robots_txt for a Noindex line", async () => {
    const site = siteWith({ [`${ORIGIN}/robots.txt`]: text(`User-agent: *\nDisallow: /private/\nNoindex: /drafts/\nSitemap: ${ORIGIN}/sitemap.xml\n`) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-IDX-03")).toEqual(["noindex_in_robots_txt"]);
    expectWellFormedFails(report, "SEO-IDX-03");
    const finding = findingsOf(report, "SEO-IDX-03", "fail")[0]!;
    expect(finding.reason).toContain("line 3");
    expect(finding.reason).toContain("Noindex: /drafts/");
  });
});

describe("SEO-IDX-04 server HTML does not carry a noindex that JavaScript removes", () => {
  it("is not evaluated without rendered mode and passes when the rendered DOM keeps the directives", async () => {
    const { snapshot, config, report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-IDX-04").map((f) => f.status)).toEqual(["not_evaluated"]);
    snapshot.rendered = { [HOME]: "<html><head><title>x</title></head><body></body></html>" };
    const rendered = evaluate(snapshot, { ...config, render: true });
    expect(conditionsOf(rendered, "SEO-IDX-04")).toEqual([]);
    expect(findingsOf(rendered, "SEO-IDX-04", "pass").map((f) => f.unit)).toEqual([HOME]);
  });

  it("fails raw_noindex_removed_by_js when the rendered DOM drops the raw noindex", async () => {
    const site = siteWith({
      [HOME]: homeLinkingTo("/hidden"),
      [`${ORIGIN}/hidden`]: page("Hidden", `<meta name="robots" content="noindex">`),
    });
    const { snapshot, config } = await snapshotOf(site, CONFIG);
    snapshot.rendered = { [`${ORIGIN}/hidden`]: "<html><head><title>Hidden</title></head><body></body></html>" };
    const report = evaluate(snapshot, { ...config, render: true });
    expect(conditionsOf(report, "SEO-IDX-04")).toEqual(["raw_noindex_removed_by_js"]);
    expectWellFormedFails(report, "SEO-IDX-04");
    const finding = findingsOf(report, "SEO-IDX-04", "fail")[0]!;
    expect(finding.unit).toBe(`${ORIGIN}/hidden`);
    expect(finding.reason).toContain("meta robots (line");
  });
});

describe("SEO-IDX-01 noindex inventory (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-IDX-01", "info")).toEqual([]);
  });

  it("lists a fetched noindexed page that is not intended", async () => {
    const site = siteWith({
      [HOME]: homeLinkingTo("/hidden"),
      [`${ORIGIN}/hidden`]: { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" }, body: page("Hidden").body },
    });
    const { report } = await reportOf(site, CONFIG);
    const infos = findingsOf(report, "SEO-IDX-01", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/hidden`]);
    expect(infos[0]!.condition).toBe("inventory");
    expect(infos[0]!.reason).toContain("the X-Robots-Tag header");
    expect(infos[0]!.reason).toContain("not in the intended-indexable set");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });
});

describe("SEO-IDX-05 how robots directives combine (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-IDX-05", "info")).toEqual([]);
  });

  it("explains two robots meta tags on one page", async () => {
    const site = siteWith({
      [`${ORIGIN}/about`]: page("About Example", `<meta name="robots" content="nofollow"><meta name="googlebot" content="noimageindex">`),
    });
    const { report } = await reportOf(site, CONFIG);
    const infos = findingsOf(report, "SEO-IDX-05", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/about`]);
    expect(infos[0]!.condition).toBe("combined");
    expect(infos[0]!.reason).toContain("nofollow, noimageindex");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });
});
