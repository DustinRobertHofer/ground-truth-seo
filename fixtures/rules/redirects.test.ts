import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, redirect, reportOf, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const HOME = `${ORIGIN}/`;
const START = { start_url: HOME };

function site(extra: FakeSite["responses"]): FakeSite {
  const base = baselineSite(ORIGIN);
  return { ...base, responses: { ...base.responses, ...extra } };
}

const HOME_HEAD = `<link rel="canonical" href="${HOME}"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"${HOME}"}</script>`;
const HOME_BODY = `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <img src="/photo.png" alt="Office" width="100" height="100">`;

/** The home page with extra body markup (typically a link to a redirecting URL). */
function home(bodyExtra: string) {
  return page("Example Home", HOME_HEAD, `${HOME_BODY} ${bodyExtra}`);
}

function expectWellFormedFails(findings: Finding[]) {
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    expect(f.reason, `${f.rule_id}/${f.condition}`).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(f.citations.length, `${f.rule_id}/${f.condition}`).toBeGreaterThan(0);
  }
}

describe("redirect units", () => {
  it("the baseline has none: variant probes and samples are excluded", async () => {
    const { report } = await reportOf(baselineSite(), START);
    for (const rule of ["SEO-REDIR-07", "SEO-REDIR-03", "SEO-REDIR-01"]) expect(findingsOf(report, rule), rule).toEqual([]);
  });
});

