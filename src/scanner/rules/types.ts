/**
 * Types for the compiled ruleset.
 *
 * Every value in these structures is transcribed from docs/KNOWLEDGE.md and
 * docs/SOURCES.md. Code must not add SEO knowledge that is absent from those
 * files (docs/README.md, ground rules).
 */

export type RuleClass = "C1" | "C2" | "C3" | "C4";

export type Engine = "google" | "bing";

export type Severity = "critical" | "major" | "minor" | "info";

export type Gate =
  | { kind: "indexing" }
  | { kind: "feature"; name: FeatureName };

export type FeatureName =
  | "favicon"
  | "site_name"
  | "breadcrumb"
  | "org_logo"
  | "vacation_rental";

export type CategoryKey =
  | "http"
  | "urls"
  | "robots"
  | "indexing"
  | "head"
  | "canonical"
  | "sitemaps"
  | "links"
  | "images"
  | "structured_data"
  | "i18n"
  | "redirects"
  | "performance"
  | "javascript"
  | "ai"
  | "tooling";

/** Optional inputs or preconditions a rule (or one condition) needs. */
export type Requirement =
  | "rendered"
  | "crux"
  | "parity"
  | "owner"
  | "config"
  | "complete-crawl";

/**
 * The kind of unit a rule is evaluated on. Used by the scorer to count
 * applicable units and by the report to label them.
 */
export type ScopeKind =
  | "site"
  | "origin"
  | "page"
  | "intended"
  | "sitemap"
  | "redirect"
  | "pair"
  | "resource"
  | "host"
  | "none";

export interface Citation {
  /** A SOURCES.md ID. */
  source_id: string;
  /** The section name as written in KNOWLEDGE.md. */
  section: string;
  /**
   * The verbatim quote with Markdown backticks stripped, or null when the
   * citation points at a section for context only.
   */
  quote: string | null;
  /**
   * When present, the citation is emitted only for these condition codes
   * (KNOWLEDGE.md §1.3). Absent means every finding of the rule carries it.
   */
  conditions?: string[];
}

export interface Condition {
  /** Stable condition code, e.g. `outside_head`. */
  code: string;
  /**
   * The reason template with `{placeholder}` fields filled from observed
   * values only (KNOWLEDGE.md §1.5). For info conditions this is the info text.
   */
  reason: string;
  /** A condition-specific requirement (`Fail code (requires: rendered)`). */
  requires?: Requirement;
  /** True for an informational condition inside a scored rule (never a fail). */
  info?: true;
  /**
   * True for an opportunity condition (KNOWLEDGE.md §1.3): the documented
   * practice is absent on the unit and nothing is broken by its absence. The
   * unit counts as unmet in the score, exactly like a fail, and the finding is
   * reported as something to add rather than something to fix.
   */
  opportunity?: true;
}

export interface Rule {
  id: string;
  /** The rule title; fills the finding's `expected` field. */
  title: string;
  class: RuleClass;
  weight: 0 | 2 | 4 | 8;
  gate: Gate | null;
  category: CategoryKey;
  /** The scope text as written in KNOWLEDGE.md. */
  scope: string;
  scopeKind: ScopeKind;
  /**
   * Engines whose documentation supports the rule. An empty list means the
   * rule rests on a standard and applies whatever engines are selected.
   */
  engines: Engine[];
  /** The standard named in C3 outcome text, e.g. "the HTML Standard". */
  standard?: string;
  /** Book badges, as written. */
  book: string;
  requires?: Requirement[];
  /** Fail conditions for scored rules; info conditions for C4 rules. */
  conditions: Condition[];
  /** The Fix text. Absent only for pure info rules without a fix. */
  fix: string | null;
  citations: Citation[];
  notes?: string;
  /** Rule IDs reported as `related` on findings. */
  related?: string[];
  /** A rule-specific Outcome line, overriding KNOWLEDGE.md §10.2. */
  outcome?: string;
  /** True for `-HC` house conventions (off by default). */
  houseConvention: boolean;
  /** True when the rule only ever produces `info` findings. */
  informational: boolean;
  /** True when the rule is marked "(scanner)" in KNOWLEDGE.md. */
  scannerAdded: boolean;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  last_updated: string;
  verified: string;
  group: string;
}

export const CLASS_WEIGHT: Record<RuleClass, 0 | 2 | 4 | 8> = {
  C1: 8,
  C2: 4,
  C3: 2,
  C4: 0,
};

export const CLASS_SEVERITY: Record<RuleClass, Severity> = {
  C1: "critical",
  C2: "major",
  C3: "minor",
  C4: "info",
};

export const CLASS_LABEL: Record<RuleClass, string> = {
  C1: "Mechanism",
  C2: "Recommended",
  C3: "Standard",
  C4: "Informational",
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "http",
  "urls",
  "robots",
  "indexing",
  "head",
  "canonical",
  "sitemaps",
  "links",
  "images",
  "structured_data",
  "i18n",
  "redirects",
  "performance",
  "javascript",
  "ai",
  "tooling",
];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  http: "HTTP and hosting",
  urls: "Hosts and URLs",
  robots: "robots.txt",
  indexing: "Indexing controls",
  head: "Document head and metadata",
  canonical: "Canonicalization",
  sitemaps: "Sitemaps",
  links: "Links and headings",
  images: "Images",
  structured_data: "Structured data",
  i18n: "Localization",
  redirects: "Redirects",
  performance: "Performance and mobile",
  javascript: "JavaScript",
  ai: "AI crawlers and generative search",
  tooling: "Search tooling",
};
