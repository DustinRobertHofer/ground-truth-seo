/**
 * ground-truth-seo: the library API.
 *
 * Scan a site (acquire + evaluate), evaluate a stored snapshot, render and diff
 * reports, run the security checker, and run the advisory content review.
 * Evaluation is a pure function of (snapshot, ruleset, config); see
 * docs/PRODUCT.md §5.5 and §6.
 *
 * Deeper modules are importable as `ground-truth-seo/<path under src>`, for
 * example `ground-truth-seo/scanner/report/types`. Only this entry point and
 * `ground-truth-seo/scanner/rules` are the supported API; deep paths may change
 * between minor versions while the package is below 1.0.
 */

// The scanner (PRODUCT.md §5 to §10).
export {
  scan,
  evaluateSnapshot,
  evaluate,
  SCANNER_VERSION,
  resolveConfig,
  configHash,
  CONFIG_DEFAULTS,
  ConfigError,
  canonicalize,
  cruxApiKey,
  cruxApiProvider,
  renderMarkdown,
  diffReports,
  RULES,
  RULESET_VERSION,
  KNOWLEDGE_CUTOFF,
  type ScanResult,
  type ScanConfig,
  type ScanConfigInput,
  type CruxProvider,
  type Snapshot,
  type Report,
  type Finding,
  type Recommendation,
  type ReportDiff,
} from "./scanner/index.js";
export { parseStoredReport, upgradeReport } from "./scanner/report/stored.js";
export { HttpFetcher } from "./scanner/acquire/http-fetcher.js";
export type { Fetcher, FetchRequest, FetchResult } from "./scanner/acquire/types.js";

// The security checker (PRODUCT.md §20, KNOWLEDGE.md §12). Never part of the score.
export { executeSecurityCheck } from "./security/execute.js";
export { acquireForSecurity, securityInput } from "./security/acquire.js";
export { buildSecurityResult } from "./security/run.js";
export { normalizeSearchTerms } from "./security/search.js";
export type { SecurityFinding, SecurityOutcome, SecurityResult } from "./security/types.js";

// The advisory content review (PRODUCT.md §17, KNOWLEDGE.md §11). Never part of the score.
export { extractContent, DEFAULT_REVIEW_PAGES, MAX_REVIEW_PAGES, type ExtractOptions } from "./content-review/extract.js";
export { aiReviewConfigured, reviewContent, reviewModel, DEFAULT_REVIEW_MODEL, type ReviewOptions } from "./content-review/review.js";
export { renderReviewMarkdown } from "./content-review/markdown.js";
export type { ContentReview, SiteContent, PageContent } from "./content-review/types.js";
