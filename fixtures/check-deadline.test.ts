import { describe, expect, it } from "vitest";
import { acquireForCheck } from "../src/checkers/acquire.js";
import { checkerBySlug } from "../src/checkers/config.js";
import type { FetchRequest, FetchResult, Fetcher } from "../src/scanner/acquire/types.js";
import type { DnsRecord } from "../src/scanner/snapshot/types.js";
import { baselineSite, FIXED_NOW, MemoryFetcher, snapshotOf } from "../src/testing/index.js";

const ORIGIN = "https://www.example.com";

/** The fixture site, answering every request after a delay. */
class SlowFetcher implements Fetcher {
  requests = 0;
  constructor(
    private readonly inner: Fetcher,
    private readonly delayMs: number,
  ) {}
  async fetch(request: FetchRequest): Promise<FetchResult> {
    this.requests += 1;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.inner.fetch(request);
  }
  resolve(hostname: string): Promise<DnsRecord> {
    return this.inner.resolve(hostname);
  }
}

describe("check deadline", () => {
  it("leaves a check that finishes in time untouched", async () => {
    const checker = checkerBySlug("sitemap-checker");
    const timed = await acquireForCheck(checker, `${ORIGIN}/`, { fetcher: new MemoryFetcher(baselineSite()), deadlineMs: 10_000, now: () => new Date(FIXED_NOW) });
    const plain = await snapshotOf(baselineSite(), timed.config, FIXED_NOW, checker.focus);
    expect(timed.stopped).toBe(false);
    expect(timed.snapshot.exchanges.map((e) => [e.purpose, e.request.url, e.status])).toEqual(plain.snapshot.exchanges.map((e) => [e.purpose, e.request.url, e.status]));
  });

  it("stops a slow crawl at the deadline instead of running every request", async () => {
    const fetcher = new SlowFetcher(new MemoryFetcher(baselineSite()), 40);
    const started = Date.now();
    const result = await acquireForCheck(checkerBySlug("sitemap-checker"), `${ORIGIN}/`, { fetcher, deadlineMs: 100 });
    expect(result.stopped).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(fetcher.requests).toBeLessThan(6);
  });

  it("stops when the client goes away", async () => {
    const fetcher = new SlowFetcher(new MemoryFetcher(baselineSite()), 40);
    const client = new AbortController();
    setTimeout(() => client.abort(), 60);
    const result = await acquireForCheck(checkerBySlug("canonical-checker"), `${ORIGIN}/`, { fetcher, deadlineMs: 10_000, signal: client.signal });
    expect(result.stopped).toBe(true);
    expect(fetcher.requests).toBeLessThan(6);
  });
});
