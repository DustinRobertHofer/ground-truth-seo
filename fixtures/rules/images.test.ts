import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/scanner/report/types.js";
import { baselineSite, conditionsOf, findingsOf, image, page, png, reportOf, type FakeSite } from "../../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/` };

function site(extra: FakeSite["responses"]): FakeSite {
  const base = baselineSite(ORIGIN);
  return { ...base, responses: { ...base.responses, ...extra } };
}

const HOME_HEAD = `<link rel="canonical" href="${ORIGIN}/"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"${ORIGIN}/"}</script>`;
const HOME_BODY = `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <img src="/photo.png" alt="Office" width="100" height="100">`;

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

/** A 4-byte ICO header: `00 00 01 00`, no directory entries. */
const ICO_HEADER = new Uint8Array([0x00, 0x00, 0x01, 0x00]);

describe("SEO-IMG-01 images have a src fallback", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-IMG-01")).toEqual([]);
    expect(findingsOf(report, "SEO-IMG-01", "pass").length).toBe(3);
  });

  it("fails missing_src for an <img> that only has data-src", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<img data-src="/lazy.png" alt="Lazy office" width="10" height="10">`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-IMG-01")).toEqual(["missing_src"]);
    const fails = findingsOf(report, "SEO-IMG-01", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.observed.n).toBe(1);
    expect(fails[0]!.reason).toContain("data-src");
  });

  // Known bug, pinned: KNOWLEDGE.md §4.9 excludes descendants of <template>, but parse5 keeps
  // template children under `template.content` (a DocumentFragment without a parentNode), so
  // `hasAncestorTag(img, {"template"})` in lib/scanner/evaluate/core/html.ts never finds the
  // template and `PageImage.inTemplate` is always false. Flip to `it` once core/html.ts is fixed.
  it("ignores <img> elements inside <template>", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<template><img data-src="/lazy.png"></template>`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-IMG-01")).toEqual([]);
  });
});

describe("SEO-IMG-02 images carry an alt attribute", () => {
  it("passes on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-IMG-02")).toEqual([]);
    expect(findingsOf(report, "SEO-IMG-02", "pass").length).toBe(3);
  });

  it("fails missing_alt for an <img> without alt", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<img src="/photo.png" width="100" height="100">`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-IMG-02")).toEqual(["missing_alt"]);
    const fails = findingsOf(report, "SEO-IMG-02", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("/photo.png");
  });

  it("accepts an empty alt as decorative", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<img src="/photo.png" alt="" width="100" height="100">`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-IMG-02")).toEqual([]);
  });
});

describe("SEO-IMG-04 lazy-loaded images declare dimensions", () => {
  it("passes on the baseline and for a lazy image with dimensions", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(conditionsOf(report, "SEO-IMG-04")).toEqual([]);
    expect(findingsOf(report, "SEO-IMG-04", "pass").length).toBe(3);
    const s = site({ [`${ORIGIN}/`]: home(`<img src="/photo.png" alt="Office" loading="LAZY" width="100" height="100">`) });
    const lazy = await reportOf(s, START);
    expect(conditionsOf(lazy.report, "SEO-IMG-04")).toEqual([]);
    expect(findingsOf(lazy.report, "SEO-IMG-04", "pass").find((f) => f.unit === `${ORIGIN}/`)!.observed.lazy).toBe(1);
  });

  it("fails lazy_without_dimensions for a lazy image missing height", async () => {
    const s = site({ [`${ORIGIN}/`]: home(`<img src="/photo.png" alt="Office" loading="lazy" width="100">`) });
    const { report } = await reportOf(s, START);
    expect(conditionsOf(report, "SEO-IMG-04")).toEqual(["lazy_without_dimensions"]);
    const fails = findingsOf(report, "SEO-IMG-04", "fail");
    expect(fails.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expectWellFormedFails(fails);
    expect(fails[0]!.reason).toContain("/photo.png");
  });
});

describe("SEO-IMG-03 image formats Google Images supports (info)", () => {
  it("reports nothing on the baseline", async () => {
    const { report } = await reportOf(baselineSite(), START);
    expect(findingsOf(report, "SEO-IMG-03")).toEqual([]);
  });

  it("reports unsupported_format for an ICO served from an img src", async () => {
    const s = site({
      [`${ORIGIN}/`]: home(`<img src="/badge.ico" alt="Badge" width="16" height="16">`),
      [`${ORIGIN}/badge.ico`]: image(ICO_HEADER, "image/vnd.microsoft.icon"),
    });
    const { report } = await reportOf(s, START);
    const infos = findingsOf(report, "SEO-IMG-03", "info");
    expect(infos.map((f) => f.unit)).toEqual([`${ORIGIN}/`]);
    expect(infos[0]!.condition).toBe("unsupported_format");
    expect(infos[0]!.observed.format).toBe("ICO");
    expect(infos[0]!.observed.src).toBe(`${ORIGIN}/badge.ico`);
    expect(infos[0]!.reason).not.toMatch(/\{[a-z][a-z0-9_]*\}/);
    expect(infos[0]!.citations.length).toBeGreaterThan(0);
    expect(conditionsOf(report, "SEO-IMG-03")).toEqual([]);
  });

  it("sniffs bytes, not Content-Type: a PNG body labelled image/x-icon is supported", async () => {
    const s = site({
      [`${ORIGIN}/`]: home(`<img src="/badge.ico" alt="Badge" width="16" height="16">`),
      [`${ORIGIN}/badge.ico`]: image(png(16, 16), "image/x-icon"),
    });
    const { report } = await reportOf(s, START);
    expect(findingsOf(report, "SEO-IMG-03")).toEqual([]);
  });
});
