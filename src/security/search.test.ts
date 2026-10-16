import { describe, expect, it } from "vitest";
import { SEARCH_LIMITS } from "./knowledge.js";
import { normalizeSearchTerms, termsFromText } from "./search.js";

describe("search terms (KNOWLEDGE.md §12.7)", () => {
  it("reads one term per line and skips blank lines", () => {
    expect(termsFromText("  lockboxCode \r\n\n internalNotes\r")).toEqual(["lockboxCode", "internalNotes"]);
    expect(termsFromText("")).toEqual([]);
  });

  it("accepts no terms", () => {
    expect(normalizeSearchTerms(undefined)).toEqual({ ok: true, terms: [] });
    expect(normalizeSearchTerms(null)).toEqual({ ok: true, terms: [] });
    expect(normalizeSearchTerms([])).toEqual({ ok: true, terms: [] });
  });

  it("trims terms and searches terms equal without case once, keeping the first spelling", () => {
    expect(normalizeSearchTerms([" lockboxCode ", "LOCKBOXCODE", "", "wifiPassword"])).toEqual({ ok: true, terms: ["lockboxCode", "wifiPassword"] });
  });

  it("enforces the length and count limits", () => {
    expect(normalizeSearchTerms(["ab"]).ok).toBe(false);
    expect(normalizeSearchTerms(["abc"]).ok).toBe(true);
    expect(normalizeSearchTerms(["x".repeat(SEARCH_LIMITS.termMax)]).ok).toBe(true);
    expect(normalizeSearchTerms(["x".repeat(SEARCH_LIMITS.termMax + 1)]).ok).toBe(false);
    const many = Array.from({ length: SEARCH_LIMITS.terms + 1 }, (_, i) => `term${i}`);
    expect(normalizeSearchTerms(many.slice(0, SEARCH_LIMITS.terms)).ok).toBe(true);
    expect(normalizeSearchTerms(many)).toEqual({ ok: false, error: `Enter at most ${SEARCH_LIMITS.terms} search terms.` });
    // Duplicates do not count toward the limit.
    expect(normalizeSearchTerms([...many.slice(0, SEARCH_LIMITS.terms), "TERM0"]).ok).toBe(true);
  });

  it("rejects control characters and anything that is not a list of strings", () => {
    expect(normalizeSearchTerms(["lock\u0000box"]).ok).toBe(false);
    expect(normalizeSearchTerms(["lock\tbox"]).ok).toBe(false);
    expect(normalizeSearchTerms("lockboxCode").ok).toBe(false);
    expect(normalizeSearchTerms([42]).ok).toBe(false);
    expect(normalizeSearchTerms(Array.from({ length: 1000 }, () => "abc")).ok).toBe(false);
  });
});
