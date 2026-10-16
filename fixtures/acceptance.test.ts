/**
 * PRODUCT.md §15 acceptance criteria and §6 determinism tests.
 */

import { describe, expect, it } from "vitest";
import { evaluate } from "../src/scanner/evaluate/index.js";
import { MYTHS } from "../src/scanner/rules/myths.js";
import { RULES } from "../src/scanner/rules/index.js";
import { achieved, eligibility, overall } from "../src/scanner/report/score.js";
import { canonicalize } from "../src/scanner/snapshot/canonical-json.js";
import { baselineSite, conditionsOf, findingsOf, page, png, image, reportOf, snapshotOf, text, xml } from "../src/testing/index.js";

describe("§7.6 worked example (scoring-layer fixture)", () => {
  it("yields exactly 85 with the printed arithmetic string", () => {
    // SEO-META-02C: 8 of 38 pages have no description. Those are opportunities, and they
    // count as unmet units exactly as failures would.
    const A = achieved([
      { rule_id: "SEO-CANON-01", weight: 8, units: 38, passed: 38 },
      { rule_id: "SEO-META-02C", weight: 4, units: 38, passed: 30 },
      { rule_id: "SEO-HTTP-07", weight: 4, units: 1, passed: 1 },
      { rule_id: "SEO-HDG-02", weight: 2, units: 38, passed: 19 },
    ]);
    expect(A.totalWeight).toBe(18n);
    expect(`${A.contribution.num}/${A.contribution.den}`).toBe("307/19");
    expect(`${A.achieved!.num}/${A.achieved!.den}`).toBe("307/342");
    const E = eligibility(40, 2)!;
    expect(`${E.num}/${E.den}`).toBe("19/20");
    const result = overall(E, A.achieved);
    expect(result.score).toBe(85);
    expect(result.arithmetic).toBe("Overall 85 = 100 × eligibility 19/20 × achieved 307/342");
  });

  it("handles the edge cases of §7.5", () => {
    expect(overall(null, null).score).toBeNull();
    expect(overall(eligibility(4, 4), achieved([{ rule_id: "x", weight: 8, units: 1, passed: 1 }]).achieved).score).toBe(0);
    const notMeasurable = overall(eligibility(4, 0), null);
    expect(notMeasurable.score).toBeNull();
    expect(notMeasurable.arithmetic).toContain("not measurable");
  });
});

describe("§15.6 robots.txt disallows / for all user agents", () => {
  it("blocks every intended page by SEO-ROBOTS-05A with eligibility 0 and overall 0", async () => {
    const site = baselineSite();
    site.responses["https://www.example.com/robots.txt"] = text("User-agent: *\nDisallow: /\n");
    const { report } = await reportOf(site, { start_url: "https://www.example.com/", robots_mode: "respect" });
    // In respect mode the scanner itself cannot fetch pages; the home page is still in I and blocked.
    expect(report.headline.intended).toBeGreaterThan(0);
    expect(report.headline.blocked).toBe(report.headline.intended);
    expect(report.headline.eligibility).toBe("0");
    expect(report.headline.overall).toBe(0);
    const blocked = findingsOf(report, "SEO-ROBOTS-05A", "fail");
    expect(new Set(blocked.map((f) => f.unit)).size).toBe(report.headline.intended);
    expect(blocked.every((f) => f.condition === "disallowed_googlebot" || f.condition === "disallowed_bingbot")).toBe(true);
    expect(report.headline.arithmetic.startsWith("Overall 0 = 100 × eligibility 0 ×")).toBe(true);
  });
});

