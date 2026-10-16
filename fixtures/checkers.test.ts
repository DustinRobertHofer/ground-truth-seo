import { describe, expect, it } from "vitest";
import { CHECKERS, checkerBySlug, type CheckerSlug } from "../src/checkers/config.js";
import { buildCheckResult, checkerInput } from "../src/checkers/run.js";
import type { CheckResult } from "../src/checkers/types.js";
import { baselineSite, html, page, redirect, snapshotOf, text, xml, type FakeSite } from "../src/testing/index.js";

const ORIGIN = "https://www.example.com";

async function check(slug: CheckerSlug, site: FakeSite, url = `${ORIGIN}/`): Promise<CheckResult> {
  const checker = checkerBySlug(slug);
  const { snapshot, config } = await snapshotOf(site, checkerInput(checker, url), undefined, checker.focus);
  return buildCheckResult(checker, snapshot, config);
}

function issue(result: CheckResult, ruleId: string, condition?: string) {
  return result.issues.find((i) => i.rule_id === ruleId && (condition === undefined || i.condition === condition));
}

describe("every checker on a conforming site", () => {
  for (const checker of CHECKERS) {
    it(`${checker.slug} reports no issues and only its own rules`, async () => {
      const result = await check(checker.slug, baselineSite());
      const allowed = new Set(checker.ruleIds);
      expect(result.reach.status).toBe("ok");
      expect(result.issues).toEqual([]);
      expect(result.issueCount).toBe(0);
      expect(result.rules.map((r) => r.rule_id)).toEqual([...checker.ruleIds]);
      for (const o of result.observations) expect(allowed.has(o.rule_id), o.rule_id).toBe(true);
      expect(result.checker).toBe(checker.slug);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
  }
});

describe("robots.txt checker", () => {
  it("reports intended URLs blocked by Disallow: / and shows the group that blocks them", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text(`User-agent: *\nDisallow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
    const result = await check("robots-txt-checker", site);
    const blocked = issue(result, "SEO-ROBOTS-05A", "disallowed_googlebot")!;
    // The scanner obeys the same rule, so it cannot read the sitemap: only the home page is known.
    expect(blocked.affected).toEqual([`${ORIGIN}/`]);
    expect(blocked.citations.every((c) => c.url?.startsWith("https://"))).toBe(true);
    expect(issue(result, "SEO-ROBOTS-05A", "disallowed_bingbot")).toBeDefined();
    if (result.details.kind !== "robots") throw new Error("details");
    expect(result.details.groups).toEqual([{ agents: ["*"], line: 1, rules: [{ kind: "disallow", pattern: "/", line: 2 }] }]);
    expect(result.details.sitemaps).toEqual([{ value: `${ORIGIN}/sitemap.xml`, line: 3, fullyQualified: true }]);
    const googlebot = result.details.crawlers.find((c) => c.token === "Googlebot")!;
    expect(googlebot.home.outcome).toBe("disallowed");
    expect(googlebot.group.kind).toBe("wildcard");
    expect(result.details.text).toContain("Disallow: /");
  });

  it("marks a relative Sitemap line with the SEO-ROBOTS-08 verdict", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text("User-agent: *\nDisallow: /private/\nSitemap: /sitemap.xml\nCrawl-delay: 5\n");
    const result = await check("robots-txt-checker", site);
    expect(issue(result, "SEO-ROBOTS-08", "not_fully_qualified")).toBeDefined();
    if (result.details.kind !== "robots") throw new Error("details");
    expect(result.details.sitemaps).toEqual([{ value: "/sitemap.xml", line: 3, fullyQualified: false }]);
    expect(result.details.ignored.map((l) => l.line)).toEqual([4]);
    expect(result.observations.some((o) => o.rule_id === "SEO-ROBOTS-10")).toBe(true);
  });

  it("explains that nothing else was fetched when robots.txt answers 503", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = { status: 503, body: "" };
    const result = await check("robots-txt-checker", site);
    expect(result.reach.status).toBe("robots_unavailable");
    expect(result.reach.robotsOutcome).toBe("HTTP 503");
    expect(issue(result, "SEO-ROBOTS-04", "server_error")).toBeDefined();
  });

  it("reports a host that does not resolve", async () => {
    const result = await check("robots-txt-checker", { responses: {}, hosts: {} }, "https://nowhere.example/");
    expect(result.reach.status).toBe("dns_error");
  });
});

describe("sitemap checker", () => {
  it("lists each file and the sampled URLs, with redirects and errors judged by the rules", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${ORIGIN}/</loc></url>\n<url><loc>${ORIGIN}/old</loc></url>\n<url><loc>${ORIGIN}/gone</loc></url>\n</urlset>\n`);
    site.responses[`${ORIGIN}/old`] = redirect(`${ORIGIN}/about`);
    const result = await check("sitemap-checker", site);
    expect(issue(result, "SEO-SITEMAP-03", "redirects")!.affected).toEqual([`${ORIGIN}/old`]);
    expect(issue(result, "SEO-HTTP-01", "client_error")!.affected).toEqual([`${ORIGIN}/gone`]);
    if (result.details.kind !== "sitemaps") throw new Error("details");
    expect(result.details.files).toHaveLength(1);
    expect(result.details.files[0]).toMatchObject({ url: `${ORIGIN}/sitemap.xml`, foundBy: "robots", outcome: "HTTP 200", format: "urlset", urls: 3, valid: 3 });
    expect(result.details.listed).toBe(3);
    expect(result.details.sampled.map((s) => [s.url, s.redirects])).toEqual([
      [`${ORIGIN}/`, false],
      [`${ORIGIN}/gone`, false],
      [`${ORIGIN}/old`, true],
    ]);
  });

  it("fails a declared sitemap that is not well-formed XML", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = xml(`<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url>\n`);
    const result = await check("sitemap-checker", site);
    expect(issue(result, "SEO-SITEMAP-07", "not_well_formed")).toBeDefined();
    if (result.details.kind !== "sitemaps") throw new Error("details");
    expect(result.details.files[0]!.error).not.toBeNull();
  });

  it("reports the /sitemap.xml fallback when robots.txt declares none", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text("User-agent: *\nDisallow:\n");
    delete site.responses[`${ORIGIN}/sitemap.xml`];
    const result = await check("sitemap-checker", site);
    if (result.details.kind !== "sitemaps") throw new Error("details");
    expect(result.details.declared).toEqual([]);
    expect(result.details.conventionOutcome).toBe("HTTP 404");
    expect(issue(result, "SEO-SITEMAP-08", "none_found")).toMatchObject({ kind: "add", affected: ["site"] });
    expect(result.observations.some((o) => o.rule_id === "SEO-SITEMAP-08")).toBe(false);
    expect(result).toMatchObject({ issueCount: 0, opportunityCount: 1 });
    expect(result.rules.find((r) => r.rule_id === "SEO-SITEMAP-08")).toMatchObject({ hasOpportunity: true, counts: { opportunity: 1 } });
  });
});

