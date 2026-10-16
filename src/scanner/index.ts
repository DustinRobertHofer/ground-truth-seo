/**
 * Public entry points: scan (acquire + evaluate), evaluate, render, diff.
 */

import { acquire } from "./acquire/crawl.js";
import type { CruxProvider } from "./acquire/crux.js";
import { HttpFetcher } from "./acquire/http-fetcher.js";
import { configHash, resolveConfig, type ScanConfig, type ScanConfigInput } from "./config.js";
import { evaluate, SCANNER_VERSION } from "./evaluate/index.js";
import type { Report } from "./report/types.js";
import { canonicalize } from "./snapshot/canonical-json.js";
import type { Snapshot } from "./snapshot/types.js";

export { evaluate, SCANNER_VERSION } from "./evaluate/index.js";
export { resolveConfig, configHash, CONFIG_DEFAULTS, ConfigError, type ScanConfig, type ScanConfigInput } from "./config.js";
export { canonicalize } from "./snapshot/canonical-json.js";
export { cruxApiKey, cruxApiProvider, type CruxProvider } from "./acquire/crux.js";
export type { Snapshot } from "./snapshot/types.js";
export type { Report, Finding, Recommendation } from "./report/types.js";
export { renderMarkdown } from "./report/markdown.js";
export { diffReports, type ReportDiff } from "./report/diff.js";
export { RULES, RULESET_VERSION, KNOWLEDGE_CUTOFF } from "./rules/index.js";

export interface ScanResult {
  config: ScanConfig;
  snapshot: Snapshot;
  report: Report;
  reportJson: string;
}

export async function scan(input: ScanConfigInput, options: { onProgress?: (message: string) => void; timeoutMs?: number; crux?: CruxProvider } = {}): Promise<ScanResult> {
  const config = resolveConfig(input);
  const fetcher = new HttpFetcher(SCANNER_VERSION, options.timeoutMs);
  const snapshot = await acquire(config, { fetcher, now: () => new Date(), scannerVersion: SCANNER_VERSION, onProgress: options.onProgress, crux: options.crux });
  const report = evaluate(snapshot, config);
  return { config, snapshot, report, reportJson: canonicalize(report) };
}

/** Evaluate a stored snapshot with a configuration; byte-identical for identical inputs. */
export function evaluateSnapshot(snapshot: Snapshot, input: ScanConfigInput): { report: Report; reportJson: string; configHash: string } {
  const config = resolveConfig(input);
  const report = evaluate(snapshot, config);
  return { report, reportJson: canonicalize(report), configHash: configHash(config) };
}
