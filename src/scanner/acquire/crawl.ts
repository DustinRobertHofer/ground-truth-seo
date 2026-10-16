/**
 * Acquisition: fixed phases, sorted queues, robots.txt first (PRODUCT.md §5.1).
 */

import type { ScanConfig } from "../config.js";
import { attr, elements, parseHtml, relTokens, type ParsedHtml } from "../evaluate/core/html.js";
import { decideAccess, parseRobotsTxt, type ParsedRobots } from "../evaluate/core/robots-txt.js";
import { parseSitemap } from "../evaluate/core/sitemap.js";
import { allItems, jsonLdBlocks, urlOf } from "../evaluate/core/structured-data.js";
import { compareBytes, sortBytes } from "../evaluate/core/text.js";
import { comparisonKey, homePageOf, originOf, pathAndQuery, variantOrigins } from "../evaluate/core/url.js";
import { header, isHtmlMediaType } from "../snapshot/access.js";
import { SnapshotBuilder } from "../snapshot/builder.js";
import { sha256Hex } from "../snapshot/sha256.js";
import type { ExchangePurpose, Snapshot } from "../snapshot/types.js";
import type { CruxProvider } from "./crux.js";
import { BODY_CAPS, CONNECT_TIMEOUT_MS, SCANNER_TOKEN, TOTAL_TIMEOUT_MS, scannerUserAgent, type FetchResult, type Fetcher } from "./types.js";

/**
 * Phases a focused check may leave out (PRODUCT.md §19). robots.txt and the
 * start URL are always fetched, and IndexNow and staging probes run only when
 * configured, so they are not listed.
 */
export type AcquirePhase =
  | "variants"
  | "probe_404"
  | "sitemaps"
  | "crawl"
  | "sitemap_urls"
  | "targets"
  | "resources"
  | "llms"
  | "conditional"
  | "dns";

export interface AcquireFocus {
  /** The phases to run; every other phase is skipped. */
  phases: readonly AcquirePhase[];
  /** Crawl the start URL's final page at depth 0 beside the home page, so a deep URL is evaluated. */
  seedStartUrl?: boolean;
}

export interface AcquireOptions {
  fetcher: Fetcher;
  /** The single clock reading, injected for determinism. */
  now: () => Date;
  scannerVersion: string;
  caBundleVersion?: string;
  onProgress?: (message: string) => void;
  /** A focused acquisition for the single-topic checkers. Omitted, every phase runs (PRODUCT.md §5.1). */
  focus?: AcquireFocus;
  /**
   * Chrome UX Report field data (PRODUCT.md §5.1 step 10), asked for only when the
   * configuration enables `crux`. The answers are stored in the snapshot; the key
   * that fetched them is not.
   */
  crux?: CruxProvider;
}

interface Fetched {
  url: string;
  result: FetchResult;
}

const SCANNER_CHAIN = [SCANNER_TOKEN.toLowerCase(), "*"];

/**
 * Requests in flight at once (PRODUCT.md §5.2: up to 4 per origin). A global cap
 * keeps every origin within it. Concurrency changes speed only: the fetched set and
 * the snapshot's order never depend on it (fetchChains).
 */
export const FETCH_CONCURRENCY = 4;

/** One chain to follow: its start URL and the purpose its requests are recorded under. */
interface ChainRequest {
  url: string;
  purpose: ExchangePurpose;
}

export class Acquirer {
  private readonly builder = new SnapshotBuilder();
  private readonly fetched = new Map<string, FetchResult>();
  private readonly robots = new Map<string, ParsedRobots | "none" | "unavailable">();
  /** robots.txt fetches in flight, so concurrent requests to a new origin wait on one fetch. */
  private readonly robotsInFlight = new Map<string, Promise<ParsedRobots | "none" | "unavailable">>();
  /** Parsed 200 HTML pages by final URL; the link crawl fills it. */
  protected readonly pages = new Map<string, ParsedHtml>();
  private readonly userAgent: string;
  protected preferredOrigin = "";
  private inScope: string[] = [];
  private truncated = false;
  private pageBudget: number;
  private extraBudget: number;

