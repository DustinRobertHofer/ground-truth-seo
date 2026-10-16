/**
 * Quotes for the security checker's page copy, looked up in the transcribed
 * KNOWLEDGE.md §12 rather than retyped. A lookup that finds nothing throws, so
 * a page that cites a passage the knowledge base does not hold fails the build.
 */

import type { StoredQuote } from "../checkers/quotes.js";
import { SOURCES, type Source } from "../scanner/rules/index.js";
import { CONFIRMATION_QUOTE, SECURITY_CHECKS, securityCheck } from "./knowledge.js";

/** A quote stored on a check's citations, from one source, containing `fragment`. */
export function securityQuote(checkId: string, sourceId: string, fragment = ""): StoredQuote {
  const citation = securityCheck(checkId).citations.find((c) => c.source_id === sourceId && c.quote.includes(fragment));
  if (!citation) throw new Error(`No stored quote on ${checkId} from ${sourceId} containing "${fragment}"`);
  return { quote: citation.quote, source_id: citation.source_id, section: citation.section };
}

/** Every registered source the checks cite, in registry order. */
export function securitySources(): Source[] {
  const ids = new Set<string>([CONFIRMATION_QUOTE.source_id]);
  for (const check of SECURITY_CHECKS) for (const c of check.citations) ids.add(c.source_id);
  for (const id of ids) if (!SOURCES.some((s) => s.id === id)) throw new Error(`Unregistered source ${id}`);
  return SOURCES.filter((s) => ids.has(s.id));
}
