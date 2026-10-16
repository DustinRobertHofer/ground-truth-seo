import { HttpFetcher } from "../scanner/acquire/http-fetcher.js";
import { ConfigError } from "../scanner/config.js";
import { SCANNER_VERSION } from "../scanner/evaluate/index.js";
import { acquireForCheck } from "./acquire.js";
import type { CheckerConfig } from "./config.js";
import { buildCheckResult } from "./run.js";
import type { CheckOutcome } from "./types.js";
import { normalizeCheckUrl } from "./url.js";

/** Per-request timeout for checks: shorter than the full scanner's, so a dead host fails fast. */
export const CHECK_TIMEOUT_MS = 10_000;
/** The whole check's budget, inside the route's maxDuration with room to evaluate and reply. */
export const CHECK_DEADLINE_MS = 100_000;

/**
 * Runs one focused check against the live site: acquisition with the
 * checker's focus, page bounds and deadline, then the shared evaluator.
 * Nothing is saved to history or to the research corpus (PRODUCT.md §19).
 */
export async function executeCheck(
  checker: CheckerConfig,
  rawUrl: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<CheckOutcome> {
  const normalized = normalizeCheckUrl(rawUrl);
  if (!normalized.ok) return { ok: false, error: normalized.error, reason: "invalid_url" };
  try {
    const { snapshot, config, stopped } = await acquireForCheck(checker, normalized.url, {
      fetcher: new HttpFetcher(SCANNER_VERSION, CHECK_TIMEOUT_MS),
      deadlineMs: CHECK_DEADLINE_MS,
      signal,
      onProgress,
    });
    if (stopped) {
      return {
        ok: false,
        reason: "timeout",
        error: `The site answered too slowly for this check to finish within ${CHECK_DEADLINE_MS / 1000} seconds. Try again later, or run the full audit, which allows more time.`,
      };
    }
    const result = buildCheckResult(checker, snapshot, config);
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
    console.error("Check failed", error);
    return { ok: false, reason: "scan_error", error: "The check could not be completed. Try again in a moment." };
  }
}
