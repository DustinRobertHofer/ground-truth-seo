import { describe, expect, it } from "vitest";
import { EvaluationContext } from "../../src/scanner/evaluate/context.js";
import { meta05a } from "../../src/scanner/evaluate/rules/head.js";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, html, image, page, png, reportOf, snapshotOf, text, type FakeResponse, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const ABOUT = `${ORIGIN}/about`;
const CONTACT = `${ORIGIN}/contact`;
const CONFIG = { start_url: HOME, max_pages: 20 };

const HOME_HEAD = `<link rel="canonical" href="${HOME}"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width">`;
const HOME_BODY = `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a>`;
const ABOUT_HEAD = `<link rel="canonical" href="${ABOUT}"><meta name="description" content="About the example company."><meta name="viewport" content="width=device-width">`;
const CONTACT_HEAD = `<link rel="canonical" href="${CONTACT}"><meta name="description" content="How to contact the example company."><meta name="viewport" content="width=device-width">`;
const ABOUT_BODY = `<h1>About</h1><p>Text.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`;

/** The baseline site with some responses replaced, added or (when `undefined`) removed. */
function siteWith(overrides: Record<string, FakeResponse | string | undefined>): FakeSite {
  const site = baselineSite(ORIGIN);
  const responses = { ...site.responses } as Record<string, FakeResponse | string>;
  for (const [url, response] of Object.entries(overrides)) {
    if (response === undefined) delete responses[url];
    else responses[url] = response;
  }
  return { ...site, responses };
}

/** A raw HTML response for documents that need full control over the markup. */
function rawPage(body: string, contentType = "text/html; charset=utf-8"): FakeResponse {
  return { status: 200, headers: { "content-type": contentType }, body };
}

