import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AI_READINESS,
  AI_READINESS_INTRO,
  CRAWLERS,
  FEATURE_REGISTRY,
  HEADLINE_STATEMENTS,
  MANUAL_CHECKS,
  MYTHS,
  OUTCOME_QUOTE_SOURCE,
  RULES,
  RULES_BY_ID,
  SOURCES_BY_ID,
  CLASS_WEIGHT,
} from "./index.js";

const knowledge = readFileSync(new URL("../../../docs/KNOWLEDGE.md", import.meta.url), "utf8");
const sources = readFileSync(new URL("../../../docs/SOURCES.md", import.meta.url), "utf8");

/** KNOWLEDGE.md with Markdown backticks stripped, as quotes are emitted (§1.3). */
const knowledgeText = knowledge.replace(/`/g, "").replace(/\\"/g, '"');

describe("ruleset integrity", () => {
  it("has unique, well-formed rule ids", () => {
    const ids = RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^SEO-[A-Z0-9]+-\d{2}[A-Z]?(-HC)?$/);
  });

  it("covers every rule block in KNOWLEDGE.md", () => {
    const headings = [...knowledge.matchAll(/^#### (SEO-[A-Z0-9-]+?)(?: \(scanner\))? · /gm)].map((m) => m[1]!);
    for (const id of headings) expect(RULES_BY_ID.has(id), `missing rule ${id}`).toBe(true);
    expect(headings.length).toBe(RULES.length);
  });

  it("weights follow class", () => {
    for (const rule of RULES) {
      expect(rule.weight, rule.id).toBe(CLASS_WEIGHT[rule.class]);
      expect(rule.informational, rule.id).toBe(rule.class === "C4");
      expect(rule.houseConvention, rule.id).toBe(rule.id.endsWith("-HC"));
    }
  });

  it("cites only registered sources", () => {
    for (const rule of RULES) {
      for (const citation of rule.citations) {
        expect(SOURCES_BY_ID.has(citation.source_id), `${rule.id} cites ${citation.source_id}`).toBe(true);
        expect(sources.includes(`| ${citation.source_id} |`), citation.source_id).toBe(true);
      }
    }
    for (const entry of FEATURE_REGISTRY) expect(SOURCES_BY_ID.has(entry.source_id)).toBe(true);
    for (const crawler of CRAWLERS) expect(SOURCES_BY_ID.has(crawler.source_id)).toBe(true);
    for (const check of MANUAL_CHECKS) for (const id of check.source_ids) expect(SOURCES_BY_ID.has(id), id).toBe(true);
    for (const myth of MYTHS) for (const id of myth.source_ids) expect(SOURCES_BY_ID.has(id), id).toBe(true);
    for (const item of AI_READINESS) expect(SOURCES_BY_ID.has(item.source_id), item.key).toBe(true);
  });

  it("transcribes the AI answers readiness list from KNOWLEDGE.md §10.4", () => {
    expect(knowledgeText).toContain(AI_READINESS_INTRO);
    const keys = [...knowledge.matchAll(/^\| `([a-z_]+)` \| (.+?) \| (.+?) \| /gm)].filter((m) => AI_READINESS.some((i) => i.key === m[1]));
    expect(keys.map((m) => m[1])).toEqual(AI_READINESS.map((i) => i.key));
    for (const m of keys) {
      const item = AI_READINESS.find((i) => i.key === m[1])!;
      expect(m[2]!.replace(/`/g, ""), item.key).toBe(item.label);
      expect(m[3], item.key).toBe(item.party);
    }
    const crawlers = AI_READINESS.flatMap((i) => (i.derive.kind === "crawler" ? [i.derive.token] : []));
    for (const token of crawlers) expect(CRAWLERS.some((c) => c.token === token), token).toBe(true);
  });

  it("stores every quote exactly as KNOWLEDGE.md does", () => {
    const quotes: { where: string; quote: string }[] = [];
    for (const rule of RULES) {
      for (const citation of rule.citations) {
        if (citation.quote !== null) quotes.push({ where: `${rule.id} ${citation.source_id}`, quote: citation.quote });
      }
    }
    for (const entry of FEATURE_REGISTRY) quotes.push({ where: entry.feature, quote: entry.quote });
    for (const statement of HEADLINE_STATEMENTS) {
      if (statement.source_id && statement.key !== "cwv_scope") quotes.push({ where: statement.key, quote: statement.text });
    }
    quotes.push({ where: "outcome", quote: OUTCOME_QUOTE_SOURCE.quote });
    for (const item of AI_READINESS) if (item.quote !== null) quotes.push({ where: `readiness ${item.key}`, quote: item.quote });
    for (const { where, quote } of quotes) {
      expect(knowledgeText.includes(quote), `${where}: "${quote}"`).toBe(true);
    }
  });

  it("stores reason templates and fixes verbatim", () => {
    for (const rule of RULES) {
      if (rule.fix) expect(knowledgeText.includes(rule.fix), `${rule.id} fix`).toBe(true);
      for (const condition of rule.conditions) {
        if (rule.informational || condition.info) continue; // info templates may be assembled from descriptive prose
        expect(knowledgeText.includes(condition.reason), `${rule.id} ${condition.code}`).toBe(true);
      }
    }
  });

  it("gives every scored finding at least one quoted citation per condition", () => {
    for (const rule of RULES) {
      if (rule.informational) continue;
      for (const condition of rule.conditions) {
        if (condition.info) continue;
        const quoted = rule.citations.filter(
          (c) => c.quote !== null && (!c.conditions || c.conditions.includes(condition.code)),
        );
        expect(quoted.length, `${rule.id} ${condition.code}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses only {placeholder} syntax in templates", () => {
    for (const rule of RULES) {
      for (const condition of rule.conditions) {
        for (const match of condition.reason.matchAll(/\{([^}]*)\}/g)) {
          expect(match[1], `${rule.id} ${condition.code}`).toMatch(/^[a-z][a-z0-9_]*$/);
        }
      }
    }
  });
});

describe("reason lint (PRODUCT.md §8.2)", () => {
  const C1_PHRASES = ["will not be accepted", "is ignored", "is not eligible", "does not take effect", "is not crawled", "never resolves"];
  const BANNED = ["will improve rankings", "boosts SEO", "Google penalizes"];

  function outsideQuotes(text: string): string {
    return text.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "");
  }

  it("keeps C1-only consequence phrases in C1 templates", () => {
    for (const rule of RULES) {
      if (rule.class === "C1") continue;
      for (const condition of rule.conditions) {
        const text = outsideQuotes(condition.reason);
        for (const phrase of C1_PHRASES) {
          expect(text.includes(phrase), `${rule.id} ${condition.code}: ${phrase}`).toBe(false);
        }
      }
    }
  });

  it("never uses banned phrases", () => {
    for (const rule of RULES) {
      const texts = [rule.fix ?? "", ...rule.conditions.map((c) => c.reason)];
      for (const text of texts) {
        for (const phrase of BANNED) expect(text.toLowerCase().includes(phrase.toLowerCase()), rule.id).toBe(false);
        expect(/\bbest practice\b/i.test(outsideQuotes(text)), `${rule.id} best practice`).toBe(false);
      }
    }
  });
});
