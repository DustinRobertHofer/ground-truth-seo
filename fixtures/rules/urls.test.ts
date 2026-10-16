import { describe, expect, it } from "vitest";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, redirect, reportOf, xml } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/`, max_pages: 20 };

function sitemapWith(...paths: string[]) {
  const locs = ["/", "/about", "/contact", ...paths].map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join("\n");
  return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>\n`);
}

function expectPass(report: Report, id: string) {
  expect(findingsOf(report, id, "pass").length).toBeGreaterThan(0);
  expect(findingsOf(report, id, "fail")).toEqual([]);
}

function expectFail(report: Report, id: string, code: string) {
  expect(conditionsOf(report, id)).toContain(code);
  const finding = findingsOf(report, id, "fail").find((f) => f.condition === code)!;
  expect(finding.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  expect(finding.citations.length).toBeGreaterThan(0);
}

/** The baseline home page with extra body markup. */
function homeWith(extraBody: string) {
  const home = `${ORIGIN}/`;
  return page(
    "Example Home",
    `<link rel="canonical" href="${home}"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width">`,
    `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> ${extraBody}`,
  );
}

describe("SEO-URL-01 variants redirect to the preferred origin", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-URL-01");
  });

  it("fails variant_serves_content when a variant answers 200", async () => {
    const site = baselineSite();
    site.responses["http://example.com/"] = page("Duplicate home");
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-01", "variant_serves_content");
    expect(conditionsOf(report, "SEO-URL-01")).toEqual(["variant_serves_content"]);
  });

  it("fails variant_temporary_redirect for a 302", async () => {
    const site = baselineSite();
    site.responses["http://example.com/"] = redirect(`${ORIGIN}/`, 302);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-01", "variant_temporary_redirect");
    expect(conditionsOf(report, "SEO-URL-01")).toEqual(["variant_temporary_redirect"]);
  });

  it("fails variant_wrong_target when the path is dropped", async () => {
    const site = baselineSite();
    site.responses["http://example.com/about"] = redirect(`${ORIGIN}/`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-01", "variant_wrong_target");
    expect(conditionsOf(report, "SEO-URL-01")).toEqual(["variant_wrong_target"]);
  });

  it("fails variant_multi_hop when the preferred URL is reached in two hops", async () => {
    const site = baselineSite();
    site.responses["http://example.com/"] = redirect("http://www.example.com/");
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-01", "variant_multi_hop");
    expect(conditionsOf(report, "SEO-URL-01")).toEqual(["variant_multi_hop"]);
  });
});

describe("SEO-URL-02 URLs contain only allowed characters", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-URL-02");
  });

  it("fails invalid_characters for a link with a space", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = homeWith(`<a href="/about us">Team</a>`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-02", "invalid_characters");
    expect(conditionsOf(report, "SEO-URL-02")).toEqual(["invalid_characters"]);
    expect(findingsOf(report, "SEO-URL-02", "fail")[0]!.reason).toContain("space");
  });

  it("fails bad_percent_encoding for a malformed escape", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = homeWith(`<a href="/sale%zz">Sale</a>`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-02", "bad_percent_encoding");
    expect(conditionsOf(report, "SEO-URL-02")).toEqual(["bad_percent_encoding"]);
  });
});

describe("SEO-URL-03 hyphens separate words in paths", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-URL-03");
  });

  it("fails underscore_in_path for an intended URL with an underscore", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/about_us");
    site.responses[`${ORIGIN}/about_us`] = page("About us", `<link rel="canonical" href="${ORIGIN}/about_us">`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-03", "underscore_in_path");
    expect(findingsOf(report, "SEO-URL-03", "fail").map((f) => f.unit)).toEqual([`${ORIGIN}/about_us`]);
  });
});

describe("SEO-URL-04 no fragment routing", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-URL-04");
  });

  it("fails fragment_routes for hash-bang and slash fragments", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = homeWith(`<a href="/#!/products">Products</a> <a href="#/cart">Cart</a> <a href="#reviews">Reviews</a>`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-04", "fragment_routes");
    expect(findingsOf(report, "SEO-URL-04", "fail")[0]!.observed.n).toBe(2);
  });
});

describe("SEO-URL-05 one URL per resource regardless of case", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-URL-05");
  });

  it("fails case_duplicates when two case variants return 200 without a shared canonical", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = homeWith(`<a href="/About">About (capitalized)</a>`);
    site.responses[`${ORIGIN}/About`] = page("About Example (dup)", `<link rel="canonical" href="${ORIGIN}/About">`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-URL-05", "case_duplicates");
    expect(conditionsOf(report, "SEO-URL-05")).toEqual(["case_duplicates"]);
  });

  it("passes when case variants agree on one canonical", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = homeWith(`<a href="/About">About (capitalized)</a>`);
    site.responses[`${ORIGIN}/About`] = page("About Example (dup)", `<link rel="canonical" href="${ORIGIN}/about">`);
    const { report } = await reportOf(site, START);
    expectPass(report, "SEO-URL-05");
  });
});
