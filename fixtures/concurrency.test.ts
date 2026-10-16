/**
 * Concurrent acquisition (PRODUCT.md §5.2): requests run several at a time, and
 * that may change only the speed of a scan, never the fetched set, the
 * snapshot or the report. Each run below answers in a different order; every
 * run must produce the same snapshot and report, byte for byte.
 */

import { describe, expect, it } from "vitest";
import { acquire, FETCH_CONCURRENCY } from "../src/scanner/acquire/crawl.js";
import type { FetchRequest, FetchResult, Fetcher } from "../src/scanner/acquire/types.js";
import { resolveConfig } from "../src/scanner/config.js";
import { evaluate, SCANNER_VERSION } from "../src/scanner/evaluate/index.js";
import { sha256Hex } from "../src/scanner/snapshot/sha256.js";
import type { DnsRecord } from "../src/scanner/snapshot/types.js";
import { baselineSite, FIXED_NOW, image, MemoryFetcher, page, png, redirect, xml, type FakeSite } from "../src/testing/index.js";

const ORIGIN = "https://www.example.com";

/**
 * The baseline site grown to exercise every concurrent phase: a wide crawl
 * level, chains that converge on one redirect target, an image shared by many
 * pages, and a sitemap index with children.
 */
function busySite(): FakeSite {
  const site = baselineSite(ORIGIN);
  const r = site.responses;
  const links = Array.from({ length: 12 }, (_, i) => `<a href="/p${i}">Page ${i}</a>`).join(" ");
  r[`${ORIGIN}/`] = page("Example Home", `<link rel="canonical" href="${ORIGIN}/"><link rel="icon" href="/favicon.png">`, `<h1>Example</h1>${links} <a href="/old-a">Old A</a> <a href="/old-b">Old B</a> <img src="/shared.png" alt="Shared">`);
  for (let i = 0; i < 12; i += 1) {
    r[`${ORIGIN}/p${i}`] = page(`Page ${i}`, `<link rel="canonical" href="${ORIGIN}/p${i}">`, `<h1>Page ${i}</h1><a href="/p${(i + 1) % 12}">Next</a> <a href="/deep${i}">Deeper</a> <img src="/shared.png" alt="Shared"> <img src="/img${i}.png" alt="Own">`);
    r[`${ORIGIN}/deep${i}`] = page(`Deep ${i}`, "", `<h1>Deep ${i}</h1><a href="/">Home</a>`);
    r[`${ORIGIN}/img${i}.png`] = image(png(40, 40));
  }
  // Two old URLs whose chains meet at the same hop.
  r[`${ORIGIN}/old-a`] = redirect(`${ORIGIN}/moved`);
  r[`${ORIGIN}/old-b`] = redirect(`${ORIGIN}/moved`);
  r[`${ORIGIN}/moved`] = redirect(`${ORIGIN}/p3`);
  r[`${ORIGIN}/shared.png`] = image(png(64, 64));
  r[`${ORIGIN}/robots.txt`] = { status: 200, headers: { "content-type": "text/plain" }, body: `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap-index.xml\n` };
  r[`${ORIGIN}/sitemap-index.xml`] = xml(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>${ORIGIN}/sm-1.xml</loc></sitemap>\n<sitemap><loc>${ORIGIN}/sm-2.xml</loc></sitemap>\n<sitemap><loc>${ORIGIN}/sm-3.xml</loc></sitemap>\n</sitemapindex>\n`);
  for (let s = 1; s <= 3; s += 1) {
    const urls = Array.from({ length: 4 }, (_, i) => `<url><loc>${ORIGIN}/listed-${s}-${i}</loc></url>`).join("\n");
    r[`${ORIGIN}/sm-${s}.xml`] = xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    for (let i = 0; i < 4; i += 1) r[`${ORIGIN}/listed-${s}-${i}`] = page(`Listed ${s}-${i}`);
  }
  return site;
}

/**
 * Answers each request after a delay drawn from the URL and a seed, so every
 * seed reorders the responses differently. Tracks the most requests in flight.
 */
class JitterFetcher implements Fetcher {
  private readonly inner: MemoryFetcher;
  inFlight = 0;
  maxInFlight = 0;
  calls = 0;

  constructor(site: FakeSite, private readonly seed: number) {
    this.inner = new MemoryFetcher(site);
  }

  resolve(hostname: string): Promise<DnsRecord> {
    return this.inner.resolve(hostname);
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    this.calls += 1;
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    const delay = Number.parseInt(sha256Hex(`${this.seed}:${request.url}`).slice(0, 4), 16) % 12;
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await this.inner.fetch(request);
    } finally {
      this.inFlight -= 1;
    }
  }
}

async function run(seed: number, maxPages = 40) {
  const config = resolveConfig({ start_url: `${ORIGIN}/`, max_pages: maxPages });
  const fetcher = new JitterFetcher(busySite(), seed);
  const snapshot = await acquire(config, { fetcher, now: () => new Date(FIXED_NOW), scannerVersion: SCANNER_VERSION, caBundleVersion: "fixture" });
  const report = evaluate(snapshot, config);
  return { snapshot: JSON.stringify(snapshot), report: JSON.stringify(report), fetcher, parsed: snapshot };
}

describe("concurrent acquisition", () => {
  it("yields the same snapshot and report whatever order the responses arrive in", async () => {
    const first = await run(1);
    for (const seed of [2, 3, 4, 5]) {
      const other = await run(seed);
      expect(other.snapshot).toBe(first.snapshot);
      expect(other.report).toBe(first.report);
    }
  });

  it("keeps the same result when the page budget truncates the crawl", async () => {
    const first = await run(1, 9);
    expect(first.parsed.truncated).toBe(true);
    for (const seed of [2, 3]) {
      const other = await run(seed, 9);
      expect(other.snapshot).toBe(first.snapshot);
      expect(other.report).toBe(first.report);
    }
  });

  it("runs requests concurrently, never more than the per-origin limit", async () => {
    const { fetcher } = await run(7);
    expect(fetcher.maxInFlight).toBeGreaterThan(1);
    expect(fetcher.maxInFlight).toBeLessThanOrEqual(FETCH_CONCURRENCY);
  });

  it("requests a URL two chains share only once, and robots.txt once per origin", async () => {
    const { parsed } = await run(9);
    const firstAttempts = parsed.exchanges.filter((e) => e.attempt === 1).map((e) => `${e.phase} ${e.request.url}`);
    expect(new Set(firstAttempts).size).toBe(firstAttempts.length);
    expect(parsed.exchanges.filter((e) => e.request.url === `${ORIGIN}/moved` && e.attempt === 1)).toHaveLength(1);
    expect(parsed.exchanges.filter((e) => e.request.url === `${ORIGIN}/shared.png`)).toHaveLength(1);
    expect(parsed.exchanges.filter((e) => e.request.url === `${ORIGIN}/robots.txt`)).toHaveLength(1);
  });
});