describe("canonical checker", () => {
  it("evaluates the entered deep page and lists it first", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/guides/one`] = page("Guide one", `<link rel="canonical" href="/guides/one">`);
    const result = await check("canonical-checker", site, `${ORIGIN}/guides/one`);
    expect(issue(result, "SEO-CANON-02", "relative")!.affected).toEqual([`${ORIGIN}/guides/one`]);
    if (result.details.kind !== "canonical") throw new Error("details");
    expect(result.details.pages[0]).toMatchObject({ url: `${ORIGIN}/guides/one`, entered: true, relation: "self" });
  });

  it("follows a cross-page canonical to a target that redirects permanently", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = page("About Example", `<link rel="canonical" href="http://www.example.com/about-us">`);
    site.responses["http://www.example.com/about-us"] = redirect(`${ORIGIN}/about`);
    const result = await check("canonical-checker", site);
    expect(issue(result, "SEO-CANON-04", "target_permanent_redirect")!.affected).toEqual([`${ORIGIN}/about`]);
    if (result.details.kind !== "canonical") throw new Error("details");
    const about = result.details.pages.find((p) => p.url === `${ORIGIN}/about`)!;
    expect(about).toMatchObject({ relation: "other", target: "http://www.example.com/about-us", targetFirst: "HTTP 301", schemeDiffers: true });
  });

  it("reports conflicting canonicals", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/contact`] = page("Contact Example", `<link rel="canonical" href="${ORIGIN}/contact"><link rel="canonical" href="${ORIGIN}/contact-us">`);
    const result = await check("canonical-checker", site);
    expect(issue(result, "SEO-CANON-08", "conflicting_canonicals")!.affected).toEqual([`${ORIGIN}/contact`]);
  });
});