describe("§15.7 tag-manager iframe inside <head> before the canonical", () => {
  it("fails SEO-CANON-01 with the culprit and line, and SEO-HEAD-05 names the same element", async () => {
    const site = baselineSite();
    site.responses["https://www.example.com/about"] = {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>About Example</title>\n<iframe src="https://tagmanager.example/ns.html" height="0" width="0"></iframe>\n<link rel="canonical" href="https://www.example.com/about">\n<meta name="description" content="About the example company.">\n</head>\n<body><h1>About</h1><a href="/">Home page</a></body></html>`,
    };
    const { report } = await reportOf(site, { start_url: "https://www.example.com/" });
    const canon = findingsOf(report, "SEO-CANON-01", "fail");
    expect(canon).toHaveLength(1);
    expect(canon[0]!.condition).toBe("outside_head");
    expect(canon[0]!.observed.culprit).toBe("<iframe>");
    expect(canon[0]!.observed.head_closed_line).toBe(9);
    expect(canon[0]!.observed.line).toBe(7);
    expect(canon[0]!.reason).toContain("because the parser closed <head> at line 9, where it met <iframe>");
    expect(canon[0]!.related).toContain("SEO-HEAD-05");
    const head = findingsOf(report, "SEO-HEAD-05", "fail");
    expect(head).toHaveLength(1);
    expect(head[0]!.observed.culprit).toBe("<iframe>");
    expect(head[0]!.observed.line).toBe(6);
    expect(head[0]!.observed.displaced).toBe("<link>, <meta>");
  });
});

describe("§15.8 optional inputs", () => {
  it("turning render, crux and parity off moves only their rules to not_evaluated", async () => {
    const { snapshot, config } = await snapshotOf(baselineSite(), { start_url: "https://www.example.com/" });
    const off = evaluate(snapshot, config);
    const requiring = RULES.filter((r) => (r.requires ?? []).some((q) => q === "rendered" || q === "crux" || q === "parity")).map((r) => r.id);
    expect(requiring.sort()).toEqual(["SEO-IDX-04", "SEO-IDX-07", "SEO-JS-01", "SEO-JS-04", "SEO-PERF-01", "SEO-PERF-03"].sort());
    for (const id of requiring) {
      const statuses = new Set(findingsOf(off, id).map((f) => f.status));
      expect([...statuses], id).toEqual(["not_evaluated"]);
    }
    // With the inputs enabled but no data stored, the same rules stay not_evaluated and nothing else changes.
    const on = evaluate(snapshot, { ...config, render: true, crux: true, parity_check: true });
    const strip = (r: typeof on) => canonicalize({ ...r, meta: { ...r.meta, config: null, config_hash: null }, findings: r.findings.filter((f) => !requiring.includes(f.rule_id)), methodology: null });
    expect(strip(on)).toBe(strip(off));
    expect(on.headline.overall).toBe(off.headline.overall);
  });
});

describe("§15.4 myth guard", () => {
  it("never fails on long titles, missing descriptions, several h1s, keywords, llms.txt, priority or changefreq", async () => {
    const site = baselineSite();
    const longTitle = "A".repeat(300);
    site.responses["https://www.example.com/about"] = page(longTitle, `<link rel="canonical" href="https://www.example.com/about"><meta name="keywords" content="a,b,c"><meta name="viewport" content="width=device-width">`, `<h1>One</h1><h1>Two</h1><h1>Three</h1><p>${"word ".repeat(10)}</p><a href="/">Home page</a>`);
    site.responses["https://www.example.com/llms.txt"] = text("# Example\n");
    site.responses["https://www.example.com/sitemap.xml"] = xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.com/</loc><priority>0.9</priority><changefreq>daily</changefreq></url><url><loc>https://www.example.com/about</loc><priority>0.5</priority></url></urlset>`);
    const { report } = await reportOf(site, { start_url: "https://www.example.com/", house_conventions: true });
    const fails = report.findings.filter((f) => f.status === "fail");
    expect(fails.map((f) => `${f.rule_id}/${f.condition}`)).toEqual([]);
    expect(findingsOf(report, "SEO-META-03", "info").length).toBe(1);
    expect(findingsOf(report, "SEO-SITEMAP-05", "info").length).toBe(1);
    expect(findingsOf(report, "SEO-AI-05", "info")[0]!.reason).toContain("Google Search ignores llms.txt files");
    expect(findingsOf(report, "SEO-HDG-01", "info").some((f) => f.observed.n === 3)).toBe(true);
    // A missing description is an opportunity, never a failure (§6).
    expect(findingsOf(report, "SEO-META-02C", "opportunity").length).toBe(1);
    expect(findingsOf(report, "SEO-META-02C", "fail").length).toBe(0);
    expect(report.not_scored.claims.length).toBe(MYTHS.length);
  });
});

describe("intent inference (PRODUCT.md §7.4 step 4)", () => {
  it("adds link-discovered 200 pages without noindex when there is no sitemap", async () => {
    const site = baselineSite();
    site.responses["https://www.example.com/robots.txt"] = text("User-agent: *\nDisallow: /private/\n");
    delete site.responses["https://www.example.com/sitemap.xml"];
    site.responses["https://www.example.com/hidden"] = page("Hidden", `<meta name="robots" content="noindex">`, `<a href="/">Home</a>`);
    site.responses["https://www.example.com/"] = page("Example Home", `<link rel="canonical" href="https://www.example.com/"><link rel="icon" href="/favicon.png">`, `<h1>Example</h1><a href="/about">About the company</a> <a href="/hidden">Hidden page</a>`);
    const { report } = await reportOf(site, { start_url: "https://www.example.com/" });
    expect(report.meta.intent_inferred).toBe(true);
    expect(report.headline.intended).toBe(3); // home, about, contact (via about)
    expect(report.headline.summary).toContain("Intent was inferred");
    expect(findingsOf(report, "SEO-SITEMAP-08", "opportunity").length).toBe(1);
    expect(findingsOf(report, "SEO-IDX-06", "fail").length).toBe(0);
    expect(findingsOf(report, "SEO-IDX-01", "info").some((f) => f.unit === "https://www.example.com/hidden")).toBe(true);
  });
});

describe("favicon pipeline", () => {
  it("fetches favicons and reads their dimensions", async () => {
    const site = baselineSite();
    site.responses["https://www.example.com/favicon.png"] = image(png(32, 32));
    const { report } = await reportOf(site, { start_url: "https://www.example.com/" });
    expect(conditionsOf(report, "SEO-META-05B")).toEqual(["not_larger_than_48"]);
    expect(report.features.find((f) => f.feature === "favicon")!.status).toBe("eligible");
  });
});