function expectWellFormedFails(report: Report, ruleId: string, status: "fail" | "opportunity" = "fail"): void {
  const fails = findingsOf(report, ruleId, status);
  expect(fails.length).toBeGreaterThan(0);
  for (const finding of fails) {
    expect(finding.reason, `${ruleId}/${finding.condition} reason`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(finding.citations.length, `${ruleId}/${finding.condition} citations`).toBeGreaterThan(0);
  }
}

async function expectBaselinePass(ruleId: string, units = 3): Promise<void> {
  const { report } = await reportOf(baselineSite(), CONFIG);
  expect(conditionsOf(report, ruleId)).toEqual([]);
  expect(findingsOf(report, ruleId, "pass").length).toBe(units);
}

describe("SEO-HEAD-01 each page has exactly one non-empty title", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-HEAD-01"));

  it("fails missing when the head has no title and names a body title", async () => {
    const site = siteWith({ [ABOUT]: rawPage(html(ABOUT_HEAD, `<title>Late title</title>${ABOUT_BODY}`)) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-01")).toEqual(["missing"]);
    expectWellFormedFails(report, "SEO-HEAD-01");
    const finding = findingsOf(report, "SEO-HEAD-01", "fail")[0]!;
    expect(finding.unit).toBe(ABOUT);
    expect(finding.reason).toContain("a <title> appears in <body> at line");
  });

  it("fails missing without a body clause when there is no title at all", async () => {
    const site = siteWith({ [ABOUT]: rawPage(html(ABOUT_HEAD, ABOUT_BODY)) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-01")).toEqual(["missing"]);
    expect(findingsOf(report, "SEO-HEAD-01", "fail")[0]!.reason).toContain("has no <title> in its <head>. Google");
  });

  it("fails empty for a whitespace-only title", async () => {
    const site = siteWith({ [ABOUT]: page("  ", ABOUT_HEAD, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-01")).toEqual(["empty"]);
    expectWellFormedFails(report, "SEO-HEAD-01");
  });
});

describe("SEO-HEAD-01B no more than one title element", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-HEAD-01B"));

  it("fails multiple for two title elements", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<title>Second title</title>${ABOUT_HEAD}`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-01B")).toEqual(["multiple"]);
    expectWellFormedFails(report, "SEO-HEAD-01B");
    expect(findingsOf(report, "SEO-HEAD-01B", "fail")[0]!.reason).toContain("contains 2 <title> elements");
  });
});

describe("SEO-HEAD-02 one UTF-8 character encoding declaration", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-HEAD-02"));

  it("fails multiple_charset_meta for two meta charset elements", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<meta charset="utf-8">${ABOUT_HEAD}`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-02")).toEqual(["multiple_charset_meta"]);
    expectWellFormedFails(report, "SEO-HEAD-02");
    expect(findingsOf(report, "SEO-HEAD-02", "fail")[0]!.reason).toContain("has 2 <meta charset> elements");
  });

  it("fails not_utf8 for a windows-1252 declaration", async () => {
    const doc = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="iso-8859-1">\n<title>About Example</title>${ABOUT_HEAD}\n</head>\n<body>\n${ABOUT_BODY}\n</body>\n</html>\n`;
    const site = siteWith({ [ABOUT]: rawPage(doc, "text/html") });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-02")).toEqual(["not_utf8"]);
    expectWellFormedFails(report, "SEO-HEAD-02");
    expect(findingsOf(report, "SEO-HEAD-02", "fail")[0]!.reason).toContain("“iso-8859-1”");
  });

  it("fails declaration_too_late when the meta charset ends after byte 1024", async () => {
    const padding = `<!-- ${"x".repeat(1100)} -->`;
    const doc = `<!doctype html>\n<html lang="en">\n<head>\n${padding}\n<meta charset="utf-8">\n<title>About Example</title>${ABOUT_HEAD}\n</head>\n<body>\n${ABOUT_BODY}\n</body>\n</html>\n`;
    const site = siteWith({ [ABOUT]: rawPage(doc) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-02")).toEqual(["declaration_too_late"]);
    expectWellFormedFails(report, "SEO-HEAD-02");
    expect(findingsOf(report, "SEO-HEAD-02", "fail")[0]!.reason).toMatch(/ends at byte 1,?1\d\d\./);
  });
});

describe("SEO-HEAD-04 the html element declares the page language", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-HEAD-04"));

  it("fails missing without a lang attribute", async () => {
    const doc = `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>About Example</title>${ABOUT_HEAD}\n</head>\n<body>\n${ABOUT_BODY}\n</body>\n</html>\n`;
    const site = siteWith({ [ABOUT]: rawPage(doc) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-04")).toEqual(["missing"]);
    expectWellFormedFails(report, "SEO-HEAD-04");
  });

  it("fails malformed for a value that is not a well-formed BCP 47 tag", async () => {
    const doc = `<!doctype html>\n<html lang="en_US!">\n<head>\n<meta charset="utf-8">\n<title>About Example</title>${ABOUT_HEAD}\n</head>\n<body>\n${ABOUT_BODY}\n</body>\n</html>\n`;
    const site = siteWith({ [ABOUT]: rawPage(doc) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-04")).toEqual(["malformed"]);
    expectWellFormedFails(report, "SEO-HEAD-04");
    expect(findingsOf(report, "SEO-HEAD-04", "fail")[0]!.reason).toContain("“en_US!”");
  });
});

describe("SEO-HEAD-05 the head is not closed early", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-HEAD-05"));

  it("fails head_closed_early for an iframe in the head and names the displaced elements", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<iframe src="https://tags.example.net/x"></iframe>\n${ABOUT_HEAD}`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-05")).toEqual(["head_closed_early"]);
    expectWellFormedFails(report, "SEO-HEAD-05");
    const finding = findingsOf(report, "SEO-HEAD-05", "fail")[0]!;
    expect(finding.unit).toBe(ABOUT);
    expect(finding.reason).toContain("<iframe> at line 5");
    expect(finding.reason).toContain("<link>, <meta>, <meta>");
  });
});

describe("SEO-HEAD-06 noscript content that closes the head without scripting (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-HEAD-06", "info")).toEqual([]);
  });

  it("reports noscript_closes_head for an img inside a head noscript", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<noscript><img src="https://px.example.net/x"></noscript>\n${ABOUT_HEAD}`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-HEAD-05")).toEqual([]);
    const infos = findingsOf(report, "SEO-HEAD-06", "info");
    expect(infos.map((f) => f.unit)).toEqual([ABOUT]);
    expect(infos[0]!.condition).toBe("noscript_closes_head");
    expect(infos[0]!.reason).toContain("<noscript> at line 5");
    expect(infos[0]!.reason).toContain("<link>, <meta>, <meta>");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });
});

describe("SEO-META-01 titles are distinct and descriptive", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-META-01"));

  it("fails duplicate on every page sharing a title", async () => {
    const site = siteWith({ [ABOUT]: page("Example Pages", ABOUT_HEAD, ABOUT_BODY), [CONTACT]: page("example pages", CONTACT_HEAD) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-01")).toEqual(["duplicate"]);
    expectWellFormedFails(report, "SEO-META-01");
    const fails = findingsOf(report, "SEO-META-01", "fail");
    expect(fails.map((f) => f.unit).sort()).toEqual([ABOUT, CONTACT]);
    expect(fails[0]!.reason).toContain("shared by 2 intended pages");
  });

  it("fails vague_home for a home page titled Home", async () => {
    const site = siteWith({ [HOME]: page("Home", HOME_HEAD, HOME_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-01")).toEqual(["vague_home"]);
    expectWellFormedFails(report, "SEO-META-01");
    expect(findingsOf(report, "SEO-META-01", "fail")[0]!.unit).toBe(HOME);
  });
});

describe("SEO-META-02A at most one meta description per page", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-META-02A"));

  it("fails multiple for two description elements", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<meta name="Description" content="Another description.">${ABOUT_HEAD}`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-02A")).toEqual(["multiple"]);
    expectWellFormedFails(report, "SEO-META-02A");
    expect(findingsOf(report, "SEO-META-02A", "fail")[0]!.reason).toContain("has 2 meta description elements");
  });
});

