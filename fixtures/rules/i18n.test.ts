import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, reportOf, xml, type FakeResponse, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const EN = `${ORIGIN}/en`;
const FR = `${ORIGIN}/fr`;
const START = { start_url: HOME };

interface Loc {
  path: string;
  alternates?: { hreflang: string; href: string }[];
}

function sitemap(locs: (string | Loc)[]): FakeResponse {
  const urls = locs
    .map((l) => (typeof l === "string" ? { path: l } : l))
    .map((l) => {
      const alts = (l.alternates ?? []).map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`).join("");
      return `<url><loc>${ORIGIN}${l.path}</loc>${alts}</url>`;
    })
    .join("\n");
  return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
}

function alt(hreflang: string, href: string, extraAttrs = ""): string {
  return `<link rel="alternate" hreflang="${hreflang}" href="${href}"${extraAttrs}>`;
}

/** A localized page: canonical, description, viewport and the given hreflang links in the head. */
function localized(path: string, title: string, headLinks: string, canonical = `${ORIGIN}${path}`, body?: string): FakeResponse {
  return page(
    title,
    `<link rel="canonical" href="${canonical}"><meta name="description" content="${title}."><meta name="viewport" content="width=device-width">${headLinks}`,
    body ?? `<h1>${title}</h1><p>Text.</p><a href="/">Home page</a>`,
  );
}

const HOME_HEAD = `<link rel="canonical" href="${HOME}"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"${HOME}"}</script>`;
const HOME_BODY = `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <a href="/en">English edition</a> <a href="/fr">French edition</a> <img src="/photo.png" alt="Office" width="100" height="100">`;

/**
 * The baseline plus two localized pages, /en and /fr, both in the sitemap and
 * linked from the home page. `en` and `fr` are the head markup of each page's
 * hreflang links.
 */
function i18nSite(en: string, fr: string, overrides: FakeSite["responses"] = {}, sitemapLocs: (string | Loc)[] = ["/", "/about", "/contact", "/en", "/fr"]): FakeSite {
  const base = baselineSite(ORIGIN);
  return {
    ...base,
    responses: {
      ...base.responses,
      [`${ORIGIN}/sitemap.xml`]: sitemap(sitemapLocs),
      [HOME]: page("Example Home", HOME_HEAD, HOME_BODY),
      [EN]: localized("/en", "English edition", en),
      [FR]: localized("/fr", "French edition", fr),
      ...overrides,
    },
  };
}

const FULL_EN = alt("en", EN) + alt("fr", FR);
const FULL_FR = alt("en", EN) + alt("fr", FR);

function expectWellFormedFails(findings: Finding[]) {
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    expect(f.reason, `${f.rule_id}/${f.condition}`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(f.citations.length, `${f.rule_id}/${f.condition}`).toBeGreaterThan(0);
  }
}

describe("a complete, reciprocal hreflang pair", () => {
  it("passes every hreflang rule and scores 100", async () => {
    const { report } = await reportOf(i18nSite(FULL_EN, FULL_FR), START);
    const fails = report.findings.filter((f) => f.status === "fail").map((f) => `${f.rule_id}/${f.condition}@${f.unit}: ${f.reason}`);
    expect(fails).toEqual([]);
    for (const rule of ["SEO-I18N-07", "SEO-I18N-02", "SEO-I18N-03", "SEO-I18N-04", "SEO-I18N-06", "SEO-I18N-08"]) {
      expect(findingsOf(report, rule, "pass").map((f) => f.unit).sort(), rule).toEqual([EN, FR]);
    }
    expect(report.headline.intended).toBe(5);
    expect(report.headline.overall).toBe(100);
  });

  it("produces no hreflang findings on the baseline, which has no annotations", async () => {
    const { report } = await reportOf(baselineSite(), START);
    for (const rule of ["SEO-I18N-07", "SEO-I18N-02", "SEO-I18N-03", "SEO-I18N-04", "SEO-I18N-06", "SEO-I18N-08", "SEO-I18N-09", "SEO-I18N-05"]) {
      expect(findingsOf(report, rule), rule).toEqual([]);
    }
  });
});

describe("SEO-I18N-07 hreflang links are inside the head", () => {
  it("fails outside_head for an hreflang link in the body", async () => {
    const s = i18nSite("", FULL_FR, {
      [EN]: localized("/en", "English edition", "", EN, `<h1>English edition</h1>${FULL_EN}<p>Text.</p><a href="/">Home page</a>`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-07")).toEqual(["outside_head"]);
    const fails = findingsOf(report, "SEO-I18N-07", "fail");
    expect(fails.map((f) => f.unit)).toEqual([EN]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.n).toBe(2);
    expect(fails[0]!.related).toContain("SEO-HEAD-05");
    // The French page is still fine.
    expect(findingsOf(report, "SEO-I18N-07", "pass").map((f) => f.unit)).toEqual([FR]);
  });
});

describe("SEO-I18N-02 hreflang includes the page itself and is reciprocated", () => {
  it("fails missing_self when a page omits its own URL", async () => {
    const s = i18nSite(alt("fr", FR), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-02")).toEqual(["missing_self"]);
    const fails = findingsOf(report, "SEO-I18N-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([EN]);
    expectWellFormedFails(fails);
  });

  it("fails not_reciprocated when the target does not point back", async () => {
    const s = i18nSite(FULL_EN, alt("fr", FR));
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-02")).toEqual(["not_reciprocated"]);
    const fails = findingsOf(report, "SEO-I18N-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([EN]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.target).toBe(FR);
    expect(fails[0]!.observed.code).toBe("fr");
    // /fr lists itself and nothing else, so it passes.
    expect(findingsOf(report, "SEO-I18N-02", "pass").map((f) => f.unit)).toEqual([FR]);
  });

  it("does not report not_reciprocated for a target that is not 200 (SEO-I18N-09 does)", async () => {
    const DE = `${ORIGIN}/de`;
    const s = i18nSite(FULL_EN + alt("de", DE), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-02")).toEqual([]);
  });
});

describe("SEO-I18N-03 hreflang URLs are fully qualified", () => {
  it("fails not_fully_qualified for a relative and a protocol-relative href", async () => {
    const s = i18nSite(alt("en", "/en") + alt("fr", "//www.example.com/fr"), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-03")).toEqual(["not_fully_qualified"]);
    const fails = findingsOf(report, "SEO-I18N-03", "fail");
    expect(fails.map((f) => f.unit)).toEqual([EN, EN]);
    expectWellFormedFails(fails);
    expect(fails.map((f) => f.observed.href).sort()).toEqual(["//www.example.com/fr", "/en"]);
    expect(findingsOf(report, "SEO-I18N-03", "pass").map((f) => f.unit)).toEqual([FR]);
  });
});

describe("SEO-I18N-04 hreflang values are supported codes", () => {
  it("accepts x-default, script and region subtags", async () => {
    const s = i18nSite(FULL_EN + alt("x-default", EN) + alt("en-GB", EN) + alt("zh-Hant-TW", FR) + alt("be", FR), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-04")).toEqual([]);
    expect(findingsOf(report, "SEO-I18N-04", "pass").find((f) => f.unit === EN)!.observed.codes).toBe(6);
  });

  it("fails malformed for a value that does not fit the pattern", async () => {
    const s = i18nSite(FULL_EN + alt("english", EN), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-04")).toEqual(["malformed"]);
    const fails = findingsOf(report, "SEO-I18N-04", "fail");
    expect(fails.map((f) => f.unit)).toEqual([EN]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain('hreflang="english"');
    expect(fails[0]!.reason).toContain("not a valid code format");
  });

  it("fails region_only for a bare country code", async () => {
    const s = i18nSite(FULL_EN + alt("US", EN), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-04")).toEqual(["region_only"]);
    const fails = findingsOf(report, "SEO-I18N-04", "fail");
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("a region code without a language");
  });

  it("fails unsupported_code for es-419, en-UK and a three-letter language", async () => {
    const s = i18nSite(FULL_EN + alt("es-419", EN) + alt("en-UK", EN) + alt("eng", EN), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-04")).toEqual(["unsupported_code"]);
    const fails = findingsOf(report, "SEO-I18N-04", "fail");
    expect(fails.map((f) => f.observed.code).sort()).toEqual(["en-UK", "eng", "es-419"]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("a code outside ISO 639-1, ISO 15924 or ISO 3166-1 Alpha 2");
  });
});

describe("SEO-I18N-06 localized pages canonicalize within their language", () => {
  it("fails cross_language_canonical when /fr declares /en as canonical", async () => {
    const s = i18nSite(FULL_EN, FULL_FR, { [FR]: localized("/fr", "French edition", FULL_FR, EN) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-06")).toEqual(["cross_language_canonical"]);
    const fails = findingsOf(report, "SEO-I18N-06", "fail");
    expect(fails.map((f) => f.unit)).toEqual([FR]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.lang).toBe("fr");
    expect(fails[0]!.observed.other_lang).toBe("en");
    expect(fails[0]!.observed.canonical).toBe(EN);
    expect(findingsOf(report, "SEO-I18N-06", "pass").map((f) => f.unit)).toEqual([EN]);
  });
});

describe("SEO-I18N-08 hreflang is not combined with media", () => {
  it("fails combined_attributes for a link carrying hreflang and media", async () => {
    const s = i18nSite(alt("en", EN, ' media="only screen and (max-width: 640px)"') + alt("fr", FR), FULL_FR);
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-I18N-08")).toEqual(["combined_attributes"]);
    const fails = findingsOf(report, "SEO-I18N-08", "fail");
    expect(fails.map((f) => f.unit)).toEqual([EN]);
    expectWellFormedFails(fails);
    expect(findingsOf(report, "SEO-I18N-08", "pass").map((f) => f.unit)).toEqual([FR]);
  });
});

describe("informational hreflang rules", () => {
  it("SEO-I18N-09 reports target_not_200 for an alternate that returns 404", async () => {
    const DE = `${ORIGIN}/de`;
    const s = i18nSite(FULL_EN + alt("de", DE), FULL_FR);
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-I18N-09", "info");
    expect(infos.map((f) => f.unit)).toEqual([EN]);
    expect(infos[0]!.condition).toBe("target_not_200");
    expect(infos[0]!.observed.target).toBe(DE);
    expect(infos[0]!.observed.code).toBe("de");
    expect(infos[0]!.reason).toContain("404");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-I18N-09")).toEqual([]);
  });

  it("SEO-I18N-05 reports multiple_methods when HTML links and sitemap xhtml:link are both used", async () => {
    const alternates = [{ hreflang: "en", href: EN }, { hreflang: "fr", href: FR }];
    const s = i18nSite(FULL_EN, FULL_FR, {}, ["/", "/about", "/contact", { path: "/en", alternates }, "/fr"]);
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-I18N-05", "info");
    expect(infos.map((f) => f.unit)).toEqual([EN]);
    expect(infos[0]!.condition).toBe("multiple_methods");
    expect(infos[0]!.observed.methods).toBe("HTML link elements and sitemap xhtml:link entries");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(infos[0]!.citations.length).toBeGreaterThan(0);
    expect(conditionsOf(report, "SEO-I18N-05")).toEqual([]);
    // Sitemap-only annotations still count as the page's set: /fr reciprocates /en's sitemap entry.
    expect(conditionsOf(report, "SEO-I18N-02")).toEqual([]);
  });
});