describe("llms.txt checker", () => {
  it("reads the proposal's structure and flags link targets that do not parse", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/llms.txt`] = text("# Example\n\n> A summary.\n\n## Docs\n\n- [Guide](https://www.example.com/guide.md): the guide\n- [Broken](http://exa mple)\n- [Odd](https://[bad)\n");
    const result = await check("llms-txt-checker", site);
    if (result.details.kind !== "llms") throw new Error("details");
    expect(result.details).toMatchObject({ found: true, servedHtml: false, outcome: "HTTP 200", blockedForScanner: false });
    expect(result.details.structure).toMatchObject({ h1: "Example", summary: "A summary.", sections: [{ title: "Docs", links: 3 }], markdownLinks: 1 });
    expect(result.details.malformedLinks).toEqual(["https://[bad"]);
    expect(result.observations.map((o) => o.rule_id)).toEqual(["SEO-AI-05"]);
    expect(result.issues).toEqual([]);
  });

  it("notices an HTML page served at /llms.txt", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/llms.txt`] = page("Home");
    const result = await check("llms-txt-checker", site);
    if (result.details.kind !== "llms") throw new Error("details");
    expect(result.details).toMatchObject({ found: false, servedHtml: true });
  });

  it("says when the scanner's own robots.txt rules kept it from /llms.txt", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text("User-agent: *\nDisallow: /llms.txt\n");
    const result = await check("llms-txt-checker", site);
    if (result.details.kind !== "llms") throw new Error("details");
    expect(result.details.blockedForScanner).toBe(true);
  });
});

describe("AI crawler checker", () => {
  it("shows a named block for GPTBot without calling it a failure", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text(`User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap.xml\n`);
    const result = await check("ai-crawler-checker", site);
    expect(result.issues).toEqual([]);
    if (result.details.kind !== "ai") throw new Error("details");
    const gptbot = result.details.crawlers.find((c) => c.token === "GPTBot")!;
    expect(gptbot).toMatchObject({ role: "training", group: { kind: "named", token: "gptbot", lines: [1] }, home: { outcome: "disallowed", rule: "Disallow: /", line: 2 } });
    expect(gptbot.sample.disallowed).toBe(2);
    const searchBot = result.details.crawlers.find((c) => c.token === "OAI-SearchBot")!;
    expect(searchBot).toMatchObject({ role: "search", group: { kind: "wildcard" }, home: { outcome: "allowed" } });
    const applebot = result.details.crawlers.find((c) => c.token === "Applebot")!;
    expect(applebot.group.kind).toBe("wildcard");
    expect(result.details.crawlers.filter((c) => c.userTriggered).map((c) => c.token)).toEqual(["ChatGPT-User", "Perplexity-User"]);
    expect(result.details.sampled).toEqual([`${ORIGIN}/`, `${ORIGIN}/about`, `${ORIGIN}/contact`]);
  });
});

describe("meta description checker", () => {
  it("finds duplicates and repeated tags to fix, missing descriptions to add, and reports length as information", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = page("About Example", `<meta name="description" content="The example home page.">`);
    site.responses[`${ORIGIN}/contact`] = page("Contact Example", `<meta name="description" content="One."><meta name="description" content="Two.">`);
    site.responses[`${ORIGIN}/team`] = page("Team");
    site.responses[`${ORIGIN}/`] = page("Example Home", `<meta name="description" content="The example home page.">`, `<a href="/about">About</a> <a href="/contact">Contact</a> <a href="/team">Team</a>`);
    const result = await check("meta-description-checker", site);
    expect(issue(result, "SEO-META-02B", "duplicate")!.affected).toEqual([`${ORIGIN}/`, `${ORIGIN}/about`]);
    expect(issue(result, "SEO-META-02A", "multiple")!.affected).toEqual([`${ORIGIN}/contact`]);
    expect(issue(result, "SEO-META-02B", "duplicate")!.kind).toBe("fix");
    expect(issue(result, "SEO-META-02C", "absent")).toMatchObject({ kind: "add", affected: [`${ORIGIN}/team`] });
    expect(result).toMatchObject({ issueCount: 2, opportunityCount: 1 });
    expect(result.observations.filter((o) => o.rule_id === "SEO-META-02C")).toEqual([]);
    if (result.details.kind !== "meta") throw new Error("details");
    const home = result.details.pages[0]!;
    expect(home).toMatchObject({ url: `${ORIGIN}/`, entered: true, duplicates: [`${ORIGIN}/about`] });
    expect(home.descriptions).toEqual([{ content: "The example home page.", length: 22, line: 5, inHead: true }]);
    expect(result.details.excluded).toBe(0);
  });

  it("leaves out pages that are not intended for indexing, and says how many", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text("User-agent: Googlebot\nDisallow: /contact\n\nUser-agent: *\nDisallow:\n");
    const result = await check("meta-description-checker", site);
    if (result.details.kind !== "meta") throw new Error("details");
    expect(result.details.pages.map((p) => p.url)).toEqual([`${ORIGIN}/`, `${ORIGIN}/about`]);
    expect(result.details.excluded).toBe(1);
  });
});

