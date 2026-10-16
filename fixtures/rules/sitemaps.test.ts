import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, redirect, reportOf, text, xml, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const START = { start_url: `${ORIGIN}/` };
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

/** A urlset from raw <url> entries. */
function urlset(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n${entries}\n</urlset>\n`;
}

function entry(loc: string, lastmod?: string, extra = ""): string {
  return `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${extra}</url>`;
}

const BASE_ENTRIES = [entry(`${ORIGIN}/`), entry(`${ORIGIN}/about`), entry(`${ORIGIN}/contact`)];

function sitemapindex(children: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NS}">\n${children.map((c) => `<sitemap><loc>${c}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}

/** The baseline with its sitemap body replaced. */
function siteWithSitemap(body: string): FakeSite {
  const site = baselineSite();
  site.responses[SITEMAP] = xml(body);
  return site;
}

/** The baseline with robots.txt declaring other sitemaps. */
function siteDeclaring(...sitemaps: string[]): FakeSite {
  const site = baselineSite();
  site.responses[`${ORIGIN}/robots.txt`] = text(`User-agent: *\nDisallow: /private/\n${sitemaps.map((s) => `Sitemap: ${s}`).join("\n")}\n`);
  return site;
}

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

describe("sitemap rules on the baseline", () => {
  let report: Report;
  beforeAll(async () => {
    ({ report } = await reportOf(baselineSite(), START));
  });

  it("SEO-SITEMAP-07 passes", () => expectPass(report, "SEO-SITEMAP-07", SITEMAP));
  it("SEO-SITEMAP-01 passes", () => expectPass(report, "SEO-SITEMAP-01", SITEMAP));
  it("SEO-SITEMAP-02 passes", () => expectPass(report, "SEO-SITEMAP-02", SITEMAP));
  it("SEO-SITEMAP-02B passes", () => expectPass(report, "SEO-SITEMAP-02B", SITEMAP));
  it("SEO-SITEMAP-02C passes", () => expectPass(report, "SEO-SITEMAP-02C", SITEMAP));
  it("SEO-SITEMAP-03 passes for every listed loc", () => {
    expectPass(report, "SEO-SITEMAP-03", `${ORIGIN}/about`);
    expect(findingsOf(report, "SEO-SITEMAP-03", "pass").length).toBe(3);
  });
  it("SEO-SITEMAP-04A passes", () => expectPass(report, "SEO-SITEMAP-04A", SITEMAP));
  it("SEO-SITEMAP-04B passes", () => expectPass(report, "SEO-SITEMAP-04B", SITEMAP));
  it("SEO-SITEMAP-04C passes", () => expectPass(report, "SEO-SITEMAP-04C", SITEMAP));
  it("SEO-SITEMAP-05 reports nothing and SEO-SITEMAP-08 passes", () => {
    expect(findingsOf(report, "SEO-SITEMAP-05")).toEqual([]);
    expect(findingsOf(report, "SEO-SITEMAP-08", "pass").map((f) => f.unit)).toEqual(["site"]);
    expect(conditionsOf(report, "SEO-SITEMAP-08")).toEqual([]);
  });
});

