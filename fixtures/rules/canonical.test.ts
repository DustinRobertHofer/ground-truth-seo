import { beforeAll, describe, expect, it } from "vitest";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, redirect, reportOf, text, xml, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/` };

/** The baseline sitemap plus extra paths. */
function sitemapWith(...paths: string[]): string {
  const locs = ["/", "/about", "/contact", ...paths].map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>\n`;
}

/** A site whose sitemap also lists `paths`. */
function siteWith(paths: string[] = []): FakeSite {
  const site = baselineSite();
  site.responses[`${ORIGIN}/sitemap.xml`] = xml(sitemapWith(...paths));
  return site;
}

/** Add a link from the home page body so a URL is reached by the crawl. */
function linkFromHome(site: FakeSite, href: string, label = "Extra link"): void {
  const home = site.responses[`${ORIGIN}/`];
  if (typeof home === "string" || !home || typeof home.body !== "string") throw new Error("unexpected home page");
  home.body = home.body.replace("</body>", `<a href="${href}">${label}</a></body>`);
}

/** Every failing finding of a rule has a fully filled reason and at least one citation. */
function expectWellFormedFails(report: Report, ruleId: string): void {
  const fails = findingsOf(report, ruleId, "fail");
  expect(fails.length).toBeGreaterThan(0);
  for (const finding of fails) {
    expect(finding.reason, `${ruleId}/${finding.condition}`).toBeTruthy();
    expect(finding.reason, `${ruleId}/${finding.condition}`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(finding.citations.length, `${ruleId}/${finding.condition}`).toBeGreaterThan(0);
  }
}

function expectPass(report: Report, ruleId: string, unit?: string): void {
  expect(conditionsOf(report, ruleId)).toEqual([]);
  const passes = findingsOf(report, ruleId, "pass");
  expect(passes.length).toBeGreaterThan(0);
  if (unit) expect(passes.map((f) => f.unit)).toContain(unit);
}

const canonical = (href: string) => `<link rel="canonical" href="${href}">`;

describe("canonical rules on the baseline", () => {
  let report: Report;
  beforeAll(async () => {
    ({ report } = await reportOf(baselineSite(), START));
  });

  it("SEO-CANON-01 passes", () => expectPass(report, "SEO-CANON-01", `${ORIGIN}/`));
  it("SEO-CANON-02 passes", () => expectPass(report, "SEO-CANON-02", `${ORIGIN}/`));
  it("SEO-CANON-08 passes", () => expectPass(report, "SEO-CANON-08", `${ORIGIN}/`));
  it("SEO-CANON-05 passes", () => expectPass(report, "SEO-CANON-05", `${ORIGIN}/`));
  it("SEO-CANON-03 reports self-referencing canonicals", () => {
    const infos = findingsOf(report, "SEO-CANON-03", "info");
    expect(infos.map((f) => f.condition)).toEqual(["self_referencing", "self_referencing", "self_referencing"]);
  });
});

describe("SEO-CANON-01 · canonical inside the head", () => {
  it("fails outside_head when an <iframe> closes the head before the canonical", async () => {
    const site = siteWith(["/framed"]);
    site.responses[`${ORIGIN}/framed`] = page("Framed", `<iframe src="/about"></iframe>${canonical(`${ORIGIN}/framed`)}`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-01")).toContain("outside_head");
    expectWellFormedFails(report, "SEO-CANON-01");
    const fail = findingsOf(report, "SEO-CANON-01", "fail")[0]!;
    expect(fail.unit).toBe(`${ORIGIN}/framed`);
    expect(fail.reason).toContain("because the parser closed <head>");
  });

  it("fails outside_head when the only canonical is in the body", async () => {
    const site = siteWith(["/bodycanon"]);
    site.responses[`${ORIGIN}/bodycanon`] = page("Body canonical", "", `<h1>Body</h1>${canonical(`${ORIGIN}/bodycanon`)}`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-01")).toContain("outside_head");
    expectWellFormedFails(report, "SEO-CANON-01");
    expect(findingsOf(report, "SEO-CANON-01", "fail")[0]!.unit).toBe(`${ORIGIN}/bodycanon`);
  });
});

describe("SEO-CANON-02 · canonical URLs are absolute", () => {
  it("fails relative for a root-relative href", async () => {
    const site = siteWith(["/rel"]);
    site.responses[`${ORIGIN}/rel`] = page("Relative", canonical("/rel"));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-02")).toContain("relative");
    expectWellFormedFails(report, "SEO-CANON-02");
    expect(findingsOf(report, "SEO-CANON-02", "fail")[0]!.reason).toContain("“/rel”");
  });

  it("fails relative for a protocol-relative href", async () => {
    const site = siteWith(["/protorel"]);
    site.responses[`${ORIGIN}/protorel`] = page("Protocol relative", canonical("//www.example.com/protorel"));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-02")).toContain("relative");
    expectWellFormedFails(report, "SEO-CANON-02");
  });

  it("fails empty_href for a canonical without a URL", async () => {
    const site = siteWith(["/empty"]);
    site.responses[`${ORIGIN}/empty`] = page("Empty", canonical(""));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-02")).toContain("empty_href");
    expectWellFormedFails(report, "SEO-CANON-02");
  });
});

describe("SEO-CANON-08 · one canonical URL per page", () => {
  it("fails conflicting_canonicals for two head canonicals with different URLs", async () => {
    const site = siteWith(["/two"]);
    site.responses[`${ORIGIN}/two`] = page("Two", `${canonical(`${ORIGIN}/two`)}${canonical(`${ORIGIN}/about`)}`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-08")).toContain("conflicting_canonicals");
    expectWellFormedFails(report, "SEO-CANON-08");
    const fail = findingsOf(report, "SEO-CANON-08", "fail")[0]!;
    expect(fail.unit).toBe(`${ORIGIN}/two`);
    expect(fail.reason).toContain("2 different canonical URLs");
  });

  it("fails conflicting_canonicals when a Link header names a different canonical", async () => {
    const site = siteWith(["/hdr"]);
    const p = page("Header", canonical(`${ORIGIN}/hdr`));
    p.headers = { ...p.headers, link: `<${ORIGIN}/other>; rel="canonical"` };
    site.responses[`${ORIGIN}/hdr`] = p;
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-08")).toContain("conflicting_canonicals");
    expectWellFormedFails(report, "SEO-CANON-08");
    expect(findingsOf(report, "SEO-CANON-08", "fail")[0]!.reason).toContain(`${ORIGIN}/other`);
  });
});

describe("SEO-CANON-04 · the canonical target is usable", () => {
  it("passes when the target is a 200, self-canonical page", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/about`));
    const { report } = await reportOf(site, START);
    expectPass(report, "SEO-CANON-04", `${ORIGIN}/dup`);
  });

  it("fails target_error when the target returns 404", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/gone`));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-04")).toContain("target_error");
    expectWellFormedFails(report, "SEO-CANON-04");
    expect(findingsOf(report, "SEO-CANON-04", "fail")[0]!.unit).toBe(`${ORIGIN}/dup`);
  });

  it("fails target_permanent_redirect when the target 301s", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/old-about`));
    site.responses[`${ORIGIN}/old-about`] = redirect(`${ORIGIN}/about`, 301);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-04")).toContain("target_permanent_redirect");
    expectWellFormedFails(report, "SEO-CANON-04");
    expect(findingsOf(report, "SEO-CANON-04", "fail")[0]!.reason).toContain(`permanently redirects to ${ORIGIN}/about`);
  });

  it("does not fail when the target 302s (temporary redirect)", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/temp`));
    site.responses[`${ORIGIN}/temp`] = redirect(`${ORIGIN}/about`, 302);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-04")).toEqual([]);
  });

  it("fails target_canonical_chain when the target names a third URL", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/mid`));
    site.responses[`${ORIGIN}/mid`] = page("Mid", canonical(`${ORIGIN}/about`));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-04")).toContain("target_canonical_chain");
    expectWellFormedFails(report, "SEO-CANON-04");
    expect(findingsOf(report, "SEO-CANON-04", "fail")[0]!.reason).toContain(`${ORIGIN}/mid names ${ORIGIN}/about`);
  });
});

describe("SEO-CANON-05 · internal links and hreflang point to canonical URLs", () => {
  it("fails links_to_redirects when a link targets a redirecting URL", async () => {
    const site = siteWith();
    site.responses[`${ORIGIN}/old-about`] = redirect(`${ORIGIN}/about`, 301);
    linkFromHome(site, "/old-about", "Old about");
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-05")).toContain("links_to_redirects");
    expectWellFormedFails(report, "SEO-CANON-05");
    const fail = findingsOf(report, "SEO-CANON-05", "fail").find((f) => f.condition === "links_to_redirects")!;
    expect(fail.unit).toBe(`${ORIGIN}/`);
    expect(fail.reason).toContain(`redirects to ${ORIGIN}/about`);
  });

  it("fails links_to_non_canonical when a link targets a page whose canonical is another URL", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/about`));
    linkFromHome(site, "/dup", "Duplicate about");
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-05")).toContain("links_to_non_canonical");
    expectWellFormedFails(report, "SEO-CANON-05");
    const fail = findingsOf(report, "SEO-CANON-05", "fail").find((f) => f.condition === "links_to_non_canonical")!;
    expect(fail.reason).toContain(`canonical: ${ORIGIN}/about`);
  });

  it("fails hreflang_to_non_canonical when an alternate names another canonical", async () => {
    const site = siteWith(["/fr"]);
    site.responses[`${ORIGIN}/fr`] = page("FR", canonical(`${ORIGIN}/about`));
    const home = site.responses[`${ORIGIN}/`] as { body: string };
    home.body = home.body.replace("</head>", `<link rel="alternate" hreflang="fr" href="/fr"></head>`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-05")).toContain("hreflang_to_non_canonical");
    expectWellFormedFails(report, "SEO-CANON-05");
    const fail = findingsOf(report, "SEO-CANON-05", "fail").find((f) => f.condition === "hreflang_to_non_canonical")!;
    expect(fail.reason).toContain(`names ${ORIGIN}/about as canonical`);
  });

  it("fails hreflang_to_non_canonical when an alternate redirects", async () => {
    const site = siteWith();
    site.responses[`${ORIGIN}/de`] = redirect(`${ORIGIN}/about`, 301);
    const home = site.responses[`${ORIGIN}/`] as { body: string };
    home.body = home.body.replace("</head>", `<link rel="alternate" hreflang="de" href="/de"></head>`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-05")).toContain("hreflang_to_non_canonical");
    const fail = findingsOf(report, "SEO-CANON-05", "fail").find((f) => f.condition === "hreflang_to_non_canonical")!;
    expect(fail.reason).toContain(`redirects to ${ORIGIN}/about`);
  });
});