describe("redirect checker", () => {
  it("probes every variant and shows one permanent redirect each on a conforming site", async () => {
    const result = await check("redirect-checker", baselineSite());
    if (result.details.kind !== "redirects") throw new Error("details");
    expect(result.details.entered).toMatchObject({ url: `${ORIGIN}/`, redirects: 0, finalOutcome: "HTTP 200", finalUrl: `${ORIGIN}/` });
    expect(result.details.variants.map((v) => [v.url, v.redirects, v.finalUrl])).toEqual([
      ["http://example.com/", 1, `${ORIGIN}/`],
      ["http://example.com/about", 1, `${ORIGIN}/about`],
      ["http://www.example.com/", 1, `${ORIGIN}/`],
      ["http://www.example.com/about", 1, `${ORIGIN}/about`],
      ["https://example.com/", 1, `${ORIGIN}/`],
      ["https://example.com/about", 1, `${ORIGIN}/about`],
    ]);
    expect(result.details.variants[0]!.hops).toEqual([
      { url: "http://example.com/", outcome: "HTTP 301", next: `${ORIGIN}/` },
      { url: `${ORIGIN}/`, outcome: "HTTP 200", next: null },
    ]);
  });

  it("traces the entered address hop by hop and reports the chain", async () => {
    const site = baselineSite();
    site.responses["http://example.com/old"] = redirect("https://example.com/old");
    site.responses["https://example.com/old"] = redirect(`${ORIGIN}/old`);
    site.responses[`${ORIGIN}/old`] = redirect(`${ORIGIN}/about`);
    const result = await check("redirect-checker", site, "http://example.com/old");
    if (result.details.kind !== "redirects") throw new Error("details");
    expect(result.details.entered.hops.map((h) => [h.url, h.outcome])).toEqual([
      ["http://example.com/old", "HTTP 301"],
      ["https://example.com/old", "HTTP 301"],
      [`${ORIGIN}/old`, "HTTP 301"],
      [`${ORIGIN}/about`, "HTTP 200"],
    ]);
    expect(result.details.entered).toMatchObject({ redirects: 3, finalUrl: `${ORIGIN}/about` });
    expect(issue(result, "SEO-REDIR-03", "multi_hop")!.affected).toContain("http://example.com/old");
    expect(result.details.redirecting.map((r) => r.url)).not.toContain(`${ORIGIN}/old`);
  });

  it("reports a loop, a temporary variant redirect and a meta refresh", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/a`] = redirect(`${ORIGIN}/b`);
    site.responses[`${ORIGIN}/b`] = redirect(`${ORIGIN}/a`);
    site.responses["http://example.com/"] = redirect(`${ORIGIN}/`, 302);
    site.responses[`${ORIGIN}/contact`] = page("Contact Example", `<meta http-equiv="refresh" content="0; url=/about">`);
    const result = await check("redirect-checker", site, `${ORIGIN}/a`);
    if (result.details.kind !== "redirects") throw new Error("details");
    expect(result.details.entered.finalOutcome).toBe("a redirect loop");
    expect(issue(result, "SEO-REDIR-07", "loop")!.affected).toContain(`${ORIGIN}/a`);
    expect(issue(result, "SEO-URL-01", "variant_temporary_redirect")).toBeDefined();
    expect(issue(result, "SEO-META-06", "meta_refresh_redirect")!.affected).toEqual([`${ORIGIN}/contact`]);
  });
});

describe("noindex checker", () => {
  it("fails a sitemap page that carries noindex and shows where the rule came from", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = page("About Example", `<meta name="robots" content="noindex, follow">`, `<h1>About</h1><a href="/">Home page</a>`);
    const result = await check("noindex-checker", site, `${ORIGIN}/about`);
    expect(issue(result, "SEO-IDX-06", "noindex")!.affected).toEqual([`${ORIGIN}/about`]);
    if (result.details.kind !== "indexing") throw new Error("details");
    expect(result.details).toMatchObject({ sitemapFound: true, intended: 3, robotsOutcome: "HTTP 200" });
    const about = result.details.pages[0]!;
    expect(about).toMatchObject({ url: `${ORIGIN}/about`, entered: true, outcome: "HTTP 200", noindex: true, intent: `it is in ${ORIGIN}/sitemap.xml`, canonical: null });
    expect(about.directives).toEqual([{ source: "meta robots (line 5)", value: "noindex, follow", appliesToGoogle: true }]);
    expect(about.googlebot).toEqual({ outcome: "allowed", rule: null, line: null });
    expect(result.details.pages.find((p) => p.url === `${ORIGIN}/`)).toMatchObject({ noindex: false, effective: "none", intent: "it is the home page" });
  });

  it("finds a noindex Google cannot read behind a robots.txt disallow, and a noindex line in robots.txt", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text(`User-agent: Googlebot\nDisallow: /team\nNoindex: /private/\n\nUser-agent: *\nDisallow:\nSitemap: ${ORIGIN}/sitemap.xml\n`);
    site.responses[`${ORIGIN}/`] = page("Example Home", "", `<h1>Example</h1><a href="/about">About the company</a> <a href="/contact">Contact us</a> <a href="/team">Our team</a>`);
    site.responses[`${ORIGIN}/team`] = page("Team", `<meta name="robots" content="noindex">`);
    const result = await check("noindex-checker", site);
    // /team is not in the sitemap, so it is not an intended page: its noindex is a choice, but Google can never read it.
    expect(issue(result, "SEO-IDX-02", "noindex_behind_disallow")!.affected).toEqual([`${ORIGIN}/team`]);
    expect(issue(result, "SEO-IDX-03", "noindex_in_robots_txt")).toBeDefined();
    expect(issue(result, "SEO-IDX-06")).toBeUndefined();
    if (result.details.kind !== "indexing") throw new Error("details");
    const team = result.details.pages.find((p) => p.url === `${ORIGIN}/team`)!;
    expect(team).toMatchObject({ intent: null, noindex: true });
    expect(team.googlebot).toEqual({ outcome: "disallowed", rule: "Disallow: /team", line: 2 });
    expect(team.bingbot.outcome).toBe("allowed");
  });

  it("reads noindex from the X-Robots-Tag header", async () => {
    const site = baselineSite();
    const home = site.responses[`${ORIGIN}/`] as { headers: Record<string, string> };
    home.headers = { ...home.headers, "x-robots-tag": "noindex" };
    const result = await check("noindex-checker", site);
    expect(issue(result, "SEO-IDX-06", "noindex")!.affected).toEqual([`${ORIGIN}/`]);
    if (result.details.kind !== "indexing") throw new Error("details");
    expect(result.details.pages[0]!.directives).toEqual([{ source: "the X-Robots-Tag header", value: "noindex", appliesToGoogle: true }]);
  });
});

describe("hreflang checker", () => {
  it("lists each annotation, confirms return links and flags codes, relative URLs and missing return links", async () => {
    const site = baselineSite();
    const alternates = [
      `<link rel="alternate" hreflang="en" href="${ORIGIN}/">`,
      `<link rel="alternate" hreflang="de" href="${ORIGIN}/de/">`,
      `<link rel="alternate" hreflang="fr" href="${ORIGIN}/fr/">`,
      `<link rel="alternate" hreflang="en-UK" href="/uk/">`,
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`,
    ].join("");
    site.responses[`${ORIGIN}/`] = page("Example Home", alternates, `<h1>Example</h1><a href="/about">About the company</a>`);
    site.responses[`${ORIGIN}/de/`] = page("Beispiel", `<link rel="alternate" hreflang="en" href="${ORIGIN}/"><link rel="alternate" hreflang="de" href="${ORIGIN}/de/">`);
    site.responses[`${ORIGIN}/fr/`] = page("Exemple", `<link rel="alternate" hreflang="fr" href="${ORIGIN}/fr/">`);
    site.responses[`${ORIGIN}/uk/`] = page("Example UK");
    const result = await check("hreflang-checker", site);
    expect(issue(result, "SEO-I18N-02", "not_reciprocated")!.affected).toContain(`${ORIGIN}/`);
    expect(issue(result, "SEO-I18N-04", "unsupported_code")).toBeDefined();
    expect(issue(result, "SEO-I18N-03", "not_fully_qualified")).toBeDefined();
    if (result.details.kind !== "hreflang") throw new Error("details");
    const home = result.details.pages[0]!;
    expect(home).toMatchObject({ url: `${ORIGIN}/`, entered: true });
    const byCode = new Map(home.alternates.map((a) => [a.code, a]));
    expect(byCode.get("en")).toMatchObject({ self: true, linksBack: null, method: "html", inHead: true });
    expect(byCode.get("de")).toMatchObject({ self: false, outcome: "HTTP 200", linksBack: true });
    expect(byCode.get("fr")).toMatchObject({ outcome: "HTTP 200", linksBack: false });
    expect(byCode.get("en-UK")).toMatchObject({ href: "/uk/", url: `${ORIGIN}/uk/` });
    expect(result.details.without).toBeGreaterThan(0);
  });

  it("reports a site without hreflang as having nothing to fix", async () => {
    const result = await check("hreflang-checker", baselineSite());
    expect(result.issues).toEqual([]);
    if (result.details.kind !== "hreflang") throw new Error("details");
    expect(result.details.pages.map((p) => [p.url, p.alternates.length])).toEqual([[`${ORIGIN}/`, 0]]);
  });
});

