/**
 * Quotes for checker page copy, looked up in the compiled ruleset and the §11
 * guidance rather than retyped. A lookup that finds nothing throws, so a page
 * that cites a passage the knowledge base does not hold fails the build.
 */

import { GUIDELINES_BY_ID } from "../content-review/guidance.js";
import { HEADLINE_STATEMENTS, MYTHS, RULES_BY_ID, SOURCES, type Myth, type Source } from "../scanner/rules/index.js";
import { checkerBySlug, type CheckerSlug } from "./config.js";

export interface StoredQuote {
  quote: string;
  source_id: string;
  section: string;
}

/** A quote stored on a rule's citations, from one source, containing `fragment`. */
export function ruleQuote(ruleId: string, sourceId: string, fragment = ""): StoredQuote {
  const citation = RULES_BY_ID.get(ruleId)?.citations.find((c) => c.source_id === sourceId && c.quote !== null && c.quote.includes(fragment));
  if (!citation) throw new Error(`No stored quote on ${ruleId} from ${sourceId} containing "${fragment}"`);
  return { quote: citation.quote!, source_id: citation.source_id, section: citation.section };
}

/**
 * A quotation inside a rule's stored reason or info text, such as Google's words
 * in the SEO-CANON-03 inventory note. The source is the one the rule cites.
 */
export function conditionQuote(ruleId: string, code: string, sourceId: string): StoredQuote {
  const rule = RULES_BY_ID.get(ruleId);
  const reason = rule?.conditions.find((c) => c.code === code)?.reason ?? "";
  const quoted = /"([^"{}]+)"/.exec(reason)?.[1];
  const citation = rule?.citations.find((c) => c.source_id === sourceId);
  if (!rule || !quoted || !citation) throw new Error(`No quotation from ${sourceId} in ${ruleId} ${code}`);
  return { quote: quoted, source_id: sourceId, section: citation.section };
}

/** A quote stored on a KNOWLEDGE.md §11 guideline. */
export function guidelineQuote(guidelineId: string, sourceId: string, fragment = ""): StoredQuote {
  const citation = GUIDELINES_BY_ID.get(guidelineId)?.citations.find((c) => c.source_id === sourceId && c.quote.includes(fragment));
  if (!citation) throw new Error(`No stored quote on ${guidelineId} from ${sourceId} containing "${fragment}"`);
  return { quote: citation.quote, source_id: citation.source_id, section: citation.section };
}

/** A sourced headline statement every report prints, such as Google's "indexing isn't guaranteed". */
export function statementQuote(key: string): StoredQuote {
  const statement = HEADLINE_STATEMENTS.find((s) => s.key === key);
  if (!statement?.source_id || !statement.section) throw new Error(`No sourced headline statement "${key}"`);
  return { quote: statement.text, source_id: statement.source_id, section: statement.section };
}

/** A myth guard row (KNOWLEDGE.md §6), found by its claim. */
export function mythByClaim(fragment: string): Myth {
  const myth = MYTHS.find((m) => m.claim.includes(fragment));
  if (!myth) throw new Error(`No myth guard row whose claim contains "${fragment}"`);
  return myth;
}

/**
 * The registered sources a checker page rests on: every source its rules cite,
 * plus the ones its copy quotes, in registry order.
 */
export function checkerSources(slug: CheckerSlug, extra: readonly string[] = []): Source[] {
  const ids = new Set(extra);
  for (const ruleId of checkerBySlug(slug).ruleIds) {
    for (const citation of RULES_BY_ID.get(ruleId)?.citations ?? []) ids.add(citation.source_id);
  }
  for (const id of ids) if (!SOURCES.some((s) => s.id === id)) throw new Error(`Unregistered source ${id}`);
  return SOURCES.filter((s) => ids.has(s.id));
}
