import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/scanner/evaluate/index.js";
import { base64Encode } from "../../src/scanner/snapshot/access.js";
import { sha256Hex } from "../../src/scanner/snapshot/sha256.js";
import type { Exchange, Snapshot } from "../../src/scanner/snapshot/types.js";
import { baselineSite, conditionsOf, findingsOf, html, snapshotOf } from "../../src/testing/index.js";

const HOME = "https://www.example.com/";

function addBody(snapshot: Snapshot, body: string): { sha: string; bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(body);
  const sha = sha256Hex(bytes);
  snapshot.bodies[sha] = base64Encode(bytes);
  return { sha, bytes };
}

function addParity(snapshot: Snapshot, url: string, mobile: string, desktop: string): void {
  const base = snapshot.exchanges.find((e) => e.request.url === url && (e.purpose === "crawl" || e.purpose === "start"))!;
  let seq = snapshot.exchanges.length;
  for (const [purpose, body] of [["parity_mobile", mobile], ["parity_desktop", desktop]] as const) {
    const { sha, bytes } = addBody(snapshot, body);
    const exchange: Exchange = { ...base, seq: (seq += 1), phase: 10, purpose, body_sha256: sha, size_uncompressed: bytes.length, request: { ...base.request, headers: [...base.request.headers] } };
    snapshot.exchanges.push(exchange);
  }
}

describe("SEO-PERF-01 (requires: crux)", () => {
  it("is not evaluated without CrUX data and judges stored field data otherwise", async () => {
    const { snapshot, config } = await snapshotOf(baselineSite(), { start_url: HOME });
    const off = evaluate(snapshot, { ...config, crux: true });
    expect(findingsOf(off, "SEO-PERF-01").map((f) => f.status)).toEqual(["not_evaluated"]);
    snapshot.crux = {
      "origin|PHONE": { scope: "origin", target: "https://www.example.com", form_factor: "PHONE", first_date: "2026-08-30", last_date: "2026-09-26", lcp_p75_ms: 3100, inp_p75_ms: 250, cls_p75_thousandths: 150 },
      "url|DESKTOP": { scope: "url", target: `${HOME}about`, form_factor: "DESKTOP", first_date: "2026-08-30", last_date: "2026-09-26", lcp_p75_ms: 1200, inp_p75_ms: 100, cls_p75_thousandths: 50 },
    };
    const on = evaluate(snapshot, { ...config, crux: true });
    expect(conditionsOf(on, "SEO-PERF-01")).toEqual(["cls_over", "inp_over", "lcp_over"]);
    const lcp = findingsOf(on, "SEO-PERF-01", "fail").find((f) => f.condition === "lcp_over")!;
    expect(lcp.reason).toContain("3,100 ms");
    expect(lcp.reason).toContain("Bing lists page load time");
    expect(lcp.citations.some((c) => c.source_id === "MS-BING-RANK")).toBe(true);
    const cls = findingsOf(on, "SEO-PERF-01", "fail").find((f) => f.condition === "cls_over")!;
    expect(cls.reason).toContain("0.150");
    expect(findingsOf(on, "SEO-PERF-01", "pass")).toHaveLength(1);
    expect(on.headline.statements.some((s) => s.key === "cwv_scope")).toBe(true);
    expect(off.headline.statements.some((s) => s.key === "cwv_scope")).toBe(false);
    const googleOnly = evaluate(snapshot, { ...config, crux: true, engines: ["google"] });
    const lcpGoogle = findingsOf(googleOnly, "SEO-PERF-01", "fail").find((f) => f.condition === "lcp_over")!;
    expect(lcpGoogle.reason).not.toContain("Bing");
    expect(lcpGoogle.citations.some((c) => c.source_id === "MS-BING-RANK")).toBe(false);
  });
});

describe("SEO-PERF-03 (requires: parity)", () => {
  it("compares mobile and desktop fetches", async () => {
    const { snapshot, config } = await snapshotOf(baselineSite(), { start_url: HOME });
    expect(findingsOf(evaluate(snapshot, { ...config, parity_check: true }), "SEO-PERF-03").every((f) => f.status === "not_evaluated")).toBe(true);
    addParity(snapshot, HOME, html(`<title>Mobile title</title><link rel="canonical" href="${HOME}">`), html(`<title>Desktop title</title><link rel="canonical" href="${HOME}other"><meta name="robots" content="noindex"><script type="application/ld+json">{"@type":"WebSite","name":"x"}</script>`));
    addParity(snapshot, `${HOME}about`, html(`<title>Same</title>`), html(`<title>Same</title>`));
    const report = evaluate(snapshot, { ...config, parity_check: true });
    expect(conditionsOf(report, "SEO-PERF-03")).toEqual(["canonical_differs", "robots_differs", "structured_data_differs", "title_differs"]);
    expect(findingsOf(report, "SEO-PERF-03", "pass").map((f) => f.unit)).toEqual([`${HOME}about`]);
    for (const f of findingsOf(report, "SEO-PERF-03", "fail")) {
      expect(f.reason).not.toMatch(/\{[a-z_]+\}/);
      expect(f.citations.length).toBeGreaterThan(0);
    }
  });
});

describe("SEO-JS-01 and SEO-JS-04 (requires: rendered)", () => {
  it("compares raw and rendered canonicals and reports render-only content", async () => {
    const { snapshot, config } = await snapshotOf(baselineSite(), { start_url: HOME });
    snapshot.rendered = {
      [HOME]: html(`<title>Example Home</title><link rel="canonical" href="${HOME}changed">`, `<h1>Example</h1><p>Rendered words appear here now.</p><a href="/about">About</a><a href="/new-after-render">New</a>`),
      [`${HOME}about`]: html(`<title>About</title>`, `<a href="/">Home</a>`),
    };
    const report = evaluate(snapshot, { ...config, render: true });
    expect(conditionsOf(report, "SEO-JS-01")).toEqual(["canonical_changed_by_js"]);
    const added = findingsOf(report, "SEO-JS-01", "fail")[0]!;
    expect(added.reason).toContain(`from ${HOME} to ${HOME}changed`);
    expect(findingsOf(report, "SEO-JS-01", "pass").map((f) => f.unit)).toEqual([`${HOME}about`]);
    const info = findingsOf(report, "SEO-JS-04", "info");
    expect(info.some((f) => f.unit === HOME && (f.reason ?? "").includes("new-after-render"))).toBe(true);
    // canonical_added_by_js: a page without a raw canonical gains one after rendering.
    const site = baselineSite();
    site.responses[`${HOME}about`] = html(`<title>About Example</title><meta name="description" content="About.">`, `<a href="/">Home page</a>`);
    const second = await snapshotOf(site, { start_url: HOME });
    second.snapshot.rendered = { [`${HOME}about`]: html(`<title>About Example</title><link rel="canonical" href="${HOME}about">`) };
    expect(conditionsOf(evaluate(second.snapshot, { ...second.config, render: true }), "SEO-JS-01")).toEqual(["canonical_added_by_js"]);
  });
});
