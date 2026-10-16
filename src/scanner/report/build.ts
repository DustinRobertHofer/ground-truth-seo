/**
 * Assembles report.json from rule runs (PRODUCT.md §9 and §10).
 */

import type { EvaluationContext } from "../evaluate/context.js";
import { buildFinding, citationsFor, gateLabel, outcomeFor, verifyFor } from "../evaluate/findings.js";
import type { RuleRun } from "../evaluate/index.js";
import { accessMatrixRow, accessMatrixSample } from "../evaluate/rules/ai.js";
import { ISO_DATA_VERSION } from "../evaluate/core/lang-codes.js";
import { compareBytes, formatInt } from "../evaluate/core/text.js";
import { ACCESS_MATRIX_NOTES, CRAWLERS } from "../rules/crawlers.js";
import { KNOWLEDGE_CUTOFF, SOURCES_VERIFIED, UNICODE_VERSION } from "../rules/index.js";
import { MANUAL_CHECKS } from "../rules/manual.js";
import { MYTH_GUARD_INTRO, MYTHS } from "../rules/myths.js";
import { AI_READINESS, AI_READINESS_INTRO, type ReadinessDef } from "../rules/readiness.js";
import { SOURCES, SOURCES_BY_ID } from "../rules/sources.js";
import { HEADLINE_STATEMENTS } from "../rules/statements.js";
import { CATEGORY_LABEL, CATEGORY_ORDER, CLASS_LABEL, CLASS_SEVERITY, CLASS_WEIGHT, type FeatureName, type RuleClass } from "../rules/types.js";
import { achieved, categoryScore, eligibility, overall, type RuleStat } from "./score.js";
import type { AccessMatrixRow, CategoryScore, FeatureEligibility, Finding, ReadinessItem, ReadinessStatus, Recommendation, Report, RuleScore } from "./types.js";

export interface BuildMeta {
  scannerVersion: string;
  rulesetVersion: string;
  configHash: string;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2, info: 3 };
const STATUS_RANK: Record<string, number> = { fail: 0, opportunity: 1, info: 2, pass: 3, manual: 4, not_evaluated: 5, not_applicable: 6 };

/** Statuses that make a unit count in the score: met, broken, or not yet adopted. */
const EVALUATED = new Set(["pass", "fail", "opportunity"]);

const FEATURE_LABEL: Record<FeatureName, string> = {
  favicon: "Favicon",
  site_name: "Site name preference",
  breadcrumb: "Breadcrumbs",
  org_logo: "Organization logo",
  vacation_rental: "Vacation rentals",
};

const CLASS_ASSIGNED_WHEN: Record<RuleClass, string> = {
  C1: "It must be done this way or it does not work, is ignored, or the page or feature is ineligible. The source is an engine, or the standard that defines the mechanism itself (robots.txt, sitemaps, canonical links) stating that non-conforming input is ignored, dropped or invalid",
  C2: "The engine recommends it, or documents it as used by its ranking systems",
  C3: "A web standard requires or recommends it, without a documented consequence for crawling, indexing or display",
  C4: "It is supported, optional, a policy choice or a house convention",
};

function ruleStat(run: RuleRun): RuleStat | null {
  const { rule, weight, results } = run;
  if (weight <= 0 || rule.informational || rule.gate?.kind === "indexing") return null;
  const units = new Map<string, boolean>();
  for (const result of results) {
    if (!EVALUATED.has(result.status)) continue;
    const prior = units.get(result.unit);
    units.set(result.unit, (prior ?? true) && result.status === "pass");
  }
  if (units.size === 0) return null;
  let passed = 0;
  for (const ok of units.values()) if (ok) passed += 1;
  return { rule_id: rule.id, weight, units: units.size, passed };
}

function compareFindings(a: Finding, b: Finding): number {
  const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (s !== 0) return s;
  const sev = SEVERITY_RANK[a.severity]! - SEVERITY_RANK[b.severity]!;
  if (sev !== 0) return sev;
  return compareBytes(a.rule_id, b.rule_id) || compareBytes(a.condition ?? "", b.condition ?? "") || compareBytes(a.unit, b.unit);
}

function gateRank(gate: string | null): number {
  if (gate === "indexing") return 0;
  if (gate && gate.startsWith("feature:")) return 1;
  return 2;
}

