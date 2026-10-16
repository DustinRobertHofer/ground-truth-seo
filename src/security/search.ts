/**
 * Search terms for the security checker (KNOWLEDGE.md §12.7), read from the
 * form one per line and validated the same way in the browser and on the
 * server. Terms are never logged or saved.
 *
 * Safe to import from client components: it holds strings and numbers only.
 */

import { SEARCH_LIMITS } from "./knowledge.js";

export type SearchTermsOutcome = { ok: true; terms: string[] } | { ok: false; error: string };

/** The form's text: one term per line, blank lines skipped. */
export function termsFromText(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * §12.7 Terms: up to 5, each 3 to 100 characters once whitespace at either
 * end is removed and free of control characters. Terms equal without case
 * count once; the first spelling is kept.
 */
export function normalizeSearchTerms(input: unknown): SearchTermsOutcome {
  if (input === undefined || input === null) return { ok: true, terms: [] };
  if (!Array.isArray(input) || input.length > SEARCH_LIMITS.terms * 10 || input.some((t) => typeof t !== "string")) {
    return { ok: false, error: "The search terms could not be read." };
  }
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const raw of input as string[]) {
    const term = raw.trim();
    if (term === "") continue;
    if (/\p{Cc}/u.test(term)) return { ok: false, error: "A search term cannot contain control characters." };
    const length = [...term].length;
    if (length < SEARCH_LIMITS.termMin) return { ok: false, error: `Each search term needs at least ${SEARCH_LIMITS.termMin} characters.` };
    if (length > SEARCH_LIMITS.termMax) return { ok: false, error: `Each search term can be at most ${SEARCH_LIMITS.termMax} characters long.` };
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  if (terms.length > SEARCH_LIMITS.terms) return { ok: false, error: `Enter at most ${SEARCH_LIMITS.terms} search terms.` };
  return { ok: true, terms };
}
