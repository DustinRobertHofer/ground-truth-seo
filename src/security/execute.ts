import { StoppableFetcher } from "../checkers/acquire.js";
import { CHECK_DEADLINE_MS, CHECK_TIMEOUT_MS } from "../checkers/execute.js";
import { normalizeCheckUrl } from "../checkers/url.js";
import { HttpFetcher } from "../scanner/acquire/http-fetcher.js";
import { ConfigError, resolveConfig } from "../scanner/config.js";
import { SCANNER_VERSION } from "../scanner/evaluate/index.js";
import { acquireForSecurity, securityInput } from "./acquire.js";
import { buildSecurityResult } from "./run.js";
import { normalizeSearchTerms } from "./search.js";
import type { SecurityOutcome } from "./types.js";

/**
 * Runs one security check against the live site (PRODUCT.md §20): the
 * bounded acquisition with the focused checkers' timeout and deadline, then the
 * pure result builder. Nothing is saved, and the snapshot, which holds every
 * fetched body, goes out of scope when this returns: only the redacted result
 * leaves. Errors are logged without the site's responses or the search terms.
 */
export async function executeSecurityCheck(
  rawUrl: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
  rawTerms: unknown = [],
): Promise<SecurityOutcome> {
  const normalized = normalizeCheckUrl(rawUrl);
  if (!normalized.ok) return { ok: false, error: normalized.error, reason: "invalid_url" };
  const search = normalizeSearchTerms(rawTerms);
  if (!search.ok) return { ok: false, error: search.error, reason: "invalid_search" };
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CHECK_DEADLINE_MS);
  const onAbort = () => stop.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const config = resolveConfig(securityInput(normalized.url));
    const snapshot = await acquireForSecurity(config, {
      fetcher: new StoppableFetcher(new HttpFetcher(SCANNER_VERSION, CHECK_TIMEOUT_MS), stop.signal),
      now: () => new Date(),
      scannerVersion: SCANNER_VERSION,
      onProgress,
    });
    if (stop.signal.aborted) {
      return {
        ok: false,
        reason: "timeout",
        error: `The site answered too slowly for this check to finish within ${CHECK_DEADLINE_MS / 1000} seconds. Try again later.`,
      };
    }
    const result = buildSecurityResult(snapshot, config, search.terms);
    const host = new URL(result.origin).host;
    if (result.reach.status === "dns_error") {
      return { ok: false, reason: "unreachable", error: `${host} could not be found in DNS. Check the spelling of the address, including www if the site uses it.` };
    }
    if (result.reach.status === "blocked_address") {
      return { ok: false, reason: "blocked_address", error: `${host} resolves to a private or reserved network address, which the scanner never requests.` };
    }
    return { ok: true, result };
  } catch (error) {
    if (error instanceof ConfigError) return { ok: false, reason: "invalid_url", error: "That address cannot be checked. Enter a public http:// or https:// URL." };
    console.error("Security check failed", error instanceof Error ? error.name : "unknown error");
    return { ok: false, reason: "scan_error", error: "The check could not be completed. Try again in a moment." };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