export function buildReport(ctx: EvaluationContext, runs: RuleRun[], meta: BuildMeta): Report {
  const findings: Finding[] = [];
  const stats: RuleStat[] = [];
  const statusSummary = new Map<string, Record<string, number>>();
  for (const run of runs) {
    const summary: Record<string, number> = {};
    for (const result of run.results) {
      findings.push(buildFinding(run.rule, result, ctx, run.weight));
      summary[result.status] = (summary[result.status] ?? 0) + 1;
    }
    statusSummary.set(run.rule.id, summary);
    const stat = ruleStat(run);
    if (stat) stats.push(stat);
  }
  findings.sort(compareFindings);

  // Eligibility and headline.
  const intended = ctx.intended.length;
  const blocked = ctx.blocked.length;
  const E = eligibility(intended, blocked);
  const score = achieved(stats);
  const headlineScore = overall(E, score.achieved);
  const gateCounts = runs
    .filter((run) => run.rule.gate?.kind === "indexing")
    .map((run) => ({ rule_id: run.rule.id, blocked: new Set(run.results.filter((r) => r.status === "fail").map((r) => r.unit)).size }));
  const perfEvaluated = runs.some((run) => run.rule.id === "SEO-PERF-01" && run.results.some((r) => r.status === "pass" || r.status === "fail"));
  const statements = HEADLINE_STATEMENTS.filter((s) => !s.onlyWhen || (s.onlyWhen === "perf_evaluated" && perfEvaluated)).map((s) => ({ key: s.key, text: s.text, source_id: s.source_id, section: s.section }));
  const countBy = (severity: string) => findings.filter((f) => f.status === "fail" && f.severity === severity).length;
  const blockingGates = gateCounts.filter((g) => g.blocked > 0).map((g) => g.rule_id);
  let summary = "";
  if (intended === 0) summary = "No intended-indexable pages found.";
  else if (blocked === 0) summary = `All ${formatInt(intended)} intended pages are eligible for indexing.`;
  else summary = `${formatInt(blocked)} of ${formatInt(intended)} intended pages ${blocked === 1 ? "is" : "are"} blocked from indexing; see ${blockingGates.join(", ")}.`;
  if (ctx.intentInferred) summary += " Intent was inferred from links: no sitemap or include patterns were found. Add a sitemap or include patterns for a stricter audit.";

  // Features.
  const features: FeatureEligibility[] = (Object.keys(FEATURE_LABEL) as FeatureName[]).map((feature) => {
    const label = `feature:${feature}`;
    const relevant = findings.filter((f) => f.gate === label);
    const evaluated = relevant.filter((f) => EVALUATED.has(f.status));
    const units = new Set(evaluated.map((f) => f.unit));
    const failing = relevant.filter((f) => f.status === "fail" || f.status === "opportunity").map((f) => ({ unit: f.unit, rule_id: f.rule_id, condition: f.condition ?? "" }));
    let status: FeatureEligibility["status"] = "not_applicable";
    if (units.size > 0) status = failing.length > 0 ? "not_eligible" : "eligible";
    else if (relevant.some((f) => f.status === "not_evaluated")) status = "not_evaluated";
    return { feature, label: FEATURE_LABEL[feature], status, units: units.size, failing };
  });

  // Categories.
  const categories: CategoryScore[] = CATEGORY_ORDER.map((key) => {
    const ruleStats = stats.filter((s) => runs.find((r) => r.rule.id === s.rule_id)!.rule.category === key);
    const result = achieved(ruleStats);
    const scored = categoryScore(result.achieved);
    const rules: RuleScore[] = ruleStats.map((s) => ({
      rule_id: s.rule_id,
      class: runs.find((r) => r.rule.id === s.rule_id)!.rule.class,
      weight: s.weight,
      units: s.units,
      passed: s.passed,
      contribution: result.contributions.find((c) => c.rule_id === s.rule_id)!.contribution,
    }));
    return { key, label: CATEGORY_LABEL[key], score: scored.score, achieved: result.achieved ? `${result.achieved.num}/${result.achieved.den}` : null, arithmetic: scored.arithmetic, rules };
  });

  // Recommendations: one per (rule, condition), for failures and opportunities alike.
  const groups = new Map<string, Recommendation & { _rank: number[] }>();
  for (const finding of findings) {
    if (finding.status !== "fail" && finding.status !== "opportunity") continue;
    const key = `${finding.rule_id}\u0000${finding.condition}`;
    let rec = groups.get(key);
    if (!rec) {
      const rule = runs.find((r) => r.rule.id === finding.rule_id)!.rule;
      rec = {
        rule_id: finding.rule_id,
        condition: finding.condition!,
        kind: finding.status === "opportunity" ? "add" : "fix",
        gate: finding.gate,
        class: finding.class,
        weight: finding.weight,
        severity: finding.severity,
        action: rule.fix ?? "",
        reason: finding.reason ?? "",
        citations: finding.citations,
        affected_units: [],
        affected_count: 0,
        outcome: outcomeFor(rule, ctx) ?? "",
        verify: verifyFor(rule, ctx),
        _rank: [],
      };
      groups.set(key, rec);
    }
    if (!rec.affected_units.includes(finding.unit)) rec.affected_units.push(finding.unit);
  }
  const recommendations = [...groups.values()].map((rec) => {
    rec.affected_units.sort(compareBytes);
    rec.affected_count = rec.affected_units.length;
    return rec;
  });
  // Order (PRODUCT.md §9): gates, heavier first, broken before missing, wider reach first, then IDs.
  const kindRank = (kind: Recommendation["kind"]) => (kind === "fix" ? 0 : 1);
  recommendations.sort((a, b) => gateRank(a.gate) - gateRank(b.gate) || b.weight - a.weight || kindRank(a.kind) - kindRank(b.kind) || b.affected_count - a.affected_count || compareBytes(a.rule_id, b.rule_id) || compareBytes(a.condition, b.condition));
  const recommendationsOut: Recommendation[] = recommendations.map(({ _rank, ...rest }) => {
    void _rank;
    return rest;
  });

  // AI access matrix.
  const matrixRows: AccessMatrixRow[] = CRAWLERS.map((crawler) => ({
    crawler: crawler.token,
    operator: crawler.operator,
    purpose: crawler.purpose,
    robots_behavior: crawler.robotsBehavior,
    source_id: crawler.source_id,
    user_triggered: crawler.userTriggered,
    results: accessMatrixRow(ctx, crawler.token),
  }));

  // AI answers readiness (KNOWLEDGE.md §10.4): derived from findings already made, never scored.
  const readiness = AI_READINESS.map((def) => readinessItem(def, ctx, runs, findings, matrixRows));

  // Methodology.
  const citedSources = new Set<string>();
  for (const finding of findings) for (const citation of finding.citations) citedSources.add(citation.source_id);
  for (const statement of statements) if (statement.source_id) citedSources.add(statement.source_id);
  const enabledHouseConventions = runs.filter((r) => r.rule.houseConvention).map((r) => r.rule.id);

  const config = { ...ctx.config } as unknown as Record<string, unknown>;

  return {
    meta: {
      scanner_version: meta.scannerVersion,
      ruleset_version: meta.rulesetVersion,
      knowledge_cutoff: KNOWLEDGE_CUTOFF,
      sources_verified: SOURCES_VERIFIED,
      unicode_version: UNICODE_VERSION,
      iso_data_version: ISO_DATA_VERSION,
      snapshot_id: ctx.snapshot.snapshot_id,
      config_hash: meta.configHash,
      config,
      robots_mode: ctx.snapshot.robots_mode,
      owner_verified: ctx.snapshot.owner_verified,
      completed_at: ctx.snapshot.completed_at,
      truncated: ctx.snapshot.truncated,
      truncation_limits: ctx.snapshot.truncation_limits,
      start_url: ctx.snapshot.start_url,
      preferred_origin: ctx.preferredOrigin,
      intent_inferred: ctx.intentInferred,
    },
    headline: {
      overall: headlineScore.score,
      overall_label: enabledHouseConventions.length > 0 ? `${headlineScore.label} (with house conventions)` : headlineScore.label,
      arithmetic: headlineScore.arithmetic,
      eligibility: headlineScore.eligibility,
      achieved: headlineScore.achieved,
      intended,
      blocked,
      gates: gateCounts,
      critical_failures: countBy("critical"),
      major_failures: countBy("major"),
      minor_failures: countBy("minor"),
      opportunities: findings.filter((f) => f.status === "opportunity").length,
      statements,
      summary,
      with_house_conventions: enabledHouseConventions.length > 0,
    },
    features,
    categories,
    recommendations: recommendationsOut,
    findings,
    ai_access_matrix: { rows: matrixRows, notes: ACCESS_MATRIX_NOTES, sampled_urls: accessMatrixSample(ctx) },
    ai_readiness: { intro: AI_READINESS_INTRO, items: readiness },
    manual_review: MANUAL_CHECKS.map((check) => ({ id: check.id, what: check.what, why: check.why, source: check.source, source_ids: check.source_ids })),
    not_scored: { intro: MYTH_GUARD_INTRO, claims: MYTHS.map((m) => ({ claim: m.claim, verdict: m.verdict, evidence: m.evidence, source: m.source })) },
    methodology: {
      classes: (["C1", "C2", "C3", "C4"] as RuleClass[]).map((cls) => ({ class: cls, label: CLASS_LABEL[cls], weight: CLASS_WEIGHT[cls], severity: CLASS_SEVERITY[cls], assigned_when: CLASS_ASSIGNED_WHEN[cls] })),
      formulas: [
        "Achieved A = Σ (w_r × p_r / n_r) / Σ w_r over scored rules with at least one evaluated unit, where a unit is evaluated when it passes, fails or carries an opportunity; gate: indexing rules are excluded",
        "Eligibility E = (|I| − |B|) / |I| where B = members of I failing at least one gate: indexing rule",
        "Overall S = round_half_up(100 × E × A); round_half_up(a/b) = floor((2a + b) / (2b))",
        "Category S_k = round_half_up(100 × A_k) with A restricted to the category's rules and no E factor",
      ],
      weights_note: "Weights express the strength of the documentation, not ranking impact.",
      rules: runs.map((run) => ({ rule_id: run.rule.id, title: run.rule.title, class: run.rule.class, weight: run.weight, gate: gateLabel(run.rule), category: run.rule.category, status_summary: statusSummary.get(run.rule.id) ?? {} })),
      sources: SOURCES.filter((s) => citedSources.has(s.id)).map((s) => ({ id: s.id, title: s.title, url: s.url, last_updated: s.last_updated, verified: s.verified })),
      enabled_house_conventions: enabledHouseConventions,
    },
  };
}

