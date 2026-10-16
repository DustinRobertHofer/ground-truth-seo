import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCES_BY_ID } from "../scanner/rules/sources.js";
import { REVIEW_GUIDELINES, REVIEW_STATEMENTS, REVIEWER_CONSTRAINTS } from "./guidance.js";

const knowledge = readFileSync(new URL("../../docs/KNOWLEDGE.md", import.meta.url), "utf8");
const sources = readFileSync(new URL("../../docs/SOURCES.md", import.meta.url), "utf8");
const knowledgeText = knowledge.replace(/`/g, "").replace(/\\"/g, '"');
const section11 = knowledgeText.slice(knowledgeText.indexOf("## 11. Content and AI-answer review guidance"));

describe("review guidance (KNOWLEDGE.md §11)", () => {
  it("transcribes every guideline block and no other", () => {
    const headings = [...knowledge.matchAll(/^#### (REV-[A-Z]+-\d{2}) · (.+)$/gm)].map((m) => `${m[1]} · ${m[2]!.replace(/`/g, "")}`);
    expect(REVIEW_GUIDELINES.map((g) => `${g.id} · ${g.title}`)).toEqual(headings);
  });

  it("stores ask, suggest, never, scope and notes verbatim", () => {
    for (const g of REVIEW_GUIDELINES) {
      const start = section11.indexOf(`#### ${g.id} · `);
      const end = section11.indexOf("\n#### ", start + 1);
      const block = section11.slice(start, end === -1 ? undefined : end);
      expect(block, g.id).toContain(`\nScope: ${g.scope} · Engines: ${g.engines}\n`);
      expect(block, g.id).toContain(`\nAsk: ${g.ask}\n`);
      expect(block, g.id).toContain(`\nSuggest: ${g.suggest}\n`);
      expect(block, g.id).toContain(`\nNever: ${g.never}\n`);
      if (g.notes) expect(block, g.id).toContain(`\nNotes: ${g.notes}`);
      for (const c of g.citations) {
        expect(block, `${g.id} ${c.source_id}`).toContain(`- ${c.source_id} · ${c.section}: "${c.quote}"`);
      }
    }
  });

  it("cites only registered sources and at least one quote per guideline", () => {
    for (const g of REVIEW_GUIDELINES) {
      expect(g.citations.length, g.id).toBeGreaterThan(0);
      for (const c of g.citations) {
        expect(SOURCES_BY_ID.has(c.source_id), `${g.id} cites ${c.source_id}`).toBe(true);
        expect(sources.includes(`| ${c.source_id} |`), c.source_id).toBe(true);
      }
    }
  });

  it("stores the reviewer constraints and statements verbatim", () => {
    REVIEWER_CONSTRAINTS.forEach((text, i) => expect(section11).toContain(`\n${i + 1}. ${text}\n`));
    expect(section11).not.toContain(`\n${REVIEWER_CONSTRAINTS.length + 1}. `);
    for (const s of REVIEW_STATEMENTS) {
      expect(section11, s.key).toContain(`| ${s.key} | ${s.source_id ? "Google: " : ""}"${s.text}" | ${s.source_id ? `${s.source_id} · ${s.section}` : "Scanner statement"} |`);
      if (s.source_id) expect(SOURCES_BY_ID.has(s.source_id)).toBe(true);
    }
  });
});