  constructor(private readonly config: ScanConfig, private readonly options: AcquireOptions) {
    this.userAgent = scannerUserAgent(options.scannerVersion);
    this.pageBudget = config.max_pages;
    this.extraBudget = config.max_extra_fetches;
  }

  protected progress(message: string): void {
    this.options.onProgress?.(message);
  }

  private runs(phase: AcquirePhase): boolean {
    return !this.options.focus || this.options.focus.phases.includes(phase);
  }

  // ------------------------------------------------------------- fetching

  private requestHeaders(extra: [string, string][] = [], userAgent?: string): [string, string][] {
    return [["user-agent", userAgent ?? this.userAgent], ["accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"], ["accept-encoding", "gzip, deflate, br"], ...extra];
  }

  /** robots.txt for an origin, fetched once, always before other requests to it. */
  private ensureRobots(origin: string): Promise<ParsedRobots | "none" | "unavailable"> {
    const cached = this.robots.get(origin);
    if (cached) return Promise.resolve(cached);
    let pending = this.robotsInFlight.get(origin);
    if (!pending) {
      pending = this.fetchRobots(origin);
      this.robotsInFlight.set(origin, pending);
    }
    return pending;
  }

  private async fetchRobots(origin: string): Promise<ParsedRobots | "none" | "unavailable"> {
    let url = `${origin}/robots.txt`;
    let state: ParsedRobots | "none" | "unavailable" = "unavailable";
    for (let hop = 0; hop < 6; hop += 1) {
      const result = await this.fetchOnce(url, "robots", 0, BODY_CAPS.robots);
      if (result.outcome !== "response") {
        state = "unavailable";
        break;
      }
      const status = result.status ?? 0;
      const location = header({ headers: result.headers } as never, "location");
      if (status >= 300 && status < 400 && location) {
        if (hop === 5) {
          state = "none";
          break;
        }
        const next = comparisonKey(location, url);
        if (!next) {
          state = "none";
          break;
        }
        url = next;
        continue;
      }
      if (status >= 200 && status < 300) state = parseRobotsTxt(result.body ?? new Uint8Array(0));
      else if (status >= 400 && status < 500 && status !== 429) state = "none";
      else state = "unavailable";
      break;
    }
    this.robots.set(origin, state);
    return state;
  }

  private async allowedForScanner(url: string): Promise<boolean> {
    if (this.config.robots_mode === "owner" && this.builder.ownerVerified) return true;
    const robots = await this.ensureRobots(originOf(url));
    if (robots === "none") return true;
    if (robots === "unavailable") return false; // RFC 9309: assume complete disallow
    return decideAccess(robots, SCANNER_CHAIN, pathAndQuery(url)).allowed;
  }

  protected async fetchOnce(url: string, purpose: ExchangePurpose, phase: number, maxBytes: number, extra: [string, string][] = [], userAgent?: string): Promise<FetchResult> {
    const key = comparisonKey(url) ?? url;
    const isDiagnostic = purpose === "conditional" || purpose === "parity_mobile" || purpose === "parity_desktop";
    if (!isDiagnostic && this.fetched.has(key)) return this.fetched.get(key)!;
    if (purpose !== "robots") {
      const allowed = await this.allowedForScanner(key);
      if (!allowed) {
        const blocked: FetchResult = { outcome: "blocked_by_robots_policy", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: null };
        this.record(key, purpose, phase, blocked, extra, userAgent, 1);
        if (!isDiagnostic) this.fetched.set(key, blocked);
        return blocked;
      }
    }
    let attempt = 1;
    let result = await this.options.fetcher.fetch({ url: key, purpose, maxBytes, extraHeaders: extra, userAgent });
    this.record(key, purpose, phase, result, extra, userAgent, attempt);
    if (result.outcome === "timeout" || result.outcome === "connection_error") {
      attempt = 2;
      result = await this.options.fetcher.fetch({ url: key, purpose, maxBytes, extraHeaders: extra, userAgent });
      this.record(key, purpose, phase, result, extra, userAgent, attempt);
    }
    if (!isDiagnostic) this.fetched.set(key, result);
    return result;
  }

