/**
 * The home page performance diagnostics end to end (PRODUCT.md §22): acquire
 * the inputs, then diagnose them. Callers pass the home page the scan resolved.
 */

import { cruxApiKey } from "../scanner/acquire/crux.js";
import { acquirePerformance, pagespeedApiKey, type AcquirePerformanceOptions } from "./acquire.js";
import { diagnosePerformance } from "./diagnose.js";
import type { PerformanceFile } from "./types.js";

/** Which inputs this process can request: field data with CRUX_API_KEY, the lab run with PAGESPEED_API_KEY or CRUX_API_KEY. */
export function performanceConfigured(env: NodeJS.ProcessEnv = process.env): { field: boolean; lab: boolean } {
  return { field: Boolean(env.CRUX_API_KEY?.trim()), lab: pagespeedApiKey(env) !== null };
}

/** The home page of a scan: its preferred origin followed by "/" (KNOWLEDGE.md §3.2). */
export function homePageOfOrigin(preferredOrigin: string): string {
  return `${preferredOrigin}/`;
}

export async function runPerformance(homeUrl: string, options: Partial<AcquirePerformanceOptions> = {}): Promise<PerformanceFile> {
  const input = await acquirePerformance(homeUrl, {
    cruxKey: options.cruxKey === undefined ? cruxApiKey() : options.cruxKey,
    pagespeedKey: options.pagespeedKey === undefined ? pagespeedApiKey() : options.pagespeedKey,
    fetch: options.fetch,
    signal: options.signal,
    labTimeoutMs: options.labTimeoutMs,
    onProgress: options.onProgress,
  });
  return { input, result: diagnosePerformance(input) };
}