describe("entered pages outside the sitemap", () => {
  // The title and hreflang checkers fetch no sitemap, so the intended set is inferred from links
  // (PRODUCT.md §7.4 step 4) and the entered URL, crawled at depth 0, is evaluated like any other page.
  it("are evaluated by the title tag checker", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/guides/one`] = page("About Example");
    const result = await check("title-tag-checker", site, `${ORIGIN}/guides/one`);
    expect(issue(result, "SEO-META-01", "duplicate")!.affected).toEqual([`${ORIGIN}/about`, `${ORIGIN}/guides/one`]);
    if (result.details.kind !== "titles") throw new Error("details");
    expect(result.details.pages[0]).toMatchObject({ url: `${ORIGIN}/guides/one`, entered: true });
  });

  it("are evaluated by the hreflang checker", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/guides/one`] = page("Guide one", `<link rel="alternate" hreflang="en-UK" href="${ORIGIN}/guides/one">`);
    const result = await check("hreflang-checker", site, `${ORIGIN}/guides/one`);
    expect(issue(result, "SEO-I18N-04", "unsupported_code")!.affected).toEqual([`${ORIGIN}/guides/one`]);
    if (result.details.kind !== "hreflang") throw new Error("details");
    expect(result.details.pages[0]).toMatchObject({ url: `${ORIGIN}/guides/one`, entered: true });
  });
});