describe("SEO-REDIR-07 redirect chains resolve", () => {
  it("passes for a single-hop redirect reached by a link", async () => {
    const s = site({ [HOME]: home(`<a href="/old-about">Our history</a>`), [`${ORIGIN}/old-about`]: redirect(`${ORIGIN}/about`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-REDIR-07")).toEqual([]);
    const passes = findingsOf(report, "SEO-REDIR-07", "pass");
    expect(passes.map((f) => f.unit)).toEqual([`${ORIGIN}/old-about`]);
    expect(passes[0]!.observed.hops).toBe(1);
  });

  it("fails loop for A → B → A reached by a link", async () => {
    const s = site({
      [HOME]: home(`<a href="/loop-a">Looping page</a>`),
      [`${ORIGIN}/loop-a`]: redirect(`${ORIGIN}/loop-b`),
      [`${ORIGIN}/loop-b`]: redirect(`${ORIGIN}/loop-a`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-REDIR-07")).toEqual(["loop"]);
    const fails = findingsOf(report, "SEO-REDIR-07", "fail");
    expect(fails.map((f) => f.unit).sort()).toEqual([`${ORIGIN}/loop-a`, `${ORIGIN}/loop-b`]);
    expectWellFormedFails(fails);
    const a = fails.find((f) => f.unit === `${ORIGIN}/loop-a`)!;
    expect(a.observed.chain).toBe(`${ORIGIN}/loop-a → ${ORIGIN}/loop-b → ${ORIGIN}/loop-a`);
    // SEO-REDIR-03 defers to this rule for chains that never resolve.
    expect(findingsOf(report, "SEO-REDIR-03", "not_applicable").map((f) => f.unit).sort()).toEqual([`${ORIGIN}/loop-a`, `${ORIGIN}/loop-b`]);
    expect(conditionsOf(report, "SEO-REDIR-03")).toEqual([]);
  });

  it("fails too_many_hops for a chain of 11 redirects", async () => {
    const hops: FakeSite["responses"] = {};
    for (let i = 1; i <= 11; i += 1) hops[`${ORIGIN}/hop-${String(i).padStart(2, "0")}`] = redirect(`${ORIGIN}/hop-${String(i + 1).padStart(2, "0")}`);
    hops[`${ORIGIN}/hop-12`] = page("Landing", `<link rel="canonical" href="${ORIGIN}/hop-12"><meta name="description" content="Landing."><meta name="viewport" content="width=device-width">`, `<h1>Landing</h1><p>Text.</p><a href="/">Home page</a>`);
    const s = site({ [HOME]: home(`<a href="/hop-01">Deep chain</a>`), ...hops });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-REDIR-07")).toContain("too_many_hops");
    const fails = findingsOf(report, "SEO-REDIR-07", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/hop-01`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.chain).toContain(`${ORIGIN}/hop-01 → ${ORIGIN}/hop-02`);
    expect(fails[0]!.observed.chain).toContain(`${ORIGIN}/hop-11`);
    expect(findingsOf(report, "SEO-REDIR-03", "not_applicable").map((f) => f.unit)).toEqual([`${ORIGIN}/hop-01`]);
  });

  it("excludes members of I, whose redirects SEO-HTTP-01 judges", async () => {
    const s = site({
      [`${ORIGIN}/sitemap.xml`]: { status: 200, headers: { "content-type": "application/xml" }, body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${HOME}</loc></url>\n<url><loc>${ORIGIN}/about</loc></url>\n<url><loc>${ORIGIN}/contact</loc></url>\n<url><loc>${ORIGIN}/loop-a</loc></url>\n</urlset>\n` },
      [`${ORIGIN}/loop-a`]: redirect(`${ORIGIN}/loop-b`),
      [`${ORIGIN}/loop-b`]: redirect(`${ORIGIN}/loop-a`),
    });
    const { report } = await reportOf(s, START);
    expect(findingsOf(report, "SEO-REDIR-07").map((f) => f.unit)).toEqual([`${ORIGIN}/loop-b`]);
  });
});

describe("SEO-REDIR-03 redirects go straight to the final destination", () => {
  it("passes for a single hop", async () => {
    const s = site({ [HOME]: home(`<a href="/old-about">Our history</a>`), [`${ORIGIN}/old-about`]: redirect(`${ORIGIN}/about`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-REDIR-03")).toEqual([]);
    expect(findingsOf(report, "SEO-REDIR-03", "pass").map((f) => f.unit)).toEqual([`${ORIGIN}/old-about`]);
  });

  it("fails multi_hop for a two-hop chain", async () => {
    const s = site({
      [HOME]: home(`<a href="/oldest-about">Our history</a>`),
      [`${ORIGIN}/oldest-about`]: redirect(`${ORIGIN}/older-about`),
      [`${ORIGIN}/older-about`]: redirect(`${ORIGIN}/about`),
    });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-REDIR-03")).toEqual(["multi_hop"]);
    const fails = findingsOf(report, "SEO-REDIR-03", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/oldest-about`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.hops).toBe(2);
    expect(fails[0]!.observed.final).toBe(`${ORIGIN}/about`);
    expect(fails[0]!.observed.chain).toBe(`${ORIGIN}/oldest-about → ${ORIGIN}/older-about → ${ORIGIN}/about`);
    // The middle hop is a one-hop unit of its own and passes.
    expect(findingsOf(report, "SEO-REDIR-03", "pass").map((f) => f.unit)).toEqual([`${ORIGIN}/older-about`]);
    expect(conditionsOf(report, "SEO-REDIR-07")).toEqual([]);
  });
});

describe("informational redirect rules", () => {
  it("SEO-REDIR-01 reports temporary_redirect for a 302", async () => {
    const s = site({
      [HOME]: home(`<a href="/promo">Current promotion</a> <a href="/old-about">Our history</a>`),
      [`${ORIGIN}/promo`]: redirect(`${ORIGIN}/about`, 302),
      [`${ORIGIN}/old-about`]: redirect(`${ORIGIN}/about`, 301),
    });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-REDIR-01", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/promo`]);
    expect(infos[0]!.condition).toBe("temporary_redirect");
    expect(infos[0]!.observed.status).toBe(302);
    expect(infos[0]!.observed.target).toBe(`${ORIGIN}/about`);
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(infos[0]!.citations.length).toBeGreaterThan(0);
    expect(conditionsOf(report, "SEO-REDIR-01")).toEqual([]);
  });

  it("SEO-REDIR-06 reports client_side_redirect for a top-level location assignment", async () => {
    const s = site({
      [`${ORIGIN}/contact`]: page(
        "Contact Example",
        `<link rel="canonical" href="${ORIGIN}/contact"><meta name="description" content="How to contact the example company."><meta name="viewport" content="width=device-width">`,
        `<h1>Contact</h1><p>Text.</p><a href="/">Home page</a> <a href="/about">About the company</a><script>\nwindow.location.href = "/about";\n</script>`,
      ),
    });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-REDIR-06", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/contact`]);
    expect(infos[0]!.condition).toBe("client_side_redirect");
    expect(infos[0]!.observed.snippet).toContain("location.href");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(conditionsOf(report, "SEO-REDIR-06")).toEqual([]);
  });

  it("SEO-REDIR-06 ignores a location assignment inside a function", async () => {
    const s = site({
      [`${ORIGIN}/contact`]: page(
        "Contact Example",
        `<link rel="canonical" href="${ORIGIN}/contact"><meta name="description" content="How to contact the example company."><meta name="viewport" content="width=device-width">`,
        `<h1>Contact</h1><p>Text.</p><a href="/">Home page</a> <a href="/about">About the company</a><script>\nfunction go() {\n  location.href = "/about";\n}\n</script>`,
      ),
    });
    const { report } = await reportOf(s, START);
    expect(findingsOf(report, "SEO-REDIR-06")).toEqual([]);
  });
});
