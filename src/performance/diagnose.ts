/**
 * The home page performance diagnosis (PRODUCT.md §22.2, KNOWLEDGE.md §13): a
 * pure function of the stored inputs. No network, clock, randomness, locale or
 * floating point: every value is an integer the acquirer stored, and every
 * sentence is a §13 template filled with observed values.
 */

import { formatExamples, formatInt, formatMs, formatThousandths } from "../scanner/evaluate/core/text.js";
import { SOURCES_BY_ID } from "../scanner/rules/sources.js";
import {
  BREAKDOWN_CITATIONS,
  CLS_CAUSES,
  DELAY_SHARE_PERCENT,
  DIAGNOSTICS,
  INPUT_ERROR_TEXT,
  LCP_SUBPARTS,
  METRIC_CITATIONS,
  METRICS,
  PERFORMANCE_DIAGNOSTICS_VERSION,
  PERFORMANCE_STATEMENTS,
  type FieldMetricId,
  type PerformanceCitation,
  type PerformanceDiagnostic,
  type PerformanceMetric,
} from "./knowledge.js";
import type {
  CitationOut,
  DeviceResult,
  DiagnosticResult,
  Evidence,
  FieldRecord,
  FieldView,
  FormFactor,
  InputError,
  LabRun,
  LabView,
  MetricValue,
  PerformanceInput,
  PerformanceResult,
  Rating,
  StatementOut,
  Strategy,
} from "./types.js";

const DEVICES: readonly { form_factor: FormFactor; device: string; run: Strategy }[] = [
  { form_factor: "PHONE", device: "phones", run: "mobile" },
  { form_factor: "DESKTOP", device: "desktops", run: "desktop" },
];

/** Fills `{name}` placeholders; a placeholder without a value is a bug, so it throws. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`No value for {${name}} in "${template}"`);
    return value;
  });
}

function citationOut(c: { source_id: string; section: string; quote: string }): CitationOut {
  const source = SOURCES_BY_ID.get(c.source_id);
  if (!source) throw new Error(`Unregistered source ${c.source_id}`);
  return { source_id: c.source_id, section: c.section, quote: c.quote, title: source.title, url: source.url, last_updated: source.last_updated };
}

function citationsFor(citations: readonly PerformanceCitation[], condition: string): CitationOut[] {
  return citations.filter((c) => c.conditions === null || c.conditions.includes(condition)).map(citationOut);
}

// ---------------------------------------------------------------------------
// Formats (KNOWLEDGE.md §1.5 and §13.1)
// ---------------------------------------------------------------------------

function metricDef(id: string): PerformanceMetric {
  return METRICS.find((m) => m.id === id)!;
}

function formatValue(def: PerformanceMetric, value: number | null): string {
  if (value === null) return "no data";
  return def.unit === "thousandths" ? formatThousandths(value) : formatMs(value);
}

const bytes = (n: number) => `${formatInt(n)} bytes`;

/** Basis points as a percentage with two decimals: 8213 → "82.13%". */
function percentBp(bp: number): string {
  return `${formatInt(Math.trunc(bp / 100))}.${String(bp % 100).padStart(2, "0")}%`;
}

export function rate(def: PerformanceMetric, value: number | null): Rating | null {
  if (value === null || def.good === null || def.poor === null) return null;
  if (value <= def.good) return "good";
  if (value > def.poor) return "poor";
  return "needs_improvement";
}

function binRating(def: PerformanceMetric, start: number, end: number | null): Rating {
  if (end !== null && def.good !== null && end <= def.good) return "good";
  if (def.poor !== null && start >= def.poor) return "poor";
  return "needs_improvement";
}

function binRange(def: PerformanceMetric, start: number, end: number | null): string {
  const f = (v: number) => (def.unit === "thousandths" ? formatThousandths(v) : formatInt(v));
  const unit = def.unit === "thousandths" ? "" : " ms";
  return end === null ? `${f(start)}${unit} and above` : `${f(start)} to ${f(end)}${unit}`;
}

function scopeLabel(record: FieldRecord): string {
  return record.scope === "url" ? "the home page" : `the origin ${record.target}`;
}

