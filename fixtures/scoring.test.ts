/**
 * Scoring against the best documented setup (PRODUCT.md §7): a practice the
 * site has not adopted counts as unmet, the report says what to add, and the
 * AI answers readiness list says which documented conditions are in place.
 */

import { describe, expect, it } from "vitest";
import { baselineSite, findingsOf, page, reportOf, text } from "../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const START = { start_url: HOME, max_pages: 20 };

/** The baseline with every adoptable practice stripped: no sitemap, descriptions, favicon or WebSite. */
function bareSite() {
  const site = baselineSite();
  site.responses[`${ORIGIN}/robots.txt`] = text("User-agent: *\nDisallow: /private/\n");
  delete site.responses[`${ORIGIN}/sitemap.xml`];
  site.responses[HOME] = page("Example Home", `<link rel="canonical" href="${HOME}"><meta name="viewport" content="width=device-width">`, `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a>`);
  site.responses[`${ORIGIN}/about`] = page("About Example", `<link rel="canonical" href="${ORIGIN}/about"><meta name="viewport" content="width=device-width">`, `<h1>About</h1><p>Text.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`);
  site.responses[`${ORIGIN}/contact`] = page("Contact Example", `<link rel="canonical" href="${ORIGIN}/contact"><meta name="viewport" content="width=device-width">`, `<h1>Contact</h1><p>Text.</p><a href="/">Home page</a> <a href="/about">About the company</a>`);
  return site;
}

describe("opportunities count against the score", () => {
  it("rates a bare but well-formed site below 100, with nothing broken", async () => {
    const { report } = await reportOf(bareSite(), START);
    expect(report.findings.filter((f) => f.status === "fail")).toEqual([]);
    expect(report.headline.critical_failures + report.headline.major_failures + report.headline.minor_failures).toBe(0);
    expect(report.headline.blocked).toBe(0);
    expect(report.headline.overall).not.toBeNull();
    expect(report.headline.overall!).toBeLessThan(100);
    expect(report.headline.arithmetic).toMatch(/^Overall \d+ = 100 × eligibility 1 × achieved \d+\/\d+$/);
    // Four practices are absent: sitemap (site), descriptions (3 pages), favicon (home), WebSite (origin).
    const byRule = new Map<string, number>();
    for (const f of report.findings) if (f.status === "opportunity") byRule.set(f.rule_id, (byRule.get(f.rule_id) ?? 0) + 1);
    expect(Object.fromEntries(byRule)).toEqual({ "SEO-META-02C": 3, "SEO-META-05A": 1, "SEO-SD-04": 1, "SEO-SITEMAP-08": 1 });
    expect(report.headline.opportunities).toBe(6);
  });

  it("lists every opportunity as something to add, after what is broken at the same weight", async () => {
    const site = bareSite();
    // One genuine failure at weight 4: a duplicate title shared by two pages (SEO-META-01).
    site.responses[`${ORIGIN}/about`] = page("Example Home", `<link rel="canonical" href="${ORIGIN}/about"><meta name="viewport" content="width=device-width">`, `<h1>About</h1><p>Text.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`);
    const { report } = await reportOf(site, START);
    const recs = report.recommendations;
    expect(recs.every((r) => r.kind === "fix" || r.kind === "add")).toBe(true);
    expect(recs.filter((r) => r.kind === "add").map((r) => r.rule_id).sort()).toEqual(["SEO-META-02C", "SEO-META-05A", "SEO-SD-04", "SEO-SITEMAP-08"]);
    // Feature gates first, then weight, then fix before add.
    expect(recs[0]).toMatchObject({ rule_id: "SEO-META-05A", kind: "add", gate: "feature:favicon" });
    const weightFour = recs.filter((r) => r.weight === 4 && !r.gate);
    const firstAdd = weightFour.findIndex((r) => r.kind === "add");
    const lastFix = weightFour.map((r) => r.kind).lastIndexOf("fix");
    expect(lastFix).toBeLessThan(firstAdd);
    for (const rec of recs.filter((r) => r.kind === "add")) {
      expect(rec.action.length).toBeGreaterThan(0);
      expect(rec.outcome.length).toBeGreaterThan(0);
      expect(rec.citations.length).toBeGreaterThan(0);
    }
  });

  it("restores a perfect score once the practices are in place", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(report.headline.overall).toBe(100);
    expect(report.headline.opportunities).toBe(0);
    expect(report.findings.filter((f) => f.status === "opportunity")).toEqual([]);
  });

  it("keeps opportunities out of the eligibility factor", async () => {
    const { report } = await reportOf(bareSite(), START);
    expect(report.headline.eligibility).toBe("1");
    expect(report.headline.gates.every((g) => g.blocked === 0)).toBe(true);
  });
});

describe("AI answers readiness", () => {
  it("reports every documented condition as in place on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    const byKey = Object.fromEntries(report.ai_readiness!.items.map((i) => [i.key, i.status]));
    expect(byKey).toEqual({
      google_snippet: "in_place",
      bing_answers: "in_place",
      bing_sitemap_lastmod: "in_place",
      crawler_googlebot: "in_place",
      crawler_bingbot: "in_place",
      crawler_oai_searchbot: "in_place",
      crawler_claude_searchbot: "in_place",
      crawler_perplexitybot: "in_place",
      crawler_applebot: "in_place",
      crawler_meta_webindexer: "in_place",
      llms_txt: "optional",
    });
    expect(report.ai_readiness!.intro).toContain("Nothing here is scored");
    for (const item of report.ai_readiness!.items) expect(item.detail.length).toBeGreaterThan(0);
  });

  it("reflects nosnippet, a missing sitemap and a blocked AI search crawler without touching the score", async () => {
    const site = bareSite();
    site.responses[`${ORIGIN}/robots.txt`] = text("User-agent: *\nDisallow: /private/\n\nUser-agent: OAI-SearchBot\nDisallow: /\n");
    site.responses[`${ORIGIN}/about`] = page("About Example", `<link rel="canonical" href="${ORIGIN}/about"><meta name="robots" content="nosnippet, noarchive"><meta name="viewport" content="width=device-width">`, `<h1>About</h1><p>Text.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`);
    const { report } = await reportOf(site, START);
    const item = (key: string) => report.ai_readiness!.items.find((i) => i.key === key)!;
    expect(item("google_snippet")).toMatchObject({ status: "not_in_place" });
    expect(item("google_snippet").detail).toContain("1 of 3");
    expect(item("bing_answers")).toMatchObject({ status: "not_in_place" });
    expect(item("bing_sitemap_lastmod")).toMatchObject({ status: "not_in_place", detail: "No sitemap was found; see SEO-SITEMAP-08." });
    expect(item("crawler_oai_searchbot")).toMatchObject({ status: "not_in_place" });
    expect(item("crawler_oai_searchbot").detail).toContain("disallowed");
    expect(item("crawler_googlebot")).toMatchObject({ status: "in_place" });
    // Readiness never enters the score: the same bare site without these policies scores the same.
    const { report: plain } = await reportOf(bareSite(), START);
    expect(report.headline.overall).toBe(plain.headline.overall);
    expect(findingsOf(report, "SEO-AI-01", "info").length).toBe(1);
  });
});
