import { describe, expect, it } from "vitest";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, redirect, reportOf, text, xml, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/`, max_pages: 20 };

/** The baseline sitemap plus extra intended paths. */
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

describe("SEO-HTTP-01 intended URLs return 200", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-HTTP-01");
  });

  it("fails client_error for an intended 404", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/gone");
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-01", "client_error");
    expect(conditionsOf(report, "SEO-HTTP-01")).toEqual(["client_error"]);
  });

  it("fails server_error for an intended 500", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/broken");
    site.responses[`${ORIGIN}/broken`] = text("<html><body>Error</body></html>", "text/html", 500);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-01", "server_error");
    expect(conditionsOf(report, "SEO-HTTP-01")).toEqual(["server_error"]);
  });

  it("fails no_response for an intended URL that times out", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/slow");
    site.responses[`${ORIGIN}/slow`] = { outcome: "timeout" };
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-01", "no_response");
    expect(conditionsOf(report, "SEO-HTTP-01")).toEqual(["no_response"]);
  });

  it("fails unresolved_redirect for a redirect loop", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/loop-a");
    site.responses[`${ORIGIN}/loop-a`] = redirect(`${ORIGIN}/loop-b`);
    site.responses[`${ORIGIN}/loop-b`] = redirect(`${ORIGIN}/loop-a`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-01", "unresolved_redirect");
    expect(conditionsOf(report, "SEO-HTTP-01")).toEqual(["unresolved_redirect"]);
  });
});

describe("SEO-HTTP-02 intended URLs are publicly accessible", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-HTTP-02");
  });

  it("fails auth_required for an intended 401", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/members");
    site.responses[`${ORIGIN}/members`] = text("<html><body>Login required</body></html>", "text/html", 401);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-02", "auth_required");
    expect(conditionsOf(report, "SEO-HTTP-02")).toEqual(["auth_required"]);
  });
});

describe("SEO-HTTP-03 missing URLs return 404", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-HTTP-03");
  });

  it("fails probe_200 when unknown URLs answer 200", async () => {
    const site = baselineSite();
    site.fallbackStatus = 200;
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-03", "probe_200");
    expect(conditionsOf(report, "SEO-HTTP-03")).toEqual(["probe_200"]);
  });

  it("fails probe_other when unknown URLs answer 503", async () => {
    const site = baselineSite();
    site.fallbackStatus = 503;
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-03", "probe_other");
    expect(conditionsOf(report, "SEO-HTTP-03")).toEqual(["probe_other"]);
  });
});

describe("SEO-HTTP-07 HTTPS without certificate errors or downgrades", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-HTTP-07");
  });

  it("fails preferred_origin_http when the site is served over HTTP", async () => {
    const httpOrigin = "http://www.example.com";
    const site: FakeSite = baselineSite(httpOrigin);
    // baselineSite() appends variant redirects that overwrite the http origin's own pages; restore them.
    const https = baselineSite();
    for (const path of ["/", "/about", "/robots.txt"]) {
      const source = https.responses[`${ORIGIN}${path}`] as { status?: number; headers?: Record<string, string>; body?: string | Uint8Array };
      site.responses[`${httpOrigin}${path}`] = { ...source, body: (source.body as string).replaceAll(ORIGIN, httpOrigin) };
    }
    const { report } = await reportOf(site, { start_url: `${httpOrigin}/`, max_pages: 20 });
    expectFail(report, "SEO-HTTP-07", "preferred_origin_http");
  });

  it("fails certificate_invalid for a variant origin with a bad certificate", async () => {
    const site = baselineSite();
    site.tls = { "https://example.com": { valid: false, error: "expired", not_before: null, not_after: null, subject: null, issuer: null } };
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-07", "certificate_invalid");
    expect(conditionsOf(report, "SEO-HTTP-07")).toEqual(["certificate_invalid"]);
  });

  it("fails https_to_http_redirect for a hop from HTTPS to HTTP", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/legacy");
    site.responses[`${ORIGIN}/legacy`] = redirect("http://www.example.com/legacy");
    site.responses["http://www.example.com/legacy"] = redirect(`${ORIGIN}/about`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-07", "https_to_http_redirect");
    expect(conditionsOf(report, "SEO-HTTP-07")).toEqual(["https_to_http_redirect"]);
  });
});

describe("SEO-HTTP-09 HTML within Googlebot's 2 MB limit", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-HTTP-09");
  });

  it("fails over_limit for a page larger than 2,097,152 bytes", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/huge");
    site.responses[`${ORIGIN}/huge`] = page("Huge page", `<link rel="canonical" href="${ORIGIN}/huge">`, `<h1>Huge</h1><p>${"x".repeat(2_100_000)}</p>`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-HTTP-09", "over_limit");
    const finding = findingsOf(report, "SEO-HTTP-09", "fail")[0]!;
    expect(finding.unit).toBe(`${ORIGIN}/huge`);
    expect(Number(finding.observed.bytes)).toBeGreaterThan(2_097_152);
  });
});

describe("SEO-HTTP-05 server errors observed (info)", () => {
  it("reports server_errors when an in-scope fetch returns 5xx", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/sitemap.xml`] = sitemapWith("/broken");
    site.responses[`${ORIGIN}/broken`] = text("<html><body>Error</body></html>", "text/html", 500);
    const { report } = await reportOf(site, START);
    const infos = findingsOf(report, "SEO-HTTP-05", "info");
    expect(infos.length).toBe(1);
    expect(infos[0]!.condition).toBe("server_errors");
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(infos[0]!.citations.length).toBeGreaterThan(0);
  });

  it("is silent on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(findingsOf(report, "SEO-HTTP-05", "info")).toEqual([]);
  });
});