describe("SEO-SITEMAP-07 · declared sitemaps can be retrieved and read", () => {
  it("fails not_ok when the declared sitemap returns 404", async () => {
    const site = baselineSite();
    site.responses[SITEMAP] = text("Not found", "text/html", 404);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-07")).toContain("not_ok");
    expectWellFormedFails(report, "SEO-SITEMAP-07");
    expect(findingsOf(report, "SEO-SITEMAP-07", "fail")[0]!.unit).toBe(SITEMAP);
  });

  it("fails not_well_formed for an XML file with a mismatched end tag", async () => {
    const site = siteWithSitemap(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n<url><loc>${ORIGIN}/</loc></urlset>\n`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-07")).toContain("not_well_formed");
    expectWellFormedFails(report, "SEO-SITEMAP-07");
    expect(findingsOf(report, "SEO-SITEMAP-07", "fail")[0]!.reason).toMatch(/at line \d+, column \d+/);
  });

  it("fails wrong_root for a root element outside the sitemap vocabulary", async () => {
    const site = siteWithSitemap(`<?xml version="1.0" encoding="UTF-8"?>\n<urls xmlns="${NS}">\n<url><loc>${ORIGIN}/</loc></url>\n</urls>\n`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-07")).toContain("wrong_root");
    expectWellFormedFails(report, "SEO-SITEMAP-07");
    expect(findingsOf(report, "SEO-SITEMAP-07", "fail")[0]!.reason).toContain("<urls>");
  });

  it("fails wrong_root for a urlset outside the sitemap namespace", async () => {
    const site = siteWithSitemap(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n<url><loc>${ORIGIN}/</loc></url>\n</urlset>\n`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-07")).toContain("wrong_root");
  });
});

describe("SEO-SITEMAP-01 · protocol limits", () => {
  it("fails too_many_urls for 50,001 entries", async () => {
    const many = Array.from({ length: 50_001 }, () => entry(`${ORIGIN}/`)).join("\n");
    const site = siteWithSitemap(urlset(many));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-01")).toContain("too_many_urls");
    expectWellFormedFails(report, "SEO-SITEMAP-01");
    const fail = findingsOf(report, "SEO-SITEMAP-01", "fail")[0]!;
    expect(fail.observed.count).toBe(50_001);
    expect(fail.reason).toContain("50,001 URLs");
  }, 60_000);

  it("fails too_large for a gzip body whose decompressed size exceeds 52,428,800 bytes", async () => {
    // Compressible padding: 52,428,801 + 1 bytes of spaces inside an XML comment never decompress in full.
    const head = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n<!--`;
    const tail = `-->\n${BASE_ENTRIES.join("\n")}\n</urlset>\n`;
    const padding = Buffer.alloc(52_428_801 - head.length - tail.length + 1, 0x20);
    const body = gzipSync(Buffer.concat([Buffer.from(head), padding, Buffer.from(tail)]));
    const site = baselineSite();
    site.responses[SITEMAP] = { status: 200, headers: { "content-type": "application/x-gzip" }, body: new Uint8Array(body) };
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-01")).toContain("too_large");
    expectWellFormedFails(report, "SEO-SITEMAP-01");
  }, 60_000);

  it("fails index_too_large for a gzip sitemap index whose decompressed size exceeds the limit", async () => {
    const head = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NS}">\n<!--`;
    const tail = `-->\n<sitemap><loc>https://www.example.com/sitemap.xml</loc></sitemap>\n</sitemapindex>\n`;
    const padding = Buffer.alloc(52_428_801 - head.length - tail.length + 1, 0x20);
    const body = gzipSync(Buffer.concat([Buffer.from(head), padding, Buffer.from(tail)]));
    const site = baselineSite();
    site.responses["https://www.example.com/robots.txt"] = text("User-agent: *\nSitemap: https://www.example.com/index.xml.gz\n");
    site.responses["https://www.example.com/index.xml.gz"] = { status: 200, headers: { "content-type": "application/x-gzip" }, body: new Uint8Array(body) };
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-01")).toContain("index_too_large");
    const fail = findingsOf(report, "SEO-SITEMAP-01", "fail").find((f) => f.condition === "index_too_large")!;
    expect(fail.observed.entry_kind).toBe("sitemaps");
    expect(fail.observed.bytes).toBeGreaterThan(52_428_800);
    expectWellFormedFails(report, "SEO-SITEMAP-01");
  }, 60_000);

  it("fails index_too_many for a sitemap index with 50,001 children", async () => {
    // The same child is listed 50,001 times so only one child fetch happens.
    const site = siteDeclaring(`${ORIGIN}/sitemap-index.xml`);
    site.responses[`${ORIGIN}/sitemap-index.xml`] = xml(sitemapindex(Array.from({ length: 50_001 }, () => SITEMAP)));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-01")).toContain("index_too_many");
    expectWellFormedFails(report, "SEO-SITEMAP-01");
    const fail = findingsOf(report, "SEO-SITEMAP-01", "fail").find((f) => f.condition === "index_too_many")!;
    expect(fail.unit).toBe(`${ORIGIN}/sitemap-index.xml`);
    expect(fail.reason).toContain("50,001 sitemaps");
  }, 60_000);
});

describe("SEO-SITEMAP-02 · locs within the sitemap's scope", () => {
  it("fails loc_out_of_scope for a loc on another host", async () => {
    const site = siteWithSitemap(urlset([...BASE_ENTRIES, entry("https://other.example.org/page")].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02")).toContain("loc_out_of_scope");
    expectWellFormedFails(report, "SEO-SITEMAP-02");
    const fail = findingsOf(report, "SEO-SITEMAP-02", "fail")[0]!;
    expect(fail.reason).toContain("https://other.example.org/page");
    expect(fail.reason).toContain(`A sitemap at ${ORIGIN}/ may only`);
  });

  it("fails loc_out_of_scope for a loc above the sitemap's directory (found via an index)", async () => {
    const site = siteDeclaring(`${ORIGIN}/sitemap-index.xml`);
    site.responses[`${ORIGIN}/sitemap-index.xml`] = xml(sitemapindex([`${ORIGIN}/blog/sitemap.xml`]));
    site.responses[`${ORIGIN}/blog/sitemap.xml`] = xml(urlset([entry(`${ORIGIN}/about`), entry(`${ORIGIN}/blog/post`)].join("\n")));
    site.responses[`${ORIGIN}/blog/post`] = page("Post", `<link rel="canonical" href="${ORIGIN}/blog/post">`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02")).toContain("loc_out_of_scope");
    const fail = findingsOf(report, "SEO-SITEMAP-02", "fail")[0]!;
    expect(fail.unit).toBe(`${ORIGIN}/blog/sitemap.xml`);
    expect(fail.reason).toContain(`${ORIGIN}/about`);
    expect(fail.reason).toContain(`${ORIGIN}/blog/`);
  });

  it("accepts a cross-submitted sitemap declared in the loc host's robots.txt", async () => {
    // The baseline robots.txt declares /sitemap.xml, so /about listed there is in scope even from /blog/.
    const site = siteDeclaring(`${ORIGIN}/blog/sitemap.xml`);
    site.responses[`${ORIGIN}/blog/sitemap.xml`] = xml(urlset(BASE_ENTRIES.join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02")).toEqual([]);
  });
});

describe("SEO-SITEMAP-02B · locs are absolute", () => {
  it("fails loc_not_absolute for a path-only loc", async () => {
    const site = siteWithSitemap(urlset([...BASE_ENTRIES, entry("/about")].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02B")).toContain("loc_not_absolute");
    expectWellFormedFails(report, "SEO-SITEMAP-02B");
    expect(findingsOf(report, "SEO-SITEMAP-02B", "fail")[0]!.reason).toContain("“/about”");
  });
});

describe("SEO-SITEMAP-02C · encoding, URL length and index scope", () => {
  it("fails not_utf8 for a file with an invalid byte", async () => {
    const before = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n<!-- `);
    const after = new TextEncoder().encode(` -->\n${BASE_ENTRIES.join("\n")}\n</urlset>\n`);
    const bytes = new Uint8Array(before.length + 1 + after.length);
    bytes.set(before, 0);
    bytes[before.length] = 0xff;
    bytes.set(after, before.length + 1);
    const site = baselineSite();
    site.responses[SITEMAP] = { status: 200, headers: { "content-type": "application/xml" }, body: bytes };
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02C")).toContain("not_utf8");
    expectWellFormedFails(report, "SEO-SITEMAP-02C");
    expect(findingsOf(report, "SEO-SITEMAP-02C", "fail")[0]!.reason).toContain("first invalid byte at line 3");
  });

  it("fails loc_too_long for a loc of 2,048 characters or more", async () => {
    const long = `${ORIGIN}/` + "a".repeat(2048 - ORIGIN.length - 1);
    expect([...long].length).toBe(2048);
    const site = siteWithSitemap(urlset([...BASE_ENTRIES, entry(long)].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02C")).toContain("loc_too_long");
    expectWellFormedFails(report, "SEO-SITEMAP-02C");
    expect(findingsOf(report, "SEO-SITEMAP-02C", "fail")[0]!.reason).toContain("1 URLs in");
  });

  it("fails index_child_out_of_scope for an index listing a sitemap on another host", async () => {
    const site = siteDeclaring(`${ORIGIN}/sitemap-index.xml`);
    site.responses[`${ORIGIN}/sitemap-index.xml`] = xml(sitemapindex([SITEMAP, "https://other.example.org/sitemap.xml"]));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-02C")).toContain("index_child_out_of_scope");
    expectWellFormedFails(report, "SEO-SITEMAP-02C");
    const fail = findingsOf(report, "SEO-SITEMAP-02C", "fail")[0]!;
    expect(fail.unit).toBe(`${ORIGIN}/sitemap-index.xml`);
    expect(fail.reason).toContain("https://other.example.org/sitemap.xml");
  });
});

describe("SEO-SITEMAP-03 · sitemaps list canonical, non-redirecting URLs", () => {
  it("fails redirects for a loc that 301s", async () => {
    const site = siteWithSitemap(urlset([...BASE_ENTRIES, entry(`${ORIGIN}/old-about`)].join("\n")));
    site.responses[`${ORIGIN}/old-about`] = redirect(`${ORIGIN}/about`, 301);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-03")).toContain("redirects");
    expectWellFormedFails(report, "SEO-SITEMAP-03");
    const fail = findingsOf(report, "SEO-SITEMAP-03", "fail")[0]!;
    expect(fail.unit).toBe(`${ORIGIN}/old-about`);
    expect(fail.reason).toContain(`redirects to ${ORIGIN}/about`);
  });

  it("fails not_self_canonical for a loc whose page names another canonical", async () => {
    const site = siteWithSitemap(urlset([...BASE_ENTRIES, entry(`${ORIGIN}/dup`)].join("\n")));
    site.responses[`${ORIGIN}/dup`] = page("Dup", `<link rel="canonical" href="${ORIGIN}/about">`);
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-03")).toContain("not_self_canonical");
    expectWellFormedFails(report, "SEO-SITEMAP-03");
    const fail = findingsOf(report, "SEO-SITEMAP-03", "fail")[0]!;
    expect(fail.unit).toBe(`${ORIGIN}/dup`);
    expect(fail.reason).toContain(`declares ${ORIGIN}/about as canonical`);
  });
});

describe("SEO-SITEMAP-04A · lastmod uses W3C Datetime", () => {
  it("fails invalid_lastmod for a non-W3C value", async () => {
    const site = siteWithSitemap(urlset([entry(`${ORIGIN}/`, "2026-09-01T10:00:00+00:00"), entry(`${ORIGIN}/about`, "September 2, 2026"), entry(`${ORIGIN}/contact`, "2026-09-03 10:00:00")].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-04A")).toContain("invalid_lastmod");
    expectWellFormedFails(report, "SEO-SITEMAP-04A");
    const fail = findingsOf(report, "SEO-SITEMAP-04A", "fail")[0]!;
    expect(fail.observed.n).toBe(2);
    expect(fail.reason).toContain("“2026-09-03 10:00:00”");
  });

  it("accepts every W3C Datetime form", async () => {
    const forms = ["2026", "2026-09", "2026-09-01", "2026-09-01T10:00Z", "2026-09-01T10:00:00+02:00", "2026-09-01T10:00:00.5-05:00"];
    const entries = [`${ORIGIN}/`, `${ORIGIN}/about`, `${ORIGIN}/contact`].map((loc, i) => entry(loc, forms[i])).concat(forms.slice(3).map((f, i) => entry(`${ORIGIN}/p${i}`, f)));
    const site = siteWithSitemap(urlset(entries.join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-04A")).toEqual([]);
  });
});

describe("SEO-SITEMAP-04B · lastmod is not in the future", () => {
  it("fails future_lastmod for a value after the scan time", async () => {
    const site = siteWithSitemap(urlset([entry(`${ORIGIN}/`, "2026-09-01T10:00:00+00:00"), entry(`${ORIGIN}/about`, "2027-01-01T00:00:00Z"), entry(`${ORIGIN}/contact`, "2026-09-03T10:00:00+00:00")].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-04B")).toContain("future_lastmod");
    expectWellFormedFails(report, "SEO-SITEMAP-04B");
    expect(findingsOf(report, "SEO-SITEMAP-04B", "fail")[0]!.reason).toContain("2027-01-01T00:00:00Z");
  });

  it("does not treat the scan date itself as future (UTC+14 rule)", async () => {
    // 2026-10-03 as a date starts at 2026-10-02T10:00Z in UTC+14, before the fixed scan time 2026-10-03T12:00Z.
    const site = siteWithSitemap(urlset([entry(`${ORIGIN}/`, "2026-10-03"), entry(`${ORIGIN}/about`, "2026-10-03T11:59:00Z"), entry(`${ORIGIN}/contact`)].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-04B")).toEqual([]);
  });
});

describe("SEO-SITEMAP-04C · lastmod includes a time for Bing", () => {
  it("fails date_only_lastmod for a date without a time", async () => {
    const site = siteWithSitemap(urlset([entry(`${ORIGIN}/`, "2026-09-01"), entry(`${ORIGIN}/about`, "2026-09-02T10:00:00+00:00"), entry(`${ORIGIN}/contact`)].join("\n")));
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-04C")).toContain("date_only_lastmod");
    expectWellFormedFails(report, "SEO-SITEMAP-04C");
    expect(findingsOf(report, "SEO-SITEMAP-04C", "fail")[0]!.reason).toContain("1 lastmod values");
  });

  it("is not evaluated when Bing is not a selected engine", async () => {
    const site = siteWithSitemap(urlset([entry(`${ORIGIN}/`, "2026-09-01"), entry(`${ORIGIN}/about`), entry(`${ORIGIN}/contact`)].join("\n")));
    const { report } = await reportOf(site, { ...START, engines: ["google"] });
    expect(conditionsOf(report, "SEO-SITEMAP-04C")).toEqual([]);
  });
});

describe("SEO-SITEMAP-05 · priority and changefreq (info)", () => {
  it("reports present when a file uses them", async () => {
    const site = siteWithSitemap(urlset([entry(`${ORIGIN}/`, undefined, "<priority>1.0</priority><changefreq>daily</changefreq>"), entry(`${ORIGIN}/about`), entry(`${ORIGIN}/contact`)].join("\n")));
    const { report } = await reportOf(site, START);
    const infos = findingsOf(report, "SEO-SITEMAP-05", "info");
    expect(infos.map((f) => f.condition)).toEqual(["present"]);
    expect(infos[0]!.unit).toBe(SITEMAP);
    expect(conditionsOf(report, "SEO-SITEMAP-05")).toEqual([]);
  });
});

describe("SEO-SITEMAP-08 · a sitemap is published (opportunity)", () => {
  it("reports none_found as an opportunity without a robots Sitemap line and without /sitemap.xml", async () => {
    const site = siteDeclaring();
    delete site.responses[SITEMAP];
    const { report } = await reportOf(site, START);
    expect(conditionsOf(report, "SEO-SITEMAP-08")).toEqual(["none_found"]);
    expect(findingsOf(report, "SEO-SITEMAP-08", "fail")).toEqual([]);
    const found = findingsOf(report, "SEO-SITEMAP-08", "opportunity");
    expect(found.map((f) => f.unit)).toEqual(["site"]);
    expect(found[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(found[0]!.citations.some((c) => c.source_id === "B-SITEMAP-2025")).toBe(true);
    expect(report.meta.intent_inferred).toBe(true);
    // The site-scoped unit counts as unmet: 4 × 0/1 in the sitemaps category.
    const score = report.categories.find((c) => c.key === "sitemaps")!.rules.find((r) => r.rule_id === "SEO-SITEMAP-08")!;
    expect(score).toMatchObject({ units: 1, passed: 0, weight: 4, contribution: "0" });
    expect(report.recommendations.find((r) => r.rule_id === "SEO-SITEMAP-08")!.kind).toBe("add");
  });

  it("is not applicable when Bing is not a selected engine", async () => {
    const site = siteDeclaring();
    delete site.responses[SITEMAP];
    const { report } = await reportOf(site, { ...START, engines: ["google"] });
    expect(findingsOf(report, "SEO-SITEMAP-08").map((f) => f.status)).toEqual(["not_applicable"]);
  });

  it("finds /sitemap.xml by convention when robots.txt does not declare it", async () => {
    const site = siteDeclaring();
    const { report } = await reportOf(site, START);
    expect(findingsOf(report, "SEO-SITEMAP-08", "pass").length).toBe(1);
    expectPass(report, "SEO-SITEMAP-07", SITEMAP);
  });
});