  private record(url: string, purpose: ExchangePurpose, phase: number, result: FetchResult, extra: [string, string][], userAgent: string | undefined, attempt: number): void {
    this.builder.record({
      phase,
      purpose,
      url,
      requestHeaders: this.requestHeaders(extra, userAgent),
      outcome: result.outcome,
      status: result.status,
      headers: result.headers,
      body: result.body,
      sizeCompressed: result.sizeCompressed,
      truncated: result.truncated,
      errorCode: result.errorCode,
      attempt,
    });
    if (result.tls && url.startsWith("https:")) {
      const origin = originOf(url);
      if (!(origin in this.builder.tls)) this.builder.tls[origin] = result.tls;
    }
  }

  /** Follow a chain manually, one hop at a time, at most 11 requests. */
  private async fetchChain(url: string, purpose: ExchangePurpose, phase: number, maxBytes: number): Promise<Fetched[]> {
    return (await this.fetchChains([{ url, purpose }], phase, maxBytes))[0]!;
  }

  /**
   * Follow several chains at once, hop by hop, at most 11 requests each, with up to
   * FETCH_CONCURRENCY requests in flight. Each round fetches the next hop of every
   * live chain. A URL two chains need in the same round is requested once, under the
   * purpose of the chain listed first, and a URL fetched earlier comes from the cache;
   * so what is fetched, and under which purpose, depends on the order of `requests`
   * and on the answers, never on which response arrived first.
   */
  private async fetchChains(requests: readonly ChainRequest[], phase: number, maxBytes: number): Promise<Fetched[][]> {
    const chains: Fetched[][] = requests.map(() => []);
    const seen = requests.map(() => new Set<string>());
    let current: (string | null)[] = requests.map((r) => comparisonKey(r.url) ?? r.url);
    for (let hop = 0; hop < 11; hop += 1) {
      const round = new Map<string, ExchangePurpose>();
      current = current.map((url, i) => {
        if (url === null || seen[i]!.has(url)) return null;
        seen[i]!.add(url);
        if (!round.has(url)) round.set(url, requests[i]!.purpose);
        return url;
      });
      if (round.size === 0) break;
      const results = new Map<string, FetchResult>();
      await this.mapLimit([...round.keys()], FETCH_CONCURRENCY, async (url) => {
        results.set(url, await this.fetchOnce(url, round.get(url)!, phase, maxBytes));
      });
      current = current.map((url, i) => {
        if (url === null) return null;
        const result = results.get(url)!;
        chains[i]!.push({ url, result });
        const location = result.outcome === "response" ? header({ headers: result.headers } as never, "location") : null;
        if (result.outcome !== "response" || result.status === null || result.status < 300 || result.status >= 400 || !location) return null;
        return comparisonKey(location, url);
      });
    }
    return chains;
  }

  private async resolveHost(hostname: string): Promise<boolean> {
    if (this.builder.dns[hostname]) return this.builder.dns[hostname]!.resolves;
    const record = await this.options.fetcher.resolve(hostname);
    this.builder.dns[hostname] = record;
    return record.resolves;
  }

  private page(url: string, result: FetchResult): ParsedHtml | null {
    if (result.outcome !== "response" || result.status !== 200 || !result.body) return null;
    if (!isHtmlMediaType(header({ headers: result.headers } as never, "content-type"))) return null;
    const cached = this.pages.get(url);
    if (cached) return cached;
    const parsed = parseHtml(result.body, header({ headers: result.headers } as never, "content-type"));
    this.pages.set(url, parsed);
    return parsed;
  }

  private finalOf(chain: Fetched[]): Fetched | null {
    const last = chain[chain.length - 1];
    if (!last) return null;
    const location = last.result.outcome === "response" ? header({ headers: last.result.headers } as never, "location") : null;
    if (last.result.outcome === "response" && last.result.status !== null && last.result.status >= 300 && last.result.status < 400 && location) return null;
    return last;
  }

