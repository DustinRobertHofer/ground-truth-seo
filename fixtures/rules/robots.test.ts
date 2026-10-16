import { describe, expect, it } from "vitest";
import type { Report } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, page, reportOf, text, type FakeResponse } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/`, max_pages: 20 };
const SITEMAP_LINE = `Sitemap: ${ORIGIN}/sitemap.xml`;

function robots(body: string): FakeResponse {
  return text(body);
}

function bytesOf(...parts: (string | number[])[]): Uint8Array {
  const chunks = parts.map((p) => (typeof p === "string" ? new TextEncoder().encode(p) : Uint8Array.from(p)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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

function expectInfo(report: Report, id: string, code: string) {
  const infos = findingsOf(report, id, "info").filter((f) => f.condition === code);
  expect(infos.length).toBeGreaterThan(0);
  expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
  expect(infos[0]!.citations.length).toBeGreaterThan(0);
}

describe("SEO-ROBOTS-02 robots.txt is UTF-8", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-ROBOTS-02");
  });

  it("fails invalid_utf8 for a body with a stray 0xff byte", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = { status: 200, headers: { "content-type": "text/plain" }, body: bytesOf("User-agent: *\nDisallow: /caf", [0xff], "e/\n", SITEMAP_LINE, "\n") };
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-02", "invalid_utf8");
    expect(findingsOf(report, "SEO-ROBOTS-02", "fail")[0]!.observed.line).toBe(2);
  });
});

describe("SEO-ROBOTS-03 robots.txt under 500 KiB", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-ROBOTS-03");
  });

  it("fails over_limit for a body over 512,000 bytes", async () => {
    const site = baselineSite();
    const rule = `Disallow: /private/${"a".repeat(200)}/\n`;
    const body = `User-agent: *\n${SITEMAP_LINE}\n${rule.repeat(Math.ceil(520_000 / rule.length))}`;
    expect(body.length).toBeGreaterThan(512_000);
    site.responses[`${ORIGIN}/robots.txt`] = robots(body);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-03", "over_limit");
    const finding = findingsOf(report, "SEO-ROBOTS-03", "fail")[0]!;
    expect(Number(finding.observed.n)).toBeGreaterThan(0);
  });
});

describe("SEO-ROBOTS-04 robots.txt is reachable", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-ROBOTS-04");
  });

  it("fails server_error for a 503 robots.txt", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text("Service unavailable", "text/plain", 503);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-04", "server_error");
    expect(conditionsOf(report, "SEO-ROBOTS-04")).toEqual(["server_error"]);
  });

  it("fails unreachable for a robots.txt that times out", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = { outcome: "timeout" };
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-04", "unreachable");
    expect(conditionsOf(report, "SEO-ROBOTS-04")).toEqual(["unreachable"]);
  });
});

describe("SEO-ROBOTS-05A search crawlers may fetch every intended URL", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-ROBOTS-05A");
  });

  it("fails disallowed_googlebot for a Googlebot group that blocks an intended URL", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = robots(`User-agent: *\nDisallow: /private/\n\nUser-agent: Googlebot\nDisallow: /contact\n\n${SITEMAP_LINE}\n`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-05A", "disallowed_googlebot");
    expect(conditionsOf(report, "SEO-ROBOTS-05A")).toEqual(["disallowed_googlebot"]);
    expect(findingsOf(report, "SEO-ROBOTS-05A", "fail").map((f) => f.unit)).toEqual([`${ORIGIN}/contact`]);
  });

  it("fails disallowed_bingbot for a bingbot group that blocks an intended URL", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = robots(`User-agent: *\nDisallow: /private/\n\nUser-agent: bingbot\nDisallow: /contact\n\n${SITEMAP_LINE}\n`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-05A", "disallowed_bingbot");
    expect(conditionsOf(report, "SEO-ROBOTS-05A")).toEqual(["disallowed_bingbot"]);
  });
});

describe("SEO-ROBOTS-05B rendering resources are crawlable", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-ROBOTS-05B");
  });

  it("fails resources_disallowed when an image on the page is disallowed", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = robots(`User-agent: *\nDisallow: /private/\nDisallow: /photo.png\n${SITEMAP_LINE}\n`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-05B", "resources_disallowed");
    expect(findingsOf(report, "SEO-ROBOTS-05B", "fail").map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
  });
});

describe("SEO-ROBOTS-08 Sitemap lines are fully qualified", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectPass(report, "SEO-ROBOTS-08");
  });

  it("fails not_fully_qualified for a relative Sitemap line", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = robots(`User-agent: *\nDisallow: /private/\nSitemap: /sitemap.xml\n`);
    const { report } = await reportOf(site, START);
    expectFail(report, "SEO-ROBOTS-08", "not_fully_qualified");
    expect(findingsOf(report, "SEO-ROBOTS-08", "fail")[0]!.observed.line).toBe(3);
  });
});

describe("SEO-ROBOTS-09 staging hosts require authentication", () => {
  const hosts = { "www.example.com": {}, "example.com": {}, "staging.example.com": {} };

  it("passes when the staging host answers 401", async () => {
    const site = baselineSite();
    site.hosts = hosts;
    site.responses["https://staging.example.com/"] = text("<html><body>Login</body></html>", "text/html", 401);
    const { report } = await reportOf(site, { ...START, staging_hosts: ["staging.example.com"] });
    expectPass(report, "SEO-ROBOTS-09");
  });

  it("fails staging_public when the staging host serves 200 without noindex", async () => {
    const site = baselineSite();
    site.hosts = hosts;
    site.responses["https://staging.example.com/"] = page("Staging home");
    const { report } = await reportOf(site, { ...START, staging_hosts: ["staging.example.com"] });
    expectFail(report, "SEO-ROBOTS-09", "staging_public");
    expect(findingsOf(report, "SEO-ROBOTS-09", "fail")[0]!.unit).toBe("staging.example.com");
  });
});

describe("robots.txt info rules", () => {
  it("SEO-ROBOTS-01 summarizes each origin's robots.txt on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expectInfo(report, "SEO-ROBOTS-01", "summary");
    expect(findingsOf(report, "SEO-ROBOTS-01", "info").map((f) => f.unit)).toContain(ORIGIN);
  });

  it("SEO-ROBOTS-10 lists lines Google ignores", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = robots(`Disallow: /early\nUser-agent: *\nCrawl-delay: 10\nDisallow: private/\nthis line has no colon\n${SITEMAP_LINE}\n`);
    const { report } = await reportOf(site, START);
    expectInfo(report, "SEO-ROBOTS-10", "ignored_lines");
    expect(findingsOf(report, "SEO-ROBOTS-10", "info")[0]!.observed.n).toBe(4);
  });

  it("SEO-ROBOTS-07 reports * rules shadowed by a Googlebot group", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = robots(`User-agent: *\nDisallow: /private/\n\nUser-agent: Googlebot\nDisallow: /drafts/\n\n${SITEMAP_LINE}\n`);
    const { report } = await reportOf(site, START);
    expectInfo(report, "SEO-ROBOTS-07", "shadowed_rules");
    expect(findingsOf(report, "SEO-ROBOTS-07", "info")[0]!.observed.crawler).toBe("Googlebot");
  });

  it("SEO-ROBOTS-10 and SEO-ROBOTS-07 are silent on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(findingsOf(report, "SEO-ROBOTS-10", "info")).toEqual([]);
    expect(findingsOf(report, "SEO-ROBOTS-07", "info")).toEqual([]);
  });
});