describe("title tag checker", () => {
  it("finds duplicate, repeated, missing and vague titles and prints each page's first h1", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = page("Home", "<title>Second title</title>", `<h1>Example</h1><h1>Again</h1><a href="/about">About the company</a> <a href="/contact">Contact us</a> <a href="/team">Team</a>`);
    site.responses[`${ORIGIN}/about`] = page("Example Company", "", "<h1>About</h1>");
    site.responses[`${ORIGIN}/contact`] = page("example company", "", "<h1>Contact</h1>");
    site.responses[`${ORIGIN}/team`] = { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: html("", "<h1>Team</h1>") };
    const result = await check("title-tag-checker", site);
    expect(issue(result, "SEO-META-01", "duplicate")!.affected).toEqual([`${ORIGIN}/about`, `${ORIGIN}/contact`]);
    expect(issue(result, "SEO-META-01", "vague_home")!.affected).toEqual([`${ORIGIN}/`]);
    expect(issue(result, "SEO-HEAD-01B", "multiple")!.affected).toEqual([`${ORIGIN}/`]);
    expect(issue(result, "SEO-HEAD-01", "missing")!.affected).toEqual([`${ORIGIN}/team`]);
    expect(result.observations.some((o) => o.rule_id === "SEO-HDG-01")).toBe(false);
    if (result.details.kind !== "titles") throw new Error("details");
    const home = result.details.pages[0]!;
    expect(home).toMatchObject({ url: `${ORIGIN}/`, entered: true, h1Count: 2, firstH1: "Example", duplicates: [] });
    expect(home.titles.map((t) => [t.text, t.length, t.inHead])).toEqual([
      ["Home", 4, true],
      ["Second title", 12, true],
    ]);
    const about = result.details.pages.find((p) => p.url === `${ORIGIN}/about`)!;
    expect(about.duplicates).toEqual([`${ORIGIN}/contact`]);
    const team = result.details.pages.find((p) => p.url === `${ORIGIN}/team`)!;
    expect(team.titles).toEqual([]);
  });
});