  private links(url: string, parsed: ParsedHtml): string[] {
    const base = (() => {
      const baseEl = parsed.head ? elements(parsed.head, "base")[0] : undefined;
      const href = baseEl ? attr(baseEl, "href") : null;
      if (href) {
        try {
          return new URL(href.trim(), url).toString();
        } catch {
          return url;
        }
      }
      return url;
    })();
    const out = new Set<string>();
    for (const tag of ["a", "area"]) {
      for (const el of elements(parsed.document, tag)) {
        const href = attr(el, "href");
        if (href === null) continue;
        const key = comparisonKey(href, base);
        if (key && this.inScope.includes(originOf(key))) out.add(key);
      }
    }
    return sortBytes(out);
  }

  private async mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index]!;
        index += 1;
        await fn(item);
      }
    });
    await Promise.all(workers);
  }

  // ---------------------------------------------------------------- phases

  async run(): Promise<Snapshot> {
    const config = this.config;
    // Phase 1: resolve the start URL.
    this.progress("Resolving the start URL");
    const startKey = comparisonKey(config.start_url)!;
    await this.resolveHost(new URL(startKey).hostname);
    const startChain = await this.fetchChain(startKey, "start", 1, BODY_CAPS.html);
    const startFinal = this.finalOf(startChain);
    const finalUrl = startChain[startChain.length - 1]?.url ?? startKey;
    this.builder.startFinalUrl = startFinal ? startFinal.url : null;
    this.preferredOrigin = config.preferred_origin ?? originOf(finalUrl);
    this.inScope = sortBytes(new Set([this.preferredOrigin, ...config.additional_origins]));
    this.builder.preferredOrigin = this.preferredOrigin;
    for (const origin of this.inScope) await this.ensureRobots(origin);
    const home = homePageOf(this.preferredOrigin);

    // Phase 2: variant probes.
    const resolving: string[] = [];
    if (this.runs("variants")) {
      this.progress("Probing host and protocol variants");
      for (const variant of variantOrigins(this.preferredOrigin)) {
        if (await this.resolveHost(new URL(variant).hostname)) resolving.push(variant);
      }
      this.builder.variantOrigins = resolving;
      for (const variant of resolving) {
        await this.ensureRobots(variant);
        await this.fetchChain(`${variant}/`, "variant_probe", 2, BODY_CAPS.html);
      }
    }

    // Phase 3: the 404 probe.
    const probe = `${this.preferredOrigin}/gt-probe-404-${sha256Hex(this.preferredOrigin).slice(0, 16)}`;
    this.builder.probe404Url = probe;
    if (this.runs("probe_404")) await this.fetchChain(probe, "probe_404", 3, BODY_CAPS.html);

    // Phase 4: sitemaps.
    const sitemapUrls = new Map<string, { found_by: "robots" | "config" | "convention" | "index"; parent: string | null }>();
    const sitemapLocs = new Set<string>();
    if (this.runs("sitemaps")) await this.collectSitemaps(sitemapUrls, sitemapLocs);

    // Phase 5: breadth-first link crawl from the home page.
    const visited = new Set<string>();
    const crawled: string[] = [];
    if (this.runs("crawl")) {
      this.progress("Crawling pages");
      const seeds = new Set([home]);
      const seed = this.options.focus?.seedStartUrl ? this.builder.startFinalUrl : null;
      if (seed && this.inScope.includes(originOf(seed))) seeds.add(seed);
      let frontier = sortBytes(seeds);
      let depth = 0;
      while (frontier.length > 0 && depth <= config.max_depth) {
        const next = new Set<string>();
        const level = frontier.filter((u) => !visited.has(u));
        // The page budget picks the first URLs of the level in byte order, before any is fetched.
        const take = level.slice(0, Math.max(0, this.pageBudget));
        if (take.length < level.length) {
          this.truncated = true;
          this.builder.truncationLimits.push("max_pages");
        }
        for (const url of take) {
          visited.add(url);
          this.pageBudget -= 1;
          this.builder.crawl.push({ url, depth });
          crawled.push(url);
        }
        if (take.length > 0) this.progress(`Crawling pages: ${crawled.length} so far, depth ${depth}`);
        const chains = await this.fetchChains(take.map((url) => ({ url, purpose: "crawl" as const })), 5, BODY_CAPS.html);
        for (const chain of chains) {
          const final = this.finalOf(chain);
          if (!final) continue;
          const parsed = this.page(final.url, final.result);
          if (!parsed) continue;
          for (const link of this.links(final.url, parsed)) if (!visited.has(link)) next.add(link);
        }
        if (this.truncated) break;
        frontier = sortBytes(next);
        depth += 1;
        if (frontier.length > 0 && depth > config.max_depth) {
          this.truncated = true;
          this.builder.truncationLimits.push("max_depth");
        }
      }
    }

    // Phase 6: sitemap-listed URLs the crawl did not reach.
    if (this.runs("sitemap_urls")) {
      const unfetchedLocs = sortBytes(sitemapLocs).filter((u) => !this.fetched.has(u));
      const take = unfetchedLocs.slice(0, Math.max(0, this.pageBudget));
      if (take.length < unfetchedLocs.length) {
        this.truncated = true;
        if (!this.builder.truncationLimits.includes("max_pages")) this.builder.truncationLimits.push("max_pages");
      }
      this.pageBudget -= take.length;
      if (take.length > 0) this.progress(`Fetching ${take.length} sitemap-listed ${take.length === 1 ? "page" : "pages"}`);
      await this.fetchChains(take.map((url) => ({ url, purpose: "sitemap_url" as const })), 6, BODY_CAPS.html);
    }

    // Phase 7: referenced targets and variant samples.
    const intendedApprox = sortBytes(new Set([home, ...sitemapLocs, ...crawled]));
    if (this.runs("targets")) {
      this.progress("Fetching referenced targets");
      const targets = new Set<string>();
      for (const [url, result] of this.fetched) {
        const parsed = this.page(url, result);
        if (!parsed) continue;
        for (const link of elements(parsed.document, "link")) {
          const rel = relTokens(link);
          const href = attr(link, "href");
          if (!href) continue;
          if (rel.includes("canonical") || (rel.includes("alternate") && attr(link, "hreflang") !== null)) {
            const key = comparisonKey(href, url);
            if (key) targets.add(key);
          }
        }
        // Redirect targets of internal links.
        const location = header({ headers: result.headers } as never, "location");
        if (location) {
          const key = comparisonKey(location, url);
          if (key) targets.add(key);
        }
      }
      const pending = sortBytes(targets).filter((url) => !this.fetched.has(url));
      if (pending.length <= this.extraBudget) {
        // Every target fits the budget, so fetching them together reaches the same set.
        this.extraBudget -= pending.length;
        await this.fetchChains(pending.map((url) => ({ url, purpose: "extra" as const })), 7, BODY_CAPS.html);
      } else {
        // Over budget, a target that an earlier target's redirect already fetched costs
        // nothing, which only the one-at-a-time walk can know.
        for (const url of pending) {
          if (this.fetched.has(url)) continue;
          if (this.extraBudget <= 0) {
            this.truncated = true;
            if (!this.builder.truncationLimits.includes("max_extra_fetches")) this.builder.truncationLimits.push("max_extra_fetches");
            break;
          }
          this.extraBudget -= 1;
          await this.fetchChain(url, "extra", 7, BODY_CAPS.html);
        }
      }
    }
    const sample = intendedApprox.find((u) => u !== home);
    if (sample) {
      for (const variant of resolving) {
        const probeUrl = `${variant}${pathAndQuery(sample)}`;
        await this.fetchChain(probeUrl, "variant_sample", 7, BODY_CAPS.html);
      }
    }

    // Phase 8: resources (favicons, logos, images).
    if (this.runs("resources")) await this.fetchResources(intendedApprox);

    // Phase 9: llms.txt, conditional re-request, IndexNow key, DNS TXT.
    if (this.runs("llms") || this.runs("conditional")) this.progress("Fetching llms.txt and conditional headers");
    if (this.runs("llms")) await this.fetchChain(`${this.preferredOrigin}/llms.txt`, "llms", 9, BODY_CAPS.text);
    const homeResult = this.fetched.get(home);
    if (this.runs("conditional") && homeResult && homeResult.outcome === "response") {
      const etag = header({ headers: homeResult.headers } as never, "etag");
      const lastModified = header({ headers: homeResult.headers } as never, "last-modified");
      const extra: [string, string][] = [];
      if (etag) extra.push(["if-none-match", etag]);
      else if (lastModified) extra.push(["if-modified-since", lastModified]);
      if (extra.length > 0) await this.fetchOnce(home, "conditional", 9, BODY_CAPS.html, extra);
    }
    if (config.indexnow_key) await this.fetchChain(`${this.preferredOrigin}/${config.indexnow_key}.txt`, "indexnow", 9, BODY_CAPS.text);
    for (const host of config.staging_hosts) {
      await this.resolveHost(host);
      await this.fetchChain(`https://${host}/`, "staging", 9, BODY_CAPS.html);
    }
    if (this.runs("dns")) {
      const host = new URL(this.preferredOrigin).hostname;
      await this.resolveHost(host);
      await this.resolveHost(host.replace(/^www\./, ""));
    }

    await this.extraPhases();

    // Phase 10 (optional): field data for the origin and the home page.
    if (config.crux && this.options.crux && this.preferredOrigin) {
      this.progress("Reading Chrome UX Report field data");
      const home = homePageOf(this.preferredOrigin);
      this.builder.crux = await this.options.crux(this.preferredOrigin, [home]);
    }

    return this.builder.finalize({
      scannerVersion: this.options.scannerVersion,
      startUrl: config.start_url,
      robotsMode: config.robots_mode,
      completedAt: this.options.now().toISOString().replace(/\.\d{3}Z$/, "Z"),
      truncated: this.truncated,
      caBundleVersion: this.options.caBundleVersion ?? "node-bundled",
      fetchPolicy: {
        user_agent: this.userAgent,
        connect_timeout_ms: CONNECT_TIMEOUT_MS,
        total_timeout_ms: TOTAL_TIMEOUT_MS,
        body_caps: { ...BODY_CAPS },
      },
    });
  }

  /**
   * Requests beyond PRODUCT.md §5.1, run after phase 9 and before the snapshot
   * is frozen. A scan runs none; the security checker (PRODUCT.md §20)
   * overrides this in its own subclass, so scan snapshots never change.
   */
  protected async extraPhases(): Promise<void> {}

  /** Phase 4: sitemaps from robots.txt, else /sitemap.xml by convention; index files one level deep. */
  private async collectSitemaps(
    sitemapUrls: Map<string, { found_by: "robots" | "config" | "convention" | "index"; parent: string | null }>,
    sitemapLocs: Set<string>,
  ): Promise<void> {
    this.progress("Collecting sitemaps");
    for (const origin of this.inScope) {
      const robots = this.robots.get(origin);
      if (robots && robots !== "none" && robots !== "unavailable") {
        for (const line of robots.sitemaps) {
          const key = comparisonKey(line.value, `${origin}/robots.txt`);
          if (key && !sitemapUrls.has(key)) sitemapUrls.set(key, { found_by: "robots", parent: null });
        }
      }
    }
    if (sitemapUrls.size === 0) {
      const convention = `${this.preferredOrigin}/sitemap.xml`;
      const chain = await this.fetchChain(convention, "sitemap", 4, BODY_CAPS.sitemap);
      const final = this.finalOf(chain);
      if (final && final.result.outcome === "response" && final.result.status === 200) sitemapUrls.set(convention, { found_by: "convention", parent: null });
    }
    const indexChildren: { url: string; parent: string }[] = [];
    const listed = sortBytes(sitemapUrls.keys());
    const listedChains = await this.fetchChains(listed.map((url) => ({ url, purpose: "sitemap" as const })), 4, BODY_CAPS.sitemap);
    for (const [i, url] of listed.entries()) {
      const chain = listedChains[i]!;
      const final = this.finalOf(chain);
      const source = sitemapUrls.get(url)!;
      this.builder.sitemaps.push({ url, found_by: source.found_by, parent: source.parent });
      if (!final || final.result.outcome !== "response" || final.result.status !== 200 || !final.result.body) continue;
      const parsed = parseSitemap(final.result.body);
      for (const entry of parsed.entries) {
        const key = comparisonKey(entry.loc);
        if (key && this.inScope.includes(originOf(key))) sitemapLocs.add(key);
      }
      for (const child of parsed.children) {
        const key = comparisonKey(child.loc, final.url);
        if (key) indexChildren.push({ url: key, parent: url });
      }
    }
    const children: { url: string; parent: string }[] = [];
    for (const child of indexChildren.sort((a, b) => compareBytes(a.url, b.url))) {
      if (sitemapUrls.has(child.url)) continue;
      sitemapUrls.set(child.url, { found_by: "index", parent: child.parent });
      children.push(child);
    }
    const childChains = await this.fetchChains(children.map((c) => ({ url: c.url, purpose: "sitemap" as const })), 4, BODY_CAPS.sitemap);
    for (const [i, child] of children.entries()) {
      const chain = childChains[i]!;
      this.builder.sitemaps.push({ url: child.url, found_by: "index", parent: child.parent });
      const final = this.finalOf(chain);
      if (!final || final.result.outcome !== "response" || final.result.status !== 200 || !final.result.body) continue;
      const parsed = parseSitemap(final.result.body);
      for (const entry of parsed.entries) {
        const key = comparisonKey(entry.loc);
        if (key && this.inScope.includes(originOf(key))) sitemapLocs.add(key);
      }
    }
  }

  /** Phase 8: favicons of each in-scope home page, Organization logos and the first images per intended page. */
  private async fetchResources(intendedApprox: string[]): Promise<void> {
    const config = this.config;
    this.progress("Fetching favicons, logos and images");
    // Planned in the walk's order, then fetched together; fetchChains keeps the first purpose for a shared URL.
    // robots.txt is fetched for every resource's origin, fetched before or not, as the walk did.
    const planned: ChainRequest[] = [];
    const origins = new Set<string>();
    const resourceFetch = async (url: string, purpose: ExchangePurpose) => {
      origins.add(originOf(url));
      if (!this.fetched.has(url)) planned.push({ url, purpose });
    };
    for (const origin of this.inScope) {
      const homeOf = homePageOf(origin);
      const result = this.fetched.get(homeOf);
      const parsed = result ? this.page(homeOf, result) : null;
      if (!parsed?.head) continue;
      for (const link of elements(parsed.head, "link")) {
        const rel = relTokens(link);
        const isIcon = rel.includes("icon") || rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
        const href = attr(link, "href");
        if (!isIcon || !href) continue;
        const key = comparisonKey(href, homeOf);
        if (key) await resourceFetch(key, "favicon");
      }
    }
    for (const url of intendedApprox) {
      const result = this.fetched.get(url);
      const parsed = result ? this.page(url, result) : null;
      if (!parsed) continue;
      for (const item of allItems(jsonLdBlocks(parsed))) {
        if (!item.types.includes("Organization")) continue;
        const logo = urlOf(item.value.logo);
        const key = logo ? comparisonKey(logo, url) : null;
        if (key) await resourceFetch(key, "logo");
      }
      let count = 0;
      for (const img of elements(parsed.document, "img")) {
        if (count >= config.max_images_per_page) break;
        const src = attr(img, "src");
        const key = src ? comparisonKey(src, url) : null;
        if (!key) continue;
        count += 1;
        await resourceFetch(key, "image");
      }
    }
    for (const origin of sortBytes(origins)) await this.ensureRobots(origin);
    if (planned.length > 0) this.progress(`Fetching ${planned.length} favicons, logos and images`);
    await this.fetchChains(planned, 8, BODY_CAPS.image);
  }
}

export async function acquire(config: ScanConfig, options: AcquireOptions): Promise<Snapshot> {
  return new Acquirer(config, options).run();
}