describe("SEO-META-02B meta descriptions are page-specific", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-META-02B"));

  it("fails duplicate on every page sharing a description", async () => {
    const shared = `<meta name="description" content="  The Example   company.">`;
    const site = siteWith({
      [ABOUT]: page("About Example", `<link rel="canonical" href="${ABOUT}">${shared}<meta name="viewport" content="width=device-width">`, ABOUT_BODY),
      [CONTACT]: page("Contact Example", `<link rel="canonical" href="${CONTACT}"><meta name="description" content="the example company."><meta name="viewport" content="width=device-width">`),
    });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-02B")).toEqual(["duplicate"]);
    expectWellFormedFails(report, "SEO-META-02B");
    const fails = findingsOf(report, "SEO-META-02B", "fail");
    expect(fails.map((f) => f.unit).sort()).toEqual([ABOUT, CONTACT]);
    expect(fails[0]!.reason).toContain("identical to the one on 1 other intended pages");
  });
});

describe("SEO-META-02C pages carry a meta description (opportunity)", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-META-02C"));

  it("reports absent as an opportunity, never a failure, for a page without a description", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<link rel="canonical" href="${ABOUT}"><meta name="viewport" content="width=device-width">`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-02C")).toEqual(["absent"]);
    expect(findingsOf(report, "SEO-META-02C", "fail")).toEqual([]);
    expectWellFormedFails(report, "SEO-META-02C", "opportunity");
    const found = findingsOf(report, "SEO-META-02C", "opportunity");
    expect(found.map((f) => f.unit)).toEqual([ABOUT]);
    expect(found[0]!.recommendation).toContain("Write a short description");
    // The other two pages still pass, so the rule counts 3 units with 2 met.
    const score = report.categories.find((c) => c.key === "head")!.rules.find((r) => r.rule_id === "SEO-META-02C")!;
    expect(score).toMatchObject({ units: 3, passed: 2, weight: 4 });
    const rec = report.recommendations.find((r) => r.rule_id === "SEO-META-02C")!;
    expect(rec.kind).toBe("add");
    expect(rec.affected_units).toEqual([ABOUT]);
  });
});

describe("SEO-META-05A favicon eligible for Google Search", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-META-05A", 1));

  it("fails home_blocked when the home page is disallowed for Googlebot (evaluator level)", async () => {
    // SEO-ROBOTS-05A is an indexing gate, so a Googlebot-disallowed home page enters B and
    // evaluate() drops the SEO-META-05A finding for it; the condition is checked on the evaluator.
    const site = siteWith({ [`${ORIGIN}/robots.txt`]: text(`User-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap.xml\n\nUser-agent: Googlebot\nDisallow: /$\n`) });
    const { snapshot, config } = await snapshotOf(site, CONFIG);
    const ctx = new EvaluationContext(snapshot, config);
    const results = meta05a(ctx);
    expect(results.map((r) => `${r.status}/${r.condition ?? ""}`)).toEqual(["fail/home_blocked"]);
    expect(results[0]!.observed).toMatchObject({ resource: HOME, crawler: "Googlebot", rule: "Disallow: /$" });
    // The other pages are still allowed, so the gate blocks only the home page.
    const report = (await reportOf(site, CONFIG)).report;
    expect(report.headline.blocked).toBe(1);
    expect(conditionsOf(report, "SEO-ROBOTS-05A")).toEqual(["disallowed_googlebot"]);
    // The favicon rule is host-scoped, so the report carries "home_blocked" too (KNOWLEDGE.md §3.2 excludes B only from page-scoped rules).
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["home_blocked"]);
  });

  it("reports no_icon_link as an opportunity without a favicon link in the home head", async () => {
    const site = siteWith({ [HOME]: page("Example Home", HOME_HEAD.replace(`<link rel="icon" href="/favicon.png">`, ""), HOME_BODY) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["no_icon_link"]);
    expect(findingsOf(report, "SEO-META-05A", "fail")).toEqual([]);
    expectWellFormedFails(report, "SEO-META-05A", "opportunity");
    expect(findingsOf(report, "SEO-META-05A", "opportunity")[0]!.reason).toContain(`The home page of ${ORIGIN} has no favicon link`);
    // The feature is not eligible until a favicon exists, and the recommendation says to add one.
    expect(report.features.find((f) => f.feature === "favicon")!.status).toBe("not_eligible");
    expect(report.recommendations.find((r) => r.rule_id === "SEO-META-05A")!.kind).toBe("add");
  });

  it("fails icon_not_ok when the favicon returns 404", async () => {
    const site = siteWith({ [`${ORIGIN}/favicon.png`]: undefined });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["icon_not_ok"]);
    expectWellFormedFails(report, "SEO-META-05A");
    expect(findingsOf(report, "SEO-META-05A", "fail")[0]!.reason).toBe(`The favicon ${ORIGIN}/favicon.png returned HTTP 404.`);
  });

  it("fails icon_blocked when Googlebot-Image may not crawl the favicon", async () => {
    const site = siteWith({ [`${ORIGIN}/robots.txt`]: text(`User-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap.xml\n\nUser-agent: Googlebot-Image\nDisallow: /favicon.png\n`) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["icon_blocked"]);
    expectWellFormedFails(report, "SEO-META-05A");
    const finding = findingsOf(report, "SEO-META-05A", "fail")[0]!;
    expect(finding.reason).toContain(`${ORIGIN}/favicon.png is disallowed for Googlebot-Image by Disallow: /favicon.png`);
  });

  it("fails unsupported_format for an SVG favicon", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>`;
    const site = siteWith({ [`${ORIGIN}/favicon.png`]: text(svg, "image/svg+xml") });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["unsupported_format"]);
    expectWellFormedFails(report, "SEO-META-05A");
    expect(findingsOf(report, "SEO-META-05A", "fail")[0]!.reason).toContain("is SVG.");
  });

  it("fails not_square for a 32×16 favicon", async () => {
    const site = siteWith({ [`${ORIGIN}/favicon.png`]: image(png(32, 16)) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["not_square"]);
    expectWellFormedFails(report, "SEO-META-05A");
    expect(findingsOf(report, "SEO-META-05A", "fail")[0]!.reason).toContain("is 32×16.");
  });

  it("fails too_small for a 4×4 favicon", async () => {
    const site = siteWith({ [`${ORIGIN}/favicon.png`]: image(png(4, 4)) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual(["too_small"]);
    expectWellFormedFails(report, "SEO-META-05A");
    expect(findingsOf(report, "SEO-META-05A", "fail")[0]!.reason).toContain("is 4×4.");
  });

  it("is not applicable for SEO-META-05B when SEO-META-05A fails", async () => {
    const site = siteWith({ [`${ORIGIN}/favicon.png`]: image(png(4, 4)) });
    const { report } = await reportOf(site, CONFIG);
    expect(findingsOf(report, "SEO-META-05B").map((f) => f.status)).toEqual(["not_applicable"]);
  });
});

describe("SEO-META-05B favicon larger than 48×48", () => {
  it("passes on the baseline (96×96)", () => expectBaselinePass("SEO-META-05B", 1));

  it("fails not_larger_than_48 for a 32×32 favicon", async () => {
    const site = siteWith({ [`${ORIGIN}/favicon.png`]: image(png(32, 32)) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-05A")).toEqual([]);
    expect(conditionsOf(report, "SEO-META-05B")).toEqual(["not_larger_than_48"]);
    expectWellFormedFails(report, "SEO-META-05B");
    expect(findingsOf(report, "SEO-META-05B", "fail")[0]!.reason).toContain("is 32×32.");
  });
});

describe("SEO-META-06 no meta refresh redirects", () => {
  it("passes on the baseline", () => expectBaselinePass("SEO-META-06"));

  it("fails meta_refresh_redirect for a refresh with a URL", async () => {
    const site = siteWith({ [CONTACT]: page("Contact Example", `<meta http-equiv="refresh" content="0; url=${ABOUT}">${CONTACT_HEAD}`) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-06")).toEqual(["meta_refresh_redirect"]);
    expectWellFormedFails(report, "SEO-META-06");
    const finding = findingsOf(report, "SEO-META-06", "fail")[0]!;
    expect(finding.unit).toBe(CONTACT);
    expect(finding.reason).toContain(`content="0; url=${ABOUT}"`);
  });

  it("treats a timed reload without a URL as a pass", async () => {
    const site = siteWith({ [CONTACT]: page("Contact Example", `<meta http-equiv="refresh" content="30">${CONTACT_HEAD}`) });
    const { report } = await reportOf(site, CONFIG);
    expect(conditionsOf(report, "SEO-META-06")).toEqual([]);
    expect(findingsOf(report, "SEO-META-06", "pass").find((f) => f.unit === CONTACT)?.observed).toMatchObject({ timed_reloads: 1 });
  });
});

describe("SEO-HEAD-03 viewport meta tag (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-HEAD-03", "info")).toEqual([]);
  });

  it("reports absent for a page without a viewport meta", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<link rel="canonical" href="${ABOUT}"><meta name="description" content="About the example company.">`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    const infos = findingsOf(report, "SEO-HEAD-03", "info");
    expect(infos.map((f) => f.unit)).toEqual([ABOUT]);
    expect(infos[0]!.condition).toBe("absent");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });
});

describe("SEO-META-03 keywords meta tag present (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-META-03", "info")).toEqual([]);
  });

  it("reports present for a keywords meta tag", async () => {
    const site = siteWith({ [ABOUT]: page("About Example", `<meta name="keywords" content="example, company">${ABOUT_HEAD}`, ABOUT_BODY) });
    const { report } = await reportOf(site, CONFIG);
    const infos = findingsOf(report, "SEO-META-03", "info");
    expect(infos.map((f) => f.unit)).toEqual([ABOUT]);
    expect(infos[0]!.condition).toBe("present");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });
});

describe("SEO-META-04 snippet controls in use (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), CONFIG);
    expect(findingsOf(report, "SEO-META-04", "info")).toEqual([]);
  });

  it("reports snippet_controls for max-snippet and data-nosnippet", async () => {
    const site = siteWith({
      [ABOUT]: page("About Example", `<meta name="robots" content="max-snippet:50, max-image-preview:large">${ABOUT_HEAD}`, `<h1>About</h1><p data-nosnippet>Secret.</p><div data-nosnippet>Text.</div><a href="/">Home page</a>`),
    });
    const { report } = await reportOf(site, CONFIG);
    const infos = findingsOf(report, "SEO-META-04", "info");
    expect(infos.map((f) => f.condition).sort()).toEqual(["data_nosnippet_unsupported_element", "snippet_controls"]);
    const controls = infos.find((f) => f.condition === "snippet_controls")!;
    expect(controls.unit).toBe(ABOUT);
    expect(controls.reason).toContain("max-snippet:50, max-image-preview:large, data-nosnippet on 1 elements");
    const unsupported = infos.find((f) => f.condition === "data_nosnippet_unsupported_element")!;
    expect(unsupported.reason).toContain("data-nosnippet on <p>");
    for (const info of infos) expect(info.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  });
});
