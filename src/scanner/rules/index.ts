/**
 * The compiled ruleset: every rule from docs/KNOWLEDGE.md, keyed and ordered.
 */

import { AI_RULES } from "./ai.js";
import { CANONICAL_RULES } from "./canonical.js";
import { HEAD_RULES } from "./head.js";
import { HTTP_RULES } from "./http.js";
import { I18N_RULES } from "./i18n.js";
import { IMAGE_RULES } from "./images.js";
import { INDEXING_RULES } from "./indexing.js";
import { JAVASCRIPT_RULES } from "./javascript.js";
import { LINK_RULES } from "./links.js";
import { PERFORMANCE_RULES } from "./performance.js";
import { REDIRECT_RULES } from "./redirects.js";
import { ROBOTS_RULES } from "./robots.js";
import { SITEMAP_RULES } from "./sitemaps.js";
import { STRUCTURED_DATA_RULES } from "./structured-data.js";
import { TOOLING_RULES } from "./tooling.js";
import { URL_RULES } from "./urls.js";
import type { Rule } from "./types.js";

export const RULESET_VERSION = "2.0.0";
export const KNOWLEDGE_CUTOFF = "2026-09-28";
export const SOURCES_VERIFIED = "2026-10-03";
export const UNICODE_VERSION = "16.0.0";

export const RULES: readonly Rule[] = [
  ...HTTP_RULES,
  ...URL_RULES,
  ...ROBOTS_RULES,
  ...INDEXING_RULES,
  ...HEAD_RULES,
  ...CANONICAL_RULES,
  ...SITEMAP_RULES,
  ...LINK_RULES,
  ...IMAGE_RULES,
  ...STRUCTURED_DATA_RULES,
  ...I18N_RULES,
  ...REDIRECT_RULES,
  ...PERFORMANCE_RULES,
  ...JAVASCRIPT_RULES,
  ...AI_RULES,
  ...TOOLING_RULES,
];

export const RULES_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((rule) => [rule.id, rule]));

export function ruleById(id: string): Rule {
  const rule = RULES_BY_ID.get(id);
  if (!rule) throw new Error(`unknown rule ${id}`);
  return rule;
}

/** Rules that can affect a score: weight > 0 and not purely informational. */
export const SCORED_RULES: readonly Rule[] = RULES.filter((rule) => rule.weight > 0 && !rule.informational);

export * from "./types.js";
export { SOURCES, SOURCES_BY_ID } from "./sources.js";
export { CRAWLERS, ACCESS_MATRIX_NOTES, type CrawlerRef } from "./crawlers.js";
export { HEADLINE_STATEMENTS, OUTCOME_STATEMENTS, OUTCOME_QUOTE_SOURCE, VERIFY_STEPS } from "./statements.js";
export { MANUAL_CHECKS, type ManualCheck } from "./manual.js";
export { MYTHS, MYTH_GUARD_INTRO, type Myth } from "./myths.js";
export { AI_READINESS, AI_READINESS_INTRO, type ReadinessDef, type ReadinessKind } from "./readiness.js";
export { FEATURE_REGISTRY, RETIRED_FEATURES, type FeatureRegistryEntry, type RetiredFeature } from "./structured-data.js";
