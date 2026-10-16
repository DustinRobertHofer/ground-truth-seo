/**
 * evaluate(snapshot, config) -> report. A pure function of its inputs.
 */

import { configHash, type ScanConfig } from "../config.js";
import { RULES, RULESET_VERSION } from "../rules/index.js";
import type { Rule } from "../rules/types.js";
import { buildReport } from "../report/build.js";
import type { Report } from "../report/types.js";
import type { Snapshot } from "../snapshot/types.js";
import { EvaluationContext } from "./context.js";
import { notApplicable, notEvaluated, type UnitResult } from "./findings.js";
import { EVALUATORS } from "./rules/index.js";

export const SCANNER_VERSION = "0.1.0";

export interface RuleRun {
  rule: Rule;
  /** The effective weight (house conventions may be given one). */
  weight: number;
  results: UnitResult[];
  /** Whether the rule's evaluator ran at all (false for engine/requirement skips). */
  ran: boolean;
}

function requirementBlocked(rule: Rule, config: ScanConfig): string | null {
  for (const requirement of rule.requires ?? []) {
    if (requirement === "rendered" && !config.render) return "Rendered mode is off (config.render = false).";
    if (requirement === "crux" && !config.crux) return "Chrome UX Report data is not configured (config.crux = false).";
    if (requirement === "parity" && !config.parity_check) return "The parity check is off (config.parity_check = false).";
    if (requirement === "owner" && config.robots_mode !== "owner") return "Owner mode is off (config.robots_mode = respect).";
  }
  return null;
}

function engineBlocked(rule: Rule, ctx: EvaluationContext): boolean {
  if (rule.engines.length === 0) return false;
  return !rule.engines.some((engine) => ctx.engines.has(engine));
}

function runRule(rule: Rule, ctx: EvaluationContext): RuleRun {
  const config = ctx.config;
  const weight = rule.houseConvention ? (config.house_convention_weights[rule.id] ?? 0) : rule.weight;
  if (engineBlocked(rule, ctx)) {
    return { rule, weight, results: [notApplicable("site", `Documented only by ${rule.engines.join(" and ")}, which is not a selected engine.`)], ran: false };
  }
  const blocked = requirementBlocked(rule, config);
  if (blocked) return { rule, weight, results: [notEvaluated("site", blocked)], ran: false };
  const evaluator = EVALUATORS[rule.id];
  if (!evaluator) return { rule, weight, results: [notEvaluated("site", "This rule is not implemented in this scanner version.")], ran: false };
  let results = evaluator(ctx);
  // Conditions with their own requirement are not evaluated without the input.
  results = results.filter((result) => {
    if (!result.condition) return true;
    const condition = rule.conditions.find((c) => c.code === result.condition);
    if (!condition?.requires) return true;
    return requirementBlocked({ ...rule, requires: [condition.requires] }, config) === null;
  });
  // Page-scoped rules apply to P, so members of B are judged by their gate alone (KNOWLEDGE.md §3.2).
  if (rule.gate?.kind !== "indexing" && (rule.scopeKind === "page" || rule.scopeKind === "intended")) {
    results = results.filter((result) => !ctx.isBlocked(result.unit));
  }
  return { rule, weight, results, ran: true };
}

export function evaluateRuns(snapshot: Snapshot, config: ScanConfig): { ctx: EvaluationContext; runs: RuleRun[] } {
  const ctx = new EvaluationContext(snapshot, config);
  const active = RULES.filter((rule) => !rule.houseConvention || config.house_conventions);
  const gates = active.filter((rule) => rule.gate?.kind === "indexing");
  const rest = active.filter((rule) => rule.gate?.kind !== "indexing");

  const runs = new Map<string, RuleRun>();
  const blocked = new Map<string, string[]>();
  for (const rule of gates) {
    const run = runRule(rule, ctx);
    runs.set(rule.id, run);
    for (const result of run.results) {
      if (result.status !== "fail") continue;
      const list = blocked.get(result.unit);
      if (list) {
        if (!list.includes(rule.id)) list.push(rule.id);
      } else blocked.set(result.unit, [rule.id]);
    }
  }
  ctx.setBlocked(blocked);
  for (const rule of rest) runs.set(rule.id, runRule(rule, ctx));
  // Keep ruleset order.
  const ordered = active.map((rule) => runs.get(rule.id)!);
  return { ctx, runs: ordered };
}

export function evaluate(snapshot: Snapshot, config: ScanConfig): Report {
  const { ctx, runs } = evaluateRuns(snapshot, config);
  return buildReport(ctx, runs, {
    scannerVersion: SCANNER_VERSION,
    rulesetVersion: RULESET_VERSION,
    configHash: configHash(config),
  });
}
