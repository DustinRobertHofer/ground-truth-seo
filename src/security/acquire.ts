/**
 * Acquisition for the security checker (PRODUCT.md §20.1): the focused
 * checkers' crawl, then one extra phase that requests the fixed file paths of
 * KNOWLEDGE.md §12.4, the same-site scripts the loaded pages reference and the
 * source maps those scripts name. Every request goes through the scanner's
 * own fetch path, so robots.txt, redirects, timeouts and SSRF protection apply.
 */

import { Acquirer, type AcquireFocus, type AcquireOptions } from "../scanner/acquire/crawl.js";
import { BODY_CAPS, type FetchResult } from "../scanner/acquire/types.js";
import type { ScanConfig, ScanConfigInput } from "../scanner/config.js";
import type { ParsedHtml } from "../scanner/evaluate/core/html.js";
import { header } from "../scanner/snapshot/access.js";
import { sortBytes } from "../scanner/evaluate/core/text.js";
import { comparisonKey } from "../scanner/evaluate/core/url.js";
import type { Snapshot } from "../scanner/snapshot/types.js";
import { decodeUtf8, isSameSite, scriptUrlsOf, siteBaseOf, sourceMapRef } from "./detect.js";
import { PROBES } from "./knowledge.js";

/** Crawl and read bounds for one check (PRODUCT.md §20.1). */
export const SECURITY_LIMITS = {
  max_pages: 8,
  max_depth: 1,
  scripts: 20,
  maps: 20,
  /** Largest script or source map read, in bytes. */
  bytes: 15 * 1024 * 1024,
  /** Scripts and source maps read in all, in bytes; past it, the rest are not requested. */
  totalBytes: 40 * 1024 * 1024,
} as const;

/** The focused checkers' crawl: the home page and the entered page, then the pages they link to. */
export const SECURITY_FOCUS: AcquireFocus = { phases: ["crawl"], seedStartUrl: true };

/** The extra phase follows phase 9 of PRODUCT.md §5.1. */
const PHASE = 10;

/** The scan configuration for one check: small crawl bounds, nothing optional switched on. */
export function securityInput(startUrl: string): ScanConfigInput {
  return {
    start_url: startUrl,
    max_pages: SECURITY_LIMITS.max_pages,
    max_depth: SECURITY_LIMITS.max_depth,
    max_extra_fetches: 0,
    max_images_per_page: 0,
    render: false,
    crux: false,
    parity_check: false,
  };
}

/** The scripts a check reads, in the order it reads them: from same-site pages, same-site, deduplicated, sorted, capped. */
export function scriptsToRead(pages: Iterable<readonly [string, ParsedHtml]>, origin: string): string[] {
  const base = siteBaseOf(origin);
  const all = new Set<string>();
  for (const [url, parsed] of pages) {
    if (!isSameSite(url, base)) continue;
    for (const script of scriptUrlsOf(parsed, url, base)) all.add(script);
  }
  return sortBytes(all).slice(0, SECURITY_LIMITS.scripts);
}

export class SecurityAcquirer extends Acquirer {
  private bytesRead = 0;

  /**
   * One hop at a time, at most 11 requests, following a redirect only while it
   * stays same-site (KNOWLEDGE.md §12.3). Nothing is requested once the byte
   * budget is spent. Returns the final response, or null.
   */
  private async fetchSameSite(url: string, purpose: "script" | "source_map", base: string): Promise<{ url: string; result: FetchResult } | null> {
    let current = url;
    const seen = new Set<string>();
    for (let hop = 0; hop < 11; hop += 1) {
      if (seen.has(current) || this.bytesRead >= SECURITY_LIMITS.totalBytes) return null;
      seen.add(current);
      const result = await this.fetchOnce(current, purpose, PHASE, SECURITY_LIMITS.bytes);
      this.bytesRead += result.body?.length ?? 0;
      const location = result.outcome === "response" ? header({ headers: result.headers } as never, "location") : null;
      const redirect = result.status !== null && result.status >= 300 && result.status < 400 && location !== null;
      if (!redirect) return { url: current, result };
      const next = comparisonKey(location, current);
      if (next === null || !isSameSite(next, base)) return null;
      current = next;
    }
    return null;
  }

  protected override async extraPhases(): Promise<void> {
    const origin = this.preferredOrigin;
    const base = siteBaseOf(origin);

    this.progress("Requesting files that should never be public");
    for (const probe of PROBES) await this.fetchOnce(`${origin}${probe.path}`, "exposure", PHASE, BODY_CAPS.text);

    const scripts = scriptsToRead(this.pages.entries(), origin);
    if (scripts.length === 0) return;
    this.progress("Reading scripts");
    const maps = new Set<string>();
    for (const url of scripts) {
      const final = await this.fetchSameSite(url, "script", base);
      const result = final?.result;
      if (!final || !result || result.outcome !== "response" || result.status !== 200 || !result.body) continue;
      const exchange = { headers: result.headers } as never;
      const ref = sourceMapRef(final.url, { sourcemap: header(exchange, "sourcemap"), xSourcemap: header(exchange, "x-sourcemap") }, decodeUtf8(result.body));
      if (ref && ref.via !== "data" && isSameSite(ref.url, base)) maps.add(ref.url);
    }
    if (maps.size === 0) return;
    this.progress("Reading source maps");
    for (const url of sortBytes(maps).slice(0, SECURITY_LIMITS.maps)) await this.fetchSameSite(url, "source_map", base);
  }
}

export async function acquireForSecurity(config: ScanConfig, options: AcquireOptions): Promise<Snapshot> {
  return new SecurityAcquirer(config, { ...options, focus: SECURITY_FOCUS }).run();
}
