import { describe, expect, it } from "vitest";
import type { AcquirePhase } from "../src/scanner/acquire/crawl.js";
import { baselineSite, page, snapshotOf } from "../src/testing/index.js";

const ORIGIN = "https://www.example.com";
const ALL: AcquirePhase[] = ["variants", "probe_404", "sitemaps", "crawl", "sitemap_urls", "targets", "resources", "llms", "conditional", "dns"];

function purposes(snapshot: Awaited<ReturnType<typeof snapshotOf>>["snapshot"]): string[] {
  return [...new Set(snapshot.exchanges.map((e) => e.purpose))].sort();
}

describe("focused acquisition (PRODUCT.md §19)", () => {
  it("produces the same snapshot as a full acquisition when every phase is listed", async () => {
    const input = { start_url: `${ORIGIN}/`, max_pages: 20 };
    const full = await snapshotOf(baselineSite(), input);
    const focused = await snapshotOf(baselineSite(), input, undefined, { phases: ALL });
    expect(focused.snapshot.snapshot_id).toBe(full.snapshot.snapshot_id);
  });

  it("fetches only robots.txt, the start URL and llms.txt for an llms.txt focus", async () => {
    const { snapshot } = await snapshotOf(baselineSite(), { start_url: `${ORIGIN}/` }, undefined, { phases: ["llms"] });
    expect(purposes(snapshot)).toEqual(["llms", "robots", "start"]);
    expect(snapshot.variant_origins).toEqual([]);
    expect(snapshot.sitemaps).toEqual([]);
    expect(snapshot.crawl).toEqual([]);
  });

  it("collects sitemaps without crawling their URLs when sitemap_urls is left out", async () => {
    const { snapshot } = await snapshotOf(baselineSite(), { start_url: `${ORIGIN}/`, max_pages: 1 }, undefined, { phases: ["sitemaps", "crawl"] });
    expect(snapshot.sitemaps.map((s) => s.url)).toEqual([`${ORIGIN}/sitemap.xml`]);
    expect(snapshot.exchanges.some((e) => e.purpose === "sitemap_url")).toBe(false);
    expect(snapshot.crawl.map((c) => c.url)).toEqual([`${ORIGIN}/`]);
  });

  it("crawls a deep start URL at depth 0 when seeded", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/deep/page`] = page("Deep page", `<link rel="canonical" href="${ORIGIN}/deep/page">`);
    const input = { start_url: `${ORIGIN}/deep/page`, max_pages: 5, max_depth: 0 };
    const seeded = await snapshotOf(site, input, undefined, { phases: ["crawl"], seedStartUrl: true });
    expect(seeded.snapshot.crawl).toEqual([
      { url: `${ORIGIN}/`, depth: 0 },
      { url: `${ORIGIN}/deep/page`, depth: 0 },
    ]);
    const unseeded = await snapshotOf(site, input, undefined, { phases: ["crawl"] });
    expect(unseeded.snapshot.crawl).toEqual([{ url: `${ORIGIN}/`, depth: 0 }]);
  });
});
