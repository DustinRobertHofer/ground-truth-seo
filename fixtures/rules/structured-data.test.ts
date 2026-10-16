import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, image, page, png, reportOf, text, type FakeResponse, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const START = { start_url: HOME };

function site(extra: FakeSite["responses"]): FakeSite {
  const base = baselineSite(ORIGIN);
  return { ...base, responses: { ...base.responses, ...extra } };
}

function ld(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

const WEBSITE = { "@context": "https://schema.org", "@type": "WebSite", name: "Example", url: HOME };
const HOME_HEAD_BASE = `<link rel="canonical" href="${HOME}"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width">`;
const HOME_BODY = `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <img src="/photo.png" alt="Office" width="100" height="100">`;

/** The home page with the given JSON-LD blocks (raw script markup) in place of the baseline WebSite block. */
function homeWith(blocks: string, body = HOME_BODY): FakeResponse {
  return page("Example Home", `${HOME_HEAD_BASE}${blocks}`, body);
}

const ABOUT_HEAD = `<link rel="canonical" href="${ORIGIN}/about"><meta name="description" content="About the example company."><meta name="viewport" content="width=device-width">`;
const ABOUT_BODY = `<h1>About</h1><p>Text.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`;

function aboutWith(blocks: string, body = ABOUT_BODY): FakeResponse {
  return page("About Example", `${ABOUT_HEAD}${blocks}`, body);
}

function expectWellFormedFails(findings: Finding[]) {
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    expect(f.reason, `${f.rule_id}/${f.condition}`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(f.citations.length, `${f.rule_id}/${f.condition}`).toBeGreaterThan(0);
  }
}

describe("SEO-SD-01 JSON-LD blocks are valid JSON", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-SD-01")).toEqual([]);
    expect(findingsOf(report, "SEO-SD-01", "pass").map((f) => f.unit)).toEqual([HOME]);
  });

  it("fails invalid_json for a block with a trailing comma", async () => {
    const s = site({
      [`${ORIGIN}/about`]: aboutWith(`<script type="application/ld+json">{"@context":"https://schema.org","@type":"Thing","name":"About",}</script>`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-01")).toEqual(["invalid_json"]);
    const fails = findingsOf(report, "SEO-SD-01", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/about`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.excerpt).toBe('{"@context":"https://schema.org","@type":"Thing","name":"About",}');
  });
});

describe("SEO-SD-02 items include the properties Google requires", () => {
  const breadcrumb = (items: object[]) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items });
  const rental = (images: string[]) => ({
    "@context": "https://schema.org",
    "@type": "VacationRental",
    name: "Seaside cottage",
    identifier: "cottage-17",
    latitude: 43.1,
    longitude: -70.2,
    image: images,
    containsPlace: { "@type": "Accommodation", occupancy: { "@type": "QuantitativeValue", value: 4 } },
  });
  const eightImages = Array.from({ length: 8 }, (_, i) => `${ORIGIN}/photos/${i + 1}.jpg`);

  it("passes for a complete breadcrumb, a complete vacation rental and the baseline site name", async () => {
    const s = site({
      [`${ORIGIN}/about`]: aboutWith(
        ld(breadcrumb([
          { "@type": "ListItem", position: 1, name: "Home", item: HOME },
          { "@type": "ListItem", position: 2, name: "About" },
        ])) + ld(rental(eightImages)),
        `<h1>About</h1><p>Seaside cottage. Home. About.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`,
      ),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-02")).toEqual([]);
    const passes = findingsOf(report, "SEO-SD-02", "pass");
    expect(passes.map((f) => f.unit).sort()).toEqual([`${HOME} [site_name]`, `${ORIGIN}/about [breadcrumb]`, `${ORIGIN}/about [vacation_rental]`]);
    expect(passes.map((f) => f.gate).sort()).toEqual(["feature:breadcrumb", "feature:site_name", "feature:vacation_rental"]);
  });

  it("fails missing_required for a BreadcrumbList whose ListItem lacks name", async () => {
    const s = site({
      [`${ORIGIN}/about`]: aboutWith(ld(breadcrumb([
        { "@type": "ListItem", position: 1, item: HOME },
        { "@type": "ListItem", position: 2, name: "About" },
      ]))),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-02")).toEqual(["missing_required"]);
    const fails = findingsOf(report, "SEO-SD-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/about [breadcrumb]`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.missing).toBe("itemListElement[0].name");
    expect(fails[0]!.gate).toBe("feature:breadcrumb");
    // The registry quote is appended as a citation.
    expect(fails[0]!.citations.some((c) => c.source_id === "G-BREADCRUMB")).toBe(true);
  });

  it("fails missing_required_site_name for a WebSite on the home page without url", async () => {
    const s = site({ [HOME]: homeWith(ld({ "@context": "https://schema.org", "@type": "WebSite", name: "Example" })) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-02")).toEqual(["missing_required_site_name"]);
    const fails = findingsOf(report, "SEO-SD-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${HOME} [site_name]`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.missing).toBe("url");
    expect(fails[0]!.reason).toContain(ORIGIN);
  });

  it("does not evaluate a WebSite item for site name outside the home page", async () => {
    const s = site({ [`${ORIGIN}/about`]: aboutWith(ld({ "@context": "https://schema.org", "@type": "WebSite", name: "Example" })) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-02")).toEqual([]);
  });

  it("fails too_few_images for a VacationRental with three images", async () => {
    const s = site({ [`${ORIGIN}/about`]: aboutWith(ld(rental(eightImages.slice(0, 3)))) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-02")).toEqual(["too_few_images"]);
    const fails = findingsOf(report, "SEO-SD-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/about [vacation_rental]`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.n).toBe(3);
    expect(fails[0]!.reason).toContain("lists 3 images");
  });
});

describe("SEO-SD-04 the home page states a site name preference", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-SD-04")).toEqual([]);
    expect(findingsOf(report, "SEO-SD-04", "pass").map((f) => f.unit)).toEqual([ORIGIN]);
  });

  it("reports missing as an opportunity when the home page has no WebSite item", async () => {
    const s = site({ [HOME]: homeWith("") });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-04")).toEqual(["missing"]);
    expect(findingsOf(report, "SEO-SD-04", "fail")).toEqual([]);
    const found = findingsOf(report, "SEO-SD-04", "opportunity");
    expect(found.map((f) => f.unit)).toEqual([ORIGIN]);
    expectWellFormedFails(found);
    expect(report.recommendations.find((r) => r.rule_id === "SEO-SD-04")!.kind).toBe("add");
  });

  it("fails url_not_canonical_home when the WebSite url is another page", async () => {
    const s = site({ [HOME]: homeWith(ld({ ...WEBSITE, url: `${ORIGIN}/about` })) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-04")).toEqual(["url_not_canonical_home"]);
    const fails = findingsOf(report, "SEO-SD-04", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.value).toBe(`${ORIGIN}/about`);
    expect(fails[0]!.observed.expected).toBe(HOME);
  });

  it("fails multiple_blocks for two WebSite items", async () => {
    const s = site({ [HOME]: homeWith(ld(WEBSITE) + ld({ ...WEBSITE, alternateName: "Ex" })) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-04")).toEqual(["multiple_blocks"]);
    const fails = findingsOf(report, "SEO-SD-04", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.n).toBe(2);
  });
});

describe("SEO-SD-05 the Organization logo meets Google's requirements", () => {
  const org = (logo: unknown) => ({ "@context": "https://schema.org", "@type": "Organization", name: "Example", url: HOME, logo });
  const LOGO = `${ORIGIN}/logo.png`;
  const UNIT = `${HOME} logo ${LOGO}`;
  const homeWithLogo = (logo: unknown = LOGO) => homeWith(ld(WEBSITE) + ld(org(logo)));

  it("passes for a crawlable 200×200 PNG logo (URL string or ImageObject)", async () => {
    const s = site({ [HOME]: homeWithLogo(), [LOGO]: image(png(200, 200)) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual([]);
    expect(findingsOf(report, "SEO-SD-05", "pass").map((f) => f.unit)).toEqual([UNIT]);
    const obj = site({ [HOME]: homeWithLogo({ "@type": "ImageObject", url: LOGO }), [LOGO]: image(png(200, 200)) });
    const second = await reportOf(obj, START);
    expect(conditionsOf(second.report, "SEO-SD-05")).toEqual([]);
    expect(findingsOf(second.report, "SEO-SD-05", "pass").map((f) => f.unit)).toEqual([UNIT]);
  });

  it("fails logo_not_ok when the logo returns 404", async () => {
    const s = site({ [HOME]: homeWithLogo() });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_not_ok"]);
    const fails = findingsOf(report, "SEO-SD-05", "fail");
    expect(fails.map((f) => f.unit)).toEqual([UNIT]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("404");
  });

  it("fails logo_blocked when robots.txt disallows the logo for Googlebot-Image", async () => {
    const s = site({
      [HOME]: homeWithLogo(),
      [LOGO]: image(png(200, 200)),
      [`${ORIGIN}/robots.txt`]: text(`User-agent: *\nDisallow: /private/\n\nUser-agent: Googlebot-Image\nDisallow: /logo.png\n\nSitemap: ${ORIGIN}/sitemap.xml\n`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_blocked"]);
    const fails = findingsOf(report, "SEO-SD-05", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.rule).toBe("Disallow: /logo.png");
  });

  it("fails logo_noindex when the image response carries X-Robots-Tag: noindex", async () => {
    const s = site({
      [HOME]: homeWithLogo(),
      [LOGO]: { status: 200, headers: { "content-type": "image/png", "x-robots-tag": "noindex" }, body: png(200, 200) },
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_noindex"]);
    expectWellFormedFails(findingsOf(report, "SEO-SD-05", "fail"));
  });

  it("fails logo_unsupported_format for an ICO body", async () => {
    const s = site({ [HOME]: homeWithLogo(), [LOGO]: image(new Uint8Array([0x00, 0x00, 0x01, 0x00]), "image/png") });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_unsupported_format"]);
    const fails = findingsOf(report, "SEO-SD-05", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.format).toBe("ICO");
    // The format-specific citations are included.
    expect(fails[0]!.citations.some((c) => c.source_id === "G-IMAGES")).toBe(true);
  });

  it("fails logo_unsupported_format for a TIFF body", async () => {
    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const s = site({ [HOME]: homeWithLogo(), [LOGO]: image(tiff, "image/tiff") });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_unsupported_format"]);
    expect(findingsOf(report, "SEO-SD-05", "fail")[0]!.observed.format).toBe("TIFF");
  });

  it("fails logo_too_small for a 64×64 PNG", async () => {
    const s = site({ [HOME]: homeWithLogo(), [LOGO]: image(png(64, 64)) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_too_small"]);
    const fails = findingsOf(report, "SEO-SD-05", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("64×64");
  });

  it("fails logo_unreadable when the body is not an image", async () => {
    const s = site({ [HOME]: homeWithLogo(), [LOGO]: text("not an image", "image/png") });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-SD-05")).toEqual(["logo_unreadable"]);
    expectWellFormedFails(findingsOf(report, "SEO-SD-05", "fail"));
  });
});

describe("informational structured-data rules", () => {
  it("SEO-SD-03 reports not_visible when a registered item's name is not in the page text", async () => {
    const s = site({
      [`${ORIGIN}/about`]: aboutWith(ld({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        name: "Hidden trail name",
        itemListElement: [{ "@type": "ListItem", position: 1, name: "About" }],
      })),
    });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-SD-03", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/about`]);
    expect(infos[0]!.condition).toBe("not_visible");
    expect(infos[0]!.observed.property).toBe("name");
    expect(infos[0]!.observed.value).toBe("Hidden trail name");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-SD-03")).toEqual([]);
    // The baseline WebSite name "Example" is visible in its h1.
    const clean = await reportOf(baselineSite(), START);
    expect(findingsOf(clean.report, "SEO-SD-03")).toEqual([]);
  });

  it("SEO-SD-07 reports retired_feature for FAQPage markup and never fails", async () => {
    const s = site({
      [`${ORIGIN}/about`]: aboutWith(ld({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [{ "@type": "Question", name: "What?", acceptedAnswer: { "@type": "Answer", text: "This." } }],
      })),
    });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-SD-07", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/about`]);
    expect(infos[0]!.condition).toBe("retired_feature");
    expect(infos[0]!.observed.type).toBe("FAQPage");
    expect(infos[0]!.reason).toContain("FAQ rich result");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-SD-07")).toEqual([]);
  });
});
