/**
 * Home page performance diagnostics (PRODUCT.md §22, KNOWLEDGE.md §13).
 *
 * `PerformanceInput` is what acquisition stores: the Chrome UX Report records
 * and the PageSpeed Insights lab runs, normalized to integers. The diagnosis
 * (`PerformanceResult`) is a pure function of it. Neither ever carries a key.
 */

import type { FieldMetricId, MetricId, SubpartKey } from "./knowledge.js";

export type FormFactor = "PHONE" | "DESKTOP";
export type Strategy = "mobile" | "desktop";
export type Rating = "good" | "needs_improvement" | "poor";

/** Why an input could not be read (KNOWLEDGE.md §13.6 `{error}`). Never a message from the API. */
export type InputError =
  | { kind: "http"; status: number }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "invalid" }
  | { kind: "lighthouse"; code: string | null };

// ---------------------------------------------------------------------------
// Stored inputs
// ---------------------------------------------------------------------------

export interface HistogramBin {
  /** Integer milliseconds, or thousandths for CLS. */
  start: number;
  end: number | null;
  /** Share of page loads in integer basis points (10,000 = 100%). */
  density_bp: number;
}

export interface FieldMetric {
  p75: number | null;
  bins: HistogramBin[];
}

export interface FieldRecord {
  scope: "url" | "origin";
  target: string;
  form_factor: FormFactor;
  first_date: string;
  last_date: string;
  metrics: Record<FieldMetricId, FieldMetric | null>;
  /** LCP image subparts at the 75th percentile, in integer milliseconds. */
  lcp_subparts: Record<SubpartKey, number | null>;
  /** LCP resource type fractions in basis points, keyed as the API names them. */
  lcp_resource_type: Record<string, number> | null;
}

export interface FieldInput {
  form_factor: FormFactor;
  /** `ok` with a record, `none` when neither the URL nor the origin has data, `failed` on an error. */
  status: "ok" | "none" | "failed";
  record: FieldRecord | null;
  error: InputError | null;
}

export interface LabNode {
  selector: string;
  snippet: string;
}

export interface LabRun {
  strategy: Strategy;
  lighthouse_version: string;
  requested_url: string;
  final_url: string;
  fetch_time: string;
  /** Integer milliseconds; CLS in thousandths. Null when the run lacks the audit. */
  metrics: { fcp_ms: number | null; lcp_ms: number | null; tbt_ms: number | null; cls_thousandths: number | null; speed_index_ms: number | null };
  lcp_element: LabNode | null;
  /** lcp-breakdown-insight, integer milliseconds; a subpart the run does not list is 0. */
  lcp_breakdown: Record<SubpartKey, number> | null;
  lcp_discovery: { eagerly_loaded: boolean | null; discoverable: boolean | null; priority_hinted: boolean | null } | null;
  render_blocking: { items: { url: string; bytes: number | null; wasted_ms: number | null }[]; fcp_saving_ms: number | null } | null;
  font_display: { url: string; wasted_ms: number | null }[] | null;
  document_latency: { no_redirects: boolean | null; redirect_ms: number | null; server_fast: boolean | null; server_ms: number | null } | null;
  long_tasks: { url: string; duration_ms: number; start_ms: number | null }[] | null;
  unused_javascript: { url: string; total_bytes: number | null; wasted_bytes: number }[] | null;
  image_delivery: { url: string; total_bytes: number | null; wasted_bytes: number }[] | null;
  /** Source locations as "url:line:column" (lines and columns from 1). */
  forced_reflow: { source: string; reflow_ms: number | null }[] | null;
  layout_shifts: { elements: (LabNode & { score_thousandths: number })[]; causes: Record<string, number> } | null;
  unsized_images: { url: string; selector: string | null }[] | null;
  /** bf-cache reasons whose failure type is Actionable, in the run's order. */
  bfcache: { actionable: string[] } | null;
}

export interface LabInput {
  strategy: Strategy;
  status: "ok" | "failed";
  run: LabRun | null;
  error: InputError | null;
}

export interface PerformanceInput {
  home_url: string;
  origin: string;
  /** When acquisition finished (ISO 8601). Recorded, never read by the diagnosis. */
  acquired_at: string;
  field: { requested: boolean; devices: FieldInput[] };
  lab: { requested: boolean; runs: LabInput[] };
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface CitationOut {
  source_id: string;
  section: string;
  quote: string;
  title: string;
  url: string;
  last_updated: string;
}

export interface MetricValue {
  metric: MetricId;
  name: string;
  core_web_vital: boolean;
  value: number | null;
  /** Formatted as KNOWLEDGE.md §1.5: "2,140 ms", "0.105", or "no data". */
  display: string;
  rating: Rating | null;
  /** Field metrics only: the three histogram bins with their rating. */
  bins: { rating: Rating; start: number; end: number | null; share_bp: number; range: string; share: string }[];
}

export interface FieldView {
  scope: "url" | "origin";
  scope_label: string;
  target: string;
  first_date: string;
  last_date: string;
  metrics: MetricValue[];
  assessment: "passes" | "does_not_pass" | "cannot_assess";
  lcp_subparts: { key: SubpartKey; name: string; value_ms: number | null; display: string }[];
  lcp_resource_type: { type: string; share_bp: number; share: string }[];
}

export interface LabView {
  lighthouse_version: string;
  final_url: string;
  fetch_time: string;
  metrics: MetricValue[];
  lcp_element: LabNode | null;
  /** Null when the run has no lcp-breakdown-insight. */
  lcp_breakdown: { total_ms: number; subparts: { key: SubpartKey; name: string; value_ms: number; display: string; share_pct: number; optimal: string }[] } | null;
}

export interface DeviceResult {
  form_factor: FormFactor;
  /** "phones" or "desktops". */
  device: string;
  /** "mobile" or "desktop". */
  run: Strategy;
  field: FieldView | null;
  lab: LabView | null;
}

export interface Evidence {
  /** A URL, an element selector or a reason. */
  label: string;
  /** Observed values for it, formatted, or "". */
  detail: string;
}

export interface DiagnosticResult {
  id: string;
  title: string;
  metric: FieldMetricId;
  condition: string;
  form_factor: FormFactor;
  device: string;
  /** Where the condition's values come from. */
  input: "field" | "lab";
  statement: string;
  recommendation: string;
  evidence: Evidence[];
  citations: CitationOut[];
}

export interface StatementOut {
  key: string;
  text: string;
  /** Null for a scanner statement. */
  citation: CitationOut | null;
}

export interface PerformanceResult {
  diagnostics_version: string;
  home_url: string;
  origin: string;
  devices: DeviceResult[];
  diagnostics: DiagnosticResult[];
  /** §13.3 and §13.4 citations, shown with the metrics and the breakdown. */
  metric_citations: CitationOut[];
  breakdown_citations: CitationOut[];
  statements: StatementOut[];
}

/** What `performance.json` holds: the stored inputs and the result built from them. */
export interface PerformanceFile {
  input: PerformanceInput;
  result: PerformanceResult;
}