describe("SEO-CANON-07 · noindex and robots.txt are not used to choose canonicals", () => {
  it("passes for a cross canonical to an indexable, crawlable target", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/about`));
    const { report } = await reportOf(site, START);
    expectPass(report, "SEO-CANON-07", `${ORIGIN}/dup`);
  });

  it("fails noindex_with_cross_canonical for a noindex page (outside the sitemap) with a cross canonical", async () => {
    const site = siteWith();
    site.responses[`${ORIGIN}/dup`] = page("Dup", `<meta name="robots" content="noindex">${canonical(`${ORIGIN}/about`)}`);
    linkFromHome(site, "/dup", "Duplicate about");
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-07")).toContain("noindex_with_cross_canonical");
    expectWellFormedFails(report, "SEO-CANON-07");
    expect(findingsOf(report, "SEO-CANON-07", "fail")[0]!.unit).toBe(`${ORIGIN}/dup`);
  });

  it("fails target_noindex when the canonical target carries noindex", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/target`));
    site.responses[`${ORIGIN}/target`] = page("Target", `<meta name="robots" content="noindex">${canonical(`${ORIGIN}/target`)}`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-07")).toContain("target_noindex");
    expectWellFormedFails(report, "SEO-CANON-07");
    expect(findingsOf(report, "SEO-CANON-07", "fail")[0]!.reason).toContain(`${ORIGIN}/target carries noindex`);
  });

  it("fails target_disallowed when robots.txt disallows the target for Googlebot", async () => {
    const site = siteWith(["/dup"]);
    site.responses[`${ORIGIN}/robots.txt`] = text(`User-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap.xml\n\nUser-agent: Googlebot\nDisallow: /target\n`);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/target`));
    site.responses[`${ORIGIN}/target`] = page("Target", canonical(`${ORIGIN}/target`));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-CANON-07")).toContain("target_disallowed");
    expectWellFormedFails(report, "SEO-CANON-07");
    expect(findingsOf(report, "SEO-CANON-07", "fail")[0]!.reason).toContain("Disallow: /target");
  });
});

describe("SEO-CANON-03 · canonical inventory (info)", () => {
  it("reports cross_page and absent canonicals", async () => {
    const site = siteWith(["/dup", "/nocanon"]);
    site.responses[`${ORIGIN}/dup`] = page("Dup", canonical(`${ORIGIN}/about`));
    site.responses[`${ORIGIN}/nocanon`] = page("No canonical");
    const { report } = await reportOf(site, START);
    const infos = findingsOf(report, "SEO-CANON-03", "info");
    const byUnit = Object.fromEntries(infos.map((f) => [f.unit, f.condition]));
    expect(byUnit[`${ORIGIN}/`]).toBe("self_referencing");
    expect(byUnit[`${ORIGIN}/dup`]).toBe("cross_page");
    expect(byUnit[`${ORIGIN}/nocanon`]).toBe("absent");
    for (const f of infos) expect(f.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-CANON-03")).toEqual([]);
  });
});

describe("SEO-CANON-06 · canonical headers on non-HTML files (info)", () => {
  it("reports a Link: rel=canonical header on a PDF", async () => {
    const site = siteWith();
    site.responses[`${ORIGIN}/brochure.pdf`] = {
      status: 200,
      headers: { "content-type": "application/pdf", link: `<${ORIGIN}/brochure>; rel="canonical"` },
      body: "%PDF-1.4\n%%EOF\n",
    };
    linkFromHome(site, "/brochure.pdf", "Brochure (PDF)");
    const { report } = await reportOf(site, START);
    const infos = findingsOf(report, "SEO-CANON-06", "info");
    expect(infos.length).toBe(1);
    expect(infos[0]!.unit).toBe(`${ORIGIN}/brochure.pdf`);
    expect(infos[0]!.condition).toBe("canonical_header");
    expect(infos[0]!.observed.absoluteness).toBe("absolute");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });

  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(findingsOf(report, "SEO-CANON-06")).toEqual([]);
  });
});