function errorText(error: InputError | null): string {
  if (!error) return INPUT_ERROR_TEXT.invalid;
  switch (error.kind) {
    case "http":
      return INPUT_ERROR_TEXT.http.replace("<status>", String(error.status));
    case "timeout":
      return INPUT_ERROR_TEXT.timeout;
    case "network":
      return INPUT_ERROR_TEXT.network;
    case "invalid":
      return INPUT_ERROR_TEXT.invalid;
    case "lighthouse":
      return INPUT_ERROR_TEXT.lighthouse.replace("<code>", error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : INPUT_ERROR_TEXT.unknown_code);
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function fieldView(record: FieldRecord): FieldView {
  const metrics: MetricValue[] = [];
  for (const def of METRICS) {
    if (def.fieldInput === null || def.id === "TBT") continue;
    const m = record.metrics[def.id as FieldMetricId];
    const value = m?.p75 ?? null;
    metrics.push({
      metric: def.id,
      name: def.name,
      core_web_vital: def.coreWebVital,
      value,
      display: formatValue(def, value),
      rating: rate(def, value),
      bins: (m?.bins ?? []).map((b) => ({
        rating: binRating(def, b.start, b.end),
        start: b.start,
        end: b.end,
        share_bp: b.density_bp,
        range: binRange(def, b.start, b.end),
        share: percentBp(b.density_bp),
      })),
    });
  }
  const rating = (id: string) => metrics.find((m) => m.metric === id)?.rating ?? null;
  let assessment: FieldView["assessment"];
  if (rating("LCP") === null || rating("CLS") === null) assessment = "cannot_assess";
  else if (rating("LCP") === "good" && rating("CLS") === "good" && (rating("INP") === null || rating("INP") === "good")) assessment = "passes";
  else assessment = "does_not_pass";
  return {
    scope: record.scope,
    scope_label: scopeLabel(record),
    target: record.target,
    first_date: record.first_date,
    last_date: record.last_date,
    metrics,
    assessment,
    lcp_subparts: LCP_SUBPARTS.map((s) => {
      const v = record.lcp_subparts[s.key];
      return { key: s.key, name: s.name, value_ms: v, display: v === null ? "no data" : formatMs(v) };
    }),
    lcp_resource_type: Object.keys(record.lcp_resource_type ?? {})
      .sort()
      .map((type) => ({ type, share_bp: record.lcp_resource_type![type]!, share: percentBp(record.lcp_resource_type![type]!) })),
  };
}

const LAB_VALUE: Record<string, (r: LabRun) => number | null> = {
  LCP: (r) => r.metrics.lcp_ms,
  CLS: (r) => r.metrics.cls_thousandths,
  FCP: (r) => r.metrics.fcp_ms,
  TBT: (r) => r.metrics.tbt_ms,
};

function breakdownOf(run: LabRun): LabView["lcp_breakdown"] {
  const b = run.lcp_breakdown;
  if (!b) return null;
  const total = b.ttfb + b.load_delay + b.load_duration + b.render_delay;
  return {
    total_ms: total,
    subparts: LCP_SUBPARTS.map((s) => ({
      key: s.key,
      name: s.name,
      value_ms: b[s.key],
      display: formatMs(b[s.key]),
      share_pct: total > 0 ? Math.floor((b[s.key] * 100) / total) : 0,
      optimal: s.optimal,
    })),
  };
}

function labView(run: LabRun): LabView {
  const metrics: MetricValue[] = [];
  for (const def of METRICS) {
    if (def.labInput === null) continue;
    const value = LAB_VALUE[def.id]?.(run) ?? null;
    metrics.push({ metric: def.id, name: def.name, core_web_vital: def.coreWebVital, value, display: formatValue(def, value), rating: rate(def, value), bins: [] });
  }
  return { lighthouse_version: run.lighthouse_version, final_url: run.final_url, fetch_time: run.fetch_time, metrics, lcp_element: run.lcp_element, lcp_breakdown: breakdownOf(run) };
}

// ---------------------------------------------------------------------------
// Diagnostics (KNOWLEDGE.md §13.5)
// ---------------------------------------------------------------------------

interface Shown {
  condition: string;
  input: "field" | "lab";
  values: Record<string, string>;
  evidence: Evidence[];
}

interface DeviceInputs {
  form_factor: FormFactor;
  device: string;
  run: Strategy;
  field: FieldRecord | null;
  lab: LabRun | null;
}

type Detector = (d: DeviceInputs) => Shown[];

const p75 = (record: FieldRecord | null, id: FieldMetricId) => record?.metrics[id]?.p75 ?? null;

function fieldValues(d: DeviceInputs, id: FieldMetricId): Record<string, string> {
  const r = d.field!;
  return { device: d.device, value: formatValue(metricDef(id), p75(r, id)), scope_label: scopeLabel(r), first_date: r.first_date, last_date: r.last_date };
}

function elementLabel(run: LabRun): string {
  return run.lcp_element?.selector ?? "not named by the run";
}

function elementEvidence(run: LabRun): Evidence[] {
  return run.lcp_element ? [{ label: run.lcp_element.selector, detail: run.lcp_element.snippet }] : [];
}

function delayShown(d: DeviceInputs, key: "load_delay" | "render_delay", condition: string): Shown[] {
  const run = d.lab;
  const b = run?.lcp_breakdown;
  if (!run || !b) return [];
  const total = b.ttfb + b.load_delay + b.load_duration + b.render_delay;
  if (total <= 0 || b[key] * 100 < DELAY_SHARE_PERCENT * total) return [];
  const breakdown = breakdownOf(run)!;
  return [
    {
      condition,
      input: "lab",
      values: { run: d.run, element: elementLabel(run), value: formatMs(b[key]), share: String(Math.floor((b[key] * 100) / total)), lcp: formatMs(total) },
      evidence: [...elementEvidence(run), ...breakdown.subparts.map((s) => ({ label: s.name, detail: `${s.display} (${s.share_pct}%, optimal ${s.optimal})` }))],
    },
  ];
}

function discoveryShown(d: DeviceInputs, field: "eagerly_loaded" | "discoverable" | "priority_hinted", condition: string): Shown[] {
  const run = d.lab;
  if (!run || run.lcp_discovery?.[field] !== false) return [];
  return [{ condition, input: "lab", values: { run: d.run, element: elementLabel(run) }, evidence: elementEvidence(run) }];
}

function listShown<T>(d: DeviceInputs, items: T[] | null | undefined, condition: string, label: (t: T) => string, detail: (t: T) => string, extra: (items: T[]) => Record<string, string> = () => ({})): Shown[] {
  if (!d.lab || !items || items.length === 0) return [];
  return [
    {
      condition,
      input: "lab",
      values: { run: d.run, count: formatInt(items.length), examples: formatExamples(items.map(label)), ...extra(items) },
      evidence: items.map((t) => ({ label: label(t), detail: detail(t) })),
    },
  ];
}

const msOr = (v: number | null) => (v === null ? "" : formatMs(v));

const DETECTORS: Record<string, Detector> = {
  "PERF-LCP-01": (d) => delayShown(d, "load_delay", "load_delay"),
  "PERF-LCP-02": (d) => discoveryShown(d, "eagerly_loaded", "lazy"),
  "PERF-LCP-03": (d) => discoveryShown(d, "discoverable", "not_discoverable"),
  "PERF-LCP-04": (d) => discoveryShown(d, "priority_hinted", "no_priority"),
  "PERF-LCP-05": (d) => delayShown(d, "render_delay", "render_delay"),
  "PERF-LCP-06": (d) => {
    const items = d.lab?.image_delivery?.filter((i) => i.wasted_bytes > 0) ?? [];
    if (!d.lab || items.length === 0) return [];
    let top = items[0]!;
    for (const i of items) if (i.wasted_bytes > top.wasted_bytes) top = i;
    const total = items.reduce((sum, i) => sum + i.wasted_bytes, 0);
    return [
      {
        condition: "smaller",
        input: "lab",
        values: { run: d.run, count: formatInt(items.length), bytes: bytes(total), top_bytes: bytes(top.wasted_bytes), top_url: top.url },
        evidence: items.map((i) => ({ label: i.url, detail: `${i.total_bytes === null ? "" : `${bytes(i.total_bytes)}, `}estimated saving ${bytes(i.wasted_bytes)}` })),
      },
    ];
  },
  "PERF-INP-01": (d) => {
    const out: Shown[] = [];
    const inp = p75(d.field, "INP");
    if (d.field && inp !== null && inp > metricDef("INP").good!) out.push({ condition: "field", input: "field", values: fieldValues(d, "INP"), evidence: [] });
    const tasks = d.lab?.long_tasks ?? [];
    if (d.lab && tasks.length > 0) {
      let longest = tasks[0]!;
      for (const t of tasks) if (t.duration_ms > longest.duration_ms) longest = t;
      out.push({
        condition: "long_tasks",
        input: "lab",
        values: { run: d.run, count: formatInt(tasks.length), longest: formatMs(longest.duration_ms), longest_url: longest.url, tbt: formatValue(metricDef("TBT"), d.lab.metrics.tbt_ms) },
        evidence: tasks.map((t) => ({ label: t.url, detail: t.start_ms === null ? formatMs(t.duration_ms) : `${formatMs(t.duration_ms)}, starting at ${formatMs(t.start_ms)}` })),
      });
    }
    return out;
  },
  "PERF-INP-02": (d) =>
    listShown(
      d,
      d.lab?.unused_javascript,
      "unused",
      (i) => i.url,
      (i) => `${bytes(i.wasted_bytes)} unused${i.total_bytes === null ? "" : ` of ${bytes(i.total_bytes)}`}`,
      (items) => ({ bytes: bytes(items.reduce((s, i) => s + i.wasted_bytes, 0)) }),
    ),
  "PERF-INP-03": (d) => listShown(d, d.lab?.forced_reflow, "forced_reflow", (i) => i.source, (i) => msOr(i.reflow_ms)),
  "PERF-CLS-01": (d) => {
    const out: Shown[] = [];
    const good = metricDef("CLS").good!;
    const field = p75(d.field, "CLS");
    const lab = d.lab?.metrics.cls_thousandths ?? null;
    const labPresent = d.lab !== null && lab !== null;
    if (d.field && field !== null && field > good) {
      if (!labPresent || lab! > good) out.push({ condition: "field", input: "field", values: fieldValues(d, "CLS"), evidence: [] });
      else out.push({ condition: "post_load", input: "field", values: { ...fieldValues(d, "CLS"), run: d.run, lab_value: formatThousandths(lab!) }, evidence: [] });
    }
    if (d.lab && lab !== null && lab > good) {
      const shifts = d.lab.layout_shifts;
      const elements = [...(shifts?.elements ?? [])].sort((a, b) => b.score_thousandths - a.score_thousandths);
      const counted = CLS_CAUSES.filter((c) => (shifts?.causes[c.cause] ?? 0) > 0).map((c) => {
        const n = shifts!.causes[c.cause]!;
        return `${formatInt(n)} ${n === 1 ? c.one : c.many}`;
      });
      const causes = counted.length <= 1 ? counted.join("") : `${counted.slice(0, -1).join(", ")} and ${counted[counted.length - 1]}`;
      out.push({
        condition: "lab",
        input: "lab",
        values: {
          run: d.run,
          value: formatThousandths(lab),
          examples: elements.length > 0 ? formatExamples(elements.map((e) => e.selector)) : "not named by the run",
          causes_clause: causes ? ` Lighthouse traced shifts to ${causes}.` : "",
        },
        evidence: elements.map((e) => ({ label: e.selector, detail: `${formatThousandths(e.score_thousandths)}${e.snippet ? ` · ${e.snippet}` : ""}` })),
      });
    }
    return out;
  },
  "PERF-CLS-02": (d) => listShown(d, d.lab?.unsized_images, "unsized", (i) => i.url, (i) => i.selector ?? ""),
  "PERF-CLS-03": (d) => {
    const reasons = d.lab?.bfcache?.actionable ?? [];
    if (!d.lab || reasons.length === 0) return [];
    return [{ condition: "blocked", input: "lab", values: { run: d.run, reasons: reasons.join("; ") }, evidence: reasons.map((r) => ({ label: r, detail: "" })) }];
  },
  "PERF-FCP-01": (d) => {
    const rb = d.lab?.render_blocking;
    return listShown(
      d,
      rb?.items,
      "blocking",
      (i) => i.url,
      (i) => [i.bytes === null ? "" : bytes(i.bytes), i.wasted_ms ? `estimated ${formatMs(i.wasted_ms)}` : ""].filter(Boolean).join(", "),
      () => ({ saving_clause: rb?.fcp_saving_ms ? ` Lighthouse estimates the first render could come ${formatMs(rb.fcp_saving_ms)} earlier without them.` : "" }),
    );
  },
  "PERF-FCP-02": (d) => listShown(d, d.lab?.font_display, "font_display", (i) => i.url, (i) => (i.wasted_ms ? `estimated ${formatMs(i.wasted_ms)}` : "")),
  "PERF-TTFB-01": (d) => {
    const dl = d.lab?.document_latency;
    if (!d.lab || dl?.no_redirects !== false || dl.redirect_ms === null) return [];
    return [{ condition: "redirects", input: "lab", values: { run: d.run, url: d.lab.requested_url, value: formatMs(dl.redirect_ms) }, evidence: [{ label: d.lab.requested_url, detail: `final URL ${d.lab.final_url}` }] }];
  },
  "PERF-TTFB-02": (d) => {
    const out: Shown[] = [];
    const ttfb = p75(d.field, "TTFB");
    if (d.field && ttfb !== null && ttfb > metricDef("TTFB").good!) out.push({ condition: "field", input: "field", values: fieldValues(d, "TTFB"), evidence: [] });
    const dl = d.lab?.document_latency;
    if (d.lab && dl?.server_fast === false && dl.server_ms !== null) out.push({ condition: "lab", input: "lab", values: { run: d.run, value: formatMs(dl.server_ms) }, evidence: [] });
    return out;
  },
};

function diagnose(diagnostic: PerformanceDiagnostic, inputs: DeviceInputs[]): DiagnosticResult[] {
  const detect = DETECTORS[diagnostic.id];
  if (!detect) throw new Error(`No detector for ${diagnostic.id}`);
  const out: DiagnosticResult[] = [];
  // §13.1: by condition (in block order), then device (phones first).
  const shown = inputs.flatMap((d) => detect(d).map((s) => ({ d, s })));
  for (const condition of diagnostic.conditions) {
    for (const { d, s } of shown) {
      if (s.condition !== condition.code) continue;
      out.push({
        id: diagnostic.id,
        title: diagnostic.title,
        metric: diagnostic.metric,
        condition: condition.code,
        form_factor: d.form_factor,
        device: d.device,
        input: s.input,
        statement: fillTemplate(condition.statement, s.values),
        recommendation: diagnostic.recommendation,
        evidence: s.evidence,
        citations: citationsFor(diagnostic.citations, condition.code),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Statements (KNOWLEDGE.md §13.6)
// ---------------------------------------------------------------------------

function statement(key: string, values: Record<string, string> = {}): StatementOut {
  const s = PERFORMANCE_STATEMENTS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown performance statement ${key}`);
  let citation: CitationOut | null = null;
  if (s.source !== "Scanner statement") {
    const [sourceId, section] = s.source.split(" · ") as [string, string];
    const inner = /"(.+)"/.exec(s.text);
    citation = citationOut({ source_id: sourceId, section, quote: inner ? inner[1]! : s.text });
  }
  return { key, text: fillTemplate(s.text, values), citation };
}

function statementsFor(input: PerformanceInput): StatementOut[] {
  const out = ["advisory", "field_first", "lab_one_run", "no_lab_score"].map((k) => statement(k));
  if (!input.field.requested) out.push(statement("field_off"));
  for (const { form_factor, device } of DEVICES) {
    const f = input.field.devices.find((x) => x.form_factor === form_factor);
    if (!input.field.requested || !f) continue;
    if (f.status === "none") out.push(statement("field_none", { device }));
  }
  for (const { form_factor, device } of DEVICES) {
    const f = input.field.devices.find((x) => x.form_factor === form_factor);
    if (f?.status === "ok" && f.record?.scope === "origin") out.push(statement("field_origin", { device }));
  }
  for (const { form_factor, device } of DEVICES) {
    const f = input.field.devices.find((x) => x.form_factor === form_factor);
    if (f?.status === "failed") out.push(statement("field_failed", { device, error: errorText(f.error) }));
  }
  if (!input.lab.requested) out.push(statement("lab_off"));
  for (const { run } of DEVICES) {
    const l = input.lab.runs.find((x) => x.strategy === run);
    if (l?.status === "failed") out.push(statement("lab_failed", { run, error: errorText(l.error) }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** KNOWLEDGE.md §13 applied to stored inputs. The same input always gives the same result. */
export function diagnosePerformance(input: PerformanceInput): PerformanceResult {
  const inputs: DeviceInputs[] = DEVICES.map(({ form_factor, device, run }) => {
    const f = input.field.devices.find((x) => x.form_factor === form_factor);
    const l = input.lab.runs.find((x) => x.strategy === run);
    return { form_factor, device, run, field: f?.status === "ok" ? f.record : null, lab: l?.status === "ok" ? l.run : null };
  });
  const devices: DeviceResult[] = inputs.map((d) => ({
    form_factor: d.form_factor,
    device: d.device,
    run: d.run,
    field: d.field ? fieldView(d.field) : null,
    lab: d.lab ? labView(d.lab) : null,
  }));
  return {
    diagnostics_version: PERFORMANCE_DIAGNOSTICS_VERSION,
    home_url: input.home_url,
    origin: input.origin,
    devices,
    diagnostics: DIAGNOSTICS.flatMap((diagnostic) => diagnose(diagnostic, inputs)),
    metric_citations: METRIC_CITATIONS.map(citationOut),
    breakdown_citations: BREAKDOWN_CITATIONS.map(citationOut),
    statements: statementsFor(input),
  };
}
