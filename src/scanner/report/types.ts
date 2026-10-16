/**
 * The report, PRODUCT.md §8 and §10. Every value is a string, integer,
 * boolean, null, array or object so the canonical JSON is well defined.
 */

import type { CategoryKey, Engine, FeatureName, RuleClass, Severity } from "../rules/types.js";

/**
 * `opportunity` marks a documented practice the site has not adopted. It counts
 * against the score like a fail (PRODUCT.md §7.5) but is reported as something
 * to add, not something broken.
 */
export type FindingStatus = "pass" | "fail" | "opportunity" | "info" | "not_applicable" | "not_evaluated" | "manual";

export interface CitationOut {
  source_id: string;
  section: string;
  quote: string | null;
  source_last_updated: string;
}

export type Observed = Record<string, string | number>;

export interface Finding {
  rule_id: string;
  condition: string | null;
  status: FindingStatus;
  class: RuleClass;
  weight: number;
  severity: Severity;
  gate: string | null;
  category: CategoryKey;
  engines: Engine[];
  scope: string;
  unit: string;
  observed: Observed;
  expected: string;
  reason: string | null;
  recommendation: string | null;
  outcome: string | null;
  verify: string[];
  citations: CitationOut[];
  related: string[];
}

export interface Recommendation {
  rule_id: string;
  condition: string;
  /** `fix` for a failing rule, `add` for a practice not yet adopted (an opportunity). */
  kind: "fix" | "add";
  gate: string | null;
  class: RuleClass;
  weight: number;
  severity: Severity;
  action: string;
  reason: string;
  citations: CitationOut[];
  affected_units: string[];
  affected_count: number;
  outcome: string;
  verify: string[];
}

export interface RuleScore {
  rule_id: string;
  class: RuleClass;
  weight: number;
  units: number;
  passed: number;
  contribution: string;
}

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  score: number | null;
  /** A_k as a reduced fraction, or null when not measurable. */
  achieved: string | null;
  arithmetic: string;
  rules: RuleScore[];
}

export type ReadinessStatus = "in_place" | "not_in_place" | "optional" | "unknown";

/** One line of the AI answers readiness list (PRODUCT.md §10, KNOWLEDGE.md §10.4). Never scored. */
export interface ReadinessItem {
  key: string;
  label: string;
  /** The engine or operator whose documentation the item rests on. */
  party: string;
  status: ReadinessStatus;
  /** What the scan observed, filled from counts and outcomes only. */
  detail: string;
  source_id: string;
  section: string;
  quote: string | null;
}

export interface FeatureEligibility {
  feature: FeatureName;
  label: string;
  status: "eligible" | "not_eligible" | "not_applicable" | "not_evaluated";
  units: number;
  failing: { unit: string; rule_id: string; condition: string }[];
}

export interface AccessMatrixRow {
  crawler: string;
  operator: string;
  purpose: string;
  robots_behavior: string;
  source_id: string;
  user_triggered: boolean;
  results: { url: string; outcome: "allowed" | "disallowed" | "unknown"; rule: string | null; line: number | null }[];
}

export interface Report {
  meta: {
    scanner_version: string;
    ruleset_version: string;
    knowledge_cutoff: string;
    sources_verified: string;
    unicode_version: string;
    iso_data_version: string;
    snapshot_id: string;
    config_hash: string;
    config: Record<string, unknown>;
    robots_mode: "respect" | "owner";
    owner_verified: boolean;
    completed_at: string;
    truncated: boolean;
    truncation_limits: string[];
    start_url: string;
    preferred_origin: string;
    intent_inferred: boolean;
  };
  headline: {
    overall: number | null;
    overall_label: string;
    arithmetic: string;
    eligibility: string | null;
    /** A, the share of the best documented setup in place, as a reduced fraction. */
    achieved: string | null;
    intended: number;
    blocked: number;
    gates: { rule_id: string; blocked: number }[];
    critical_failures: number;
    major_failures: number;
    minor_failures: number;
    /** Units where a documented practice is not yet adopted. */
    opportunities: number;
    statements: { key: string; text: string; source_id: string | null; section: string | null }[];
    summary: string;
    with_house_conventions: boolean;
  };
  features: FeatureEligibility[];
  categories: CategoryScore[];
  recommendations: Recommendation[];
  findings: Finding[];
  ai_access_matrix: { rows: AccessMatrixRow[]; notes: string[]; sampled_urls: string[] };
  /** Null only on a stored report from ruleset 1.x, which had no readiness list (report/stored.ts). */
  ai_readiness: { intro: string; items: ReadinessItem[] } | null;
  manual_review: { id: string; what: string; why: string; source: string; source_ids: string[] }[];
  not_scored: { intro: string; claims: { claim: string; verdict: string; evidence: string; source: string }[] };
  methodology: {
    classes: { class: RuleClass; label: string; weight: number; severity: Severity; assigned_when: string }[];
    formulas: string[];
    weights_note: string;
    rules: { rule_id: string; title: string; class: RuleClass; weight: number; gate: string | null; category: CategoryKey; status_summary: Record<string, number> }[];
    sources: { id: string; title: string; url: string; last_updated: string; verified: string }[];
    enabled_house_conventions: string[];
  };
}
