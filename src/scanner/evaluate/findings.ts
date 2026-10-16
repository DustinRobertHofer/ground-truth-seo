/**
 * Turns rule unit results into finding records (PRODUCT.md §8).
 * Reasons are filled templates, never generated prose.
 */

import { SOURCES_BY_ID } from "../rules/sources.js";
import { OUTCOME_STATEMENTS, VERIFY_STEPS } from "../rules/statements.js";
import { CLASS_SEVERITY, type Engine, type FeatureName, type Rule } from "../rules/types.js";
import type { CitationOut, Finding, FindingStatus, Observed } from "../report/types.js";
import { formatInt } from "./core/text.js";
import type { EvaluationContext } from "./context.js";

export interface UnitResult {
  unit: string;
  status: FindingStatus;
  condition?: string;
  observed?: Observed;
  /** Explanatory text for not_evaluated / not_applicable / manual results. */
  note?: string;
  related?: string[];
  /** For rules whose gate varies by feature (SEO-SD-02). */
  feature?: FeatureName;
  /** Extra citations, e.g. the feature registry quote. */
  extraCitations?: { source_id: string; section: string; quote: string | null }[];
}

export type RuleEvaluator = (ctx: EvaluationContext) => UnitResult[];

export const pass = (unit: string, observed: Observed = {}): UnitResult => ({ unit, status: "pass", observed });
export const fail = (unit: string, condition: string, observed: Observed, extra: Partial<UnitResult> = {}): UnitResult => ({
  unit,
  status: "fail",
  condition,
  observed,
  ...extra,
});
export const info = (unit: string, condition: string, observed: Observed, extra: Partial<UnitResult> = {}): UnitResult => ({
  unit,
  status: "info",
  condition,
  observed,
  ...extra,
});
/**
 * A documented practice the unit has not adopted (KNOWLEDGE.md §1.3,
 * "Opportunity" conditions). Counts as unmet in the score, like a fail.
 */
export const opportunity = (unit: string, condition: string, observed: Observed, extra: Partial<UnitResult> = {}): UnitResult => ({
  unit,
  status: "opportunity",
  condition,
  observed,
  ...extra,
});
export const notEvaluated = (unit: string, note: string): UnitResult => ({ unit, status: "not_evaluated", note });
export const notApplicable = (unit: string, note: string): UnitResult => ({ unit, status: "not_applicable", note });

/** Fill a template from observed values with the fixed formats of KNOWLEDGE.md §1.5. */
export function fillTemplate(template: string, observed: Observed): string {
  return template.replace(/\{([a-z][a-z0-9_]*)\}/g, (match, name: string) => {
    const value = observed[name];
    if (value === undefined) {
      if (name.endsWith("_clause")) return "";
      throw new Error(`template placeholder {${name}} has no observed value`);
    }
    return typeof value === "number" ? formatInt(value) : value;
  });
}

export function gateLabel(rule: Rule, feature?: FeatureName): string | null {
  if (!rule.gate) return null;
  if (rule.gate.kind === "indexing") return "indexing";
  return `feature:${feature ?? rule.gate.name}`;
}

function engineName(engine: Engine): string {
  return engine === "google" ? "Google" : "Bing";
}

function engineList(engines: Engine[]): string {
  const names = engines.map(engineName);
  if (names.length === 0) return "the engine";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function outcomeFor(rule: Rule, ctx: EvaluationContext): string | null {
  if (rule.outcome) return rule.outcome;
  if (rule.gate?.kind === "indexing") return OUTCOME_STATEMENTS.find((s) => s.applies === "gate_indexing")!.text;
  if (rule.gate?.kind === "feature") {
    const text = OUTCOME_STATEMENTS.find((s) => s.applies === "gate_feature")!.text;
    // The second sentence applies only to structured-data features.
    if (rule.category !== "structured_data") return text.split(". ")[0] + ".";
    return text;
  }
  if (rule.class === "C1") return OUTCOME_STATEMENTS.find((s) => s.applies === "c1")!.text;
  if (rule.class === "C2") {
    const engines = rule.engines.filter((e) => ctx.engines.has(e));
    const list = engineList(engines.length > 0 ? engines : rule.engines);
    return OUTCOME_STATEMENTS.find((s) => s.applies === "c2")!.text.replace("{engine}", list).replace("{Engine}", list);
  }
  if (rule.class === "C3") {
    return OUTCOME_STATEMENTS.find((s) => s.applies === "c3")!.text.replace("{standard}", rule.standard ?? "the standard");
  }
  return null;
}

export function verifyFor(rule: Rule, ctx: EvaluationContext): string[] {
  const steps = [VERIFY_STEPS.find((s) => s.engine === "any")!.text];
  const engines: Engine[] = rule.engines.length > 0 ? rule.engines : ["google", "bing"];
  for (const engine of ["google", "bing"] as const) {
    if (engines.includes(engine) && ctx.engines.has(engine)) {
      steps.push(VERIFY_STEPS.find((s) => s.engine === engine)!.text);
    }
  }
  return steps;
}

export function citationsFor(rule: Rule, condition: string | null, ctx: EvaluationContext, extra: UnitResult["extraCitations"] = []): CitationOut[] {
  const out: CitationOut[] = [];
  for (const citation of rule.citations) {
    if (citation.conditions && (condition === null || !citation.conditions.includes(condition))) continue;
    if (citation.source_id === "MS-BING-RANK" && !ctx.engines.has("bing")) continue;
    const source = SOURCES_BY_ID.get(citation.source_id);
    out.push({
      source_id: citation.source_id,
      section: citation.section,
      quote: citation.quote,
      source_last_updated: source?.last_updated ?? "not stated",
    });
  }
  for (const citation of extra) {
    const source = SOURCES_BY_ID.get(citation.source_id);
    out.push({ ...citation, source_last_updated: source?.last_updated ?? "not stated" });
  }
  return out;
}

export function buildFinding(rule: Rule, result: UnitResult, ctx: EvaluationContext, weight: number): Finding {
  const condition = result.condition ?? null;
  const conditionDef = condition ? rule.conditions.find((c) => c.code === condition) : undefined;
  const observed = result.observed ?? {};
  let reason: string | null = null;
  if (conditionDef) reason = fillTemplate(conditionDef.reason, observed);
  else if (result.note) reason = result.note;
  const isFail = result.status === "fail";
  const isOpportunity = result.status === "opportunity";
  const isInfo = result.status === "info";
  // Opportunities carry the same fix, outcome, verification and citations as a fail.
  const actionable = isFail || isOpportunity;
  return {
    rule_id: rule.id,
    condition,
    status: result.status,
    class: rule.class,
    weight,
    severity: isInfo ? "info" : CLASS_SEVERITY[rule.class],
    gate: gateLabel(rule, result.feature),
    category: rule.category,
    engines: rule.engines,
    scope: rule.scope,
    unit: result.unit,
    observed,
    expected: rule.title,
    reason,
    recommendation: actionable ? rule.fix : null,
    outcome: actionable ? outcomeFor(rule, ctx) : null,
    verify: actionable ? verifyFor(rule, ctx) : [],
    citations: actionable || isInfo ? citationsFor(rule, condition, ctx, result.extraCitations) : [],
    related: result.related ?? rule.related ?? [],
  };
}