/**
 * One readiness line, read off results that rules already produced. Counts and
 * outcomes only; no new judgment is made here.
 */
function readinessItem(def: ReadinessDef, ctx: EvaluationContext, runs: RuleRun[], findings: Finding[], matrix: AccessMatrixRow[]): ReadinessItem {
  const base = { key: def.key, label: def.label, party: def.party, source_id: def.source_id, section: def.section, quote: def.quote };
  const ran = (id: string) => runs.find((r) => r.rule.id === id)?.ran ?? false;
  const unitsWith = (id: string, condition: string) => new Set(findings.filter((f) => f.rule_id === id && f.condition === condition).map((f) => f.unit)).size;
  const pages = ctx.pages.length;
  const item = (status: ReadinessStatus, detail: string): ReadinessItem => ({ ...base, status, detail });
  switch (def.derive.kind) {
    case "google_snippet": {
      if (!ran("SEO-AI-01")) return item("unknown", "Google is not a selected engine.");
      if (pages === 0) return item("unknown", "No intended page was evaluated.");
      const restricted = unitsWith("SEO-AI-01", "nosnippet_policy");
      if (restricted === 0) return item("in_place", `None of the ${formatInt(pages)} evaluated pages carries nosnippet or max-snippet:0.`);
      return item("not_in_place", `${formatInt(restricted)} of ${formatInt(pages)} evaluated pages carry nosnippet or max-snippet:0; see SEO-AI-01.`);
    }
    case "bing_answers": {
      if (!ran("SEO-AI-04")) return item("unknown", "Bing is not a selected engine.");
      if (pages === 0) return item("unknown", "No intended page was evaluated.");
      const tagged = unitsWith("SEO-AI-04", "answer_use_control");
      if (tagged === 0) return item("in_place", `None of the ${formatInt(pages)} evaluated pages carries noarchive or nocache.`);
      return item("not_in_place", `${formatInt(tagged)} of ${formatInt(pages)} evaluated pages carry noarchive or nocache; see SEO-AI-04.`);
    }
    case "bing_sitemap_lastmod": {
      if (!ran("SEO-SITEMAP-04C")) return item("unknown", "Bing is not a selected engine.");
      if (!ctx.sitemapFound) return item("not_in_place", "No sitemap was found; see SEO-SITEMAP-08.");
      const withLastmod = findings.filter((f) => f.rule_id === "SEO-SITEMAP-04C" && EVALUATED.has(f.status));
      if (withLastmod.length === 0) return item("not_in_place", "The sitemap files carry no lastmod values.");
      const problems = findings.filter((f) => (f.rule_id === "SEO-SITEMAP-04A" || f.rule_id === "SEO-SITEMAP-04C") && f.status === "fail").length;
      if (problems === 0) return item("in_place", `Every lastmod in ${formatInt(withLastmod.length)} sitemap ${withLastmod.length === 1 ? "file" : "files"} is valid and includes a time.`);
      return item("not_in_place", `${formatInt(problems)} lastmod ${problems === 1 ? "problem" : "problems"}; see SEO-SITEMAP-04A and SEO-SITEMAP-04C.`);
    }
    case "crawler": {
      const token = def.derive.token;
      const row = matrix.find((r) => r.crawler === token);
      const home = row?.results[0];
      if (!home) return item("unknown", "The home page was not sampled.");
      if (home.outcome === "allowed") return item("in_place", `${token} is allowed to fetch ${home.url}.`);
      if (home.outcome === "disallowed") return item("not_in_place", `${token} is disallowed for ${home.url}${home.rule ? ` by ${home.rule}` : ""}${home.line !== null ? ` (line ${formatInt(home.line)})` : ""}.`);
      return item("unknown", `The robots.txt outcome for ${token} on ${home.url} could not be decided.`);
    }
    case "llms_txt": {
      const finding = findings.find((f) => f.rule_id === "SEO-AI-05" && f.condition === "llms_txt");
      if (!finding) return item("unknown", "/llms.txt was not fetched.");
      return item("optional", String(finding.observed.presence ?? ""));
    }
  }
}

void citationsFor;
void SOURCES_BY_ID;
