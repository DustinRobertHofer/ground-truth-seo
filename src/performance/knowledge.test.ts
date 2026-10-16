import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCES_BY_ID } from "../scanner/rules/sources.js";
import {
  BFCACHE_ACTIONABLE,
  BREAKDOWN_CITATIONS,
  CLS_CAUSES,
  DELAY_SHARE_PERCENT,
  DIAGNOSTICS,
  INPUT_ERROR_TEXT,
  LCP_SUBPARTS,
  METRIC_CITATIONS,
  METRICS,
  PERFORMANCE_DIAGNOSTICS_VERSION,
  PERFORMANCE_STATEMENTS,
  type PerformanceCitation,
} from "./knowledge.js";

const knowledge = readFileSync(new URL("../../docs/KNOWLEDGE.md", import.meta.url), "utf8");
const sources = readFileSync(new URL("../../docs/SOURCES.md", import.meta.url), "utf8");
const raw13 = knowledge.slice(knowledge.indexOf("## 13. Home page performance diagnostics"));
const section13 = raw13.replace(/`/g, "").replace(/\\"/g, '"');

function part(from: string, to: string | null): string {
  const start = section13.indexOf(from);
  return section13.slice(start, to ? section13.indexOf(to, start) : undefined);
}

function blockOf(id: string): string {
  const start = section13.indexOf(`#### ${id} · `);
  const end = section13.indexOf("\n#### ", start + 1);
  const stop = section13.indexOf("\n### ", start + 1);
  return section13.slice(start, Math.min(end === -1 ? Infinity : end, stop === -1 ? Infinity : stop));
}

function citationLine(c: PerformanceCitation): string {
  const prefix = c.conditions ? `[${c.conditions.join(", ")}] ` : "";
  return `- ${prefix}${c.source_id} · ${c.section}: "${c.quote}"`;
}

function citationLines(text: string): string[] {
  return text.split("\n").filter((l) => /^- (\[[a-z_, ]+\] )?[A-Z0-9-]+ · [^:]+: "/.test(l));
}

describe("performance diagnostics (KNOWLEDGE.md §13)", () => {
  it("carries the version the section states", () => {
    expect(section13).toContain(`\nPerformance diagnostics ${PERFORMANCE_DIAGNOSTICS_VERSION} · Sources read `);
    expect(knowledge).toContain(`Performance diagnostics ${PERFORMANCE_DIAGNOSTICS_VERSION} (§13, `);
  });

  it("transcribes the metrics table in order, with thresholds that match the printed cells", () => {
    const rows = [...raw13.matchAll(/^\| `([A-Z]+)` \| (.+?) \| (yes|no) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/gm)].map((m) => ({
      id: m[1],
      name: m[2],
      coreWebVital: m[3] === "yes",
      fieldInput: m[4] === "none" ? null : m[4]!.replace(/`/g, ""),
      labInput: m[5] === "none" ? null : m[5]!.replace(/`/g, ""),
      goodText: m[6],
      poorText: m[7],
    }));
    expect(METRICS.map(({ id, name, coreWebVital, fieldInput, labInput, goodText, poorText }) => ({ id, name, coreWebVital, fieldInput, labInput, goodText, poorText }))).toEqual(rows);
    for (const m of METRICS) {
      const parse = (text: string) => (text === "none" ? null : m.unit === "thousandths" ? Number(text.replace(".", "")) : Number(text.replace(/,/g, "").replace(" ms", "")));
      expect(m.good, m.id).toBe(parse(m.goodText));
      expect(m.poor, m.id).toBe(parse(m.poorText));
    }
  });

  it("transcribes the LCP subparts table in order", () => {
    const rows = [...section13.matchAll(/^\| (ttfb|load_delay|load_duration|render_delay) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/gm)].map((m) => ({
      key: m[1],
      name: m[2],
      fieldInput: m[3],
      labInput: m[4],
      optimal: m[5],
    }));
    expect(LCP_SUBPARTS.map((s) => ({ ...s }))).toEqual(rows);
  });

  it("stores the §13.3 and §13.4 citations verbatim and only them", () => {
    expect(citationLines(part("### 13.3", "### 13.4"))).toEqual(METRIC_CITATIONS.map(citationLine));
    expect(citationLines(part("### 13.4", "### 13.5"))).toEqual(BREAKDOWN_CITATIONS.map(citationLine));
  });

  it("transcribes every diagnostic block and no other", () => {
    const headings = [...section13.matchAll(/^#### (PERF-[A-Z]+-\d{2}) · (.+)$/gm)].map((m) => `${m[1]} · ${m[2]}`);
    expect(DIAGNOSTICS.map((d) => `${d.id} · ${d.title}`)).toEqual(headings);
  });

  it("stores every line of each diagnostic verbatim", () => {
    for (const d of DIAGNOSTICS) {
      const block = blockOf(d.id);
      expect(block, d.id).toContain(`\nMetric: ${d.metric} · input: ${d.input}\n`);
      expect(block, d.id).toContain(`\nInspect: ${d.inspect}\n`);
      expect(block, d.id).toContain(`\nRecommendation: ${d.recommendation}\n`);
      if (d.notes) expect(block, d.id).toContain(`\nNotes: ${d.notes}`);
      else expect(block, d.id).not.toContain("\nNotes: ");
      const shown = [...block.matchAll(/^Shown ([a-z_]+): /gm)].map((m) => m[1]);
      expect(d.conditions.map((c) => c.code), d.id).toEqual(shown);
      for (const c of d.conditions) {
        expect(block, `${d.id} ${c.code}`).toContain(`\nShown ${c.code}: ${c.shown}\n`);
        expect(block, `${d.id} ${c.code}`).toContain(`\nStatement ${c.code}: "${c.statement}"\n`);
      }
      expect(citationLines(block), d.id).toEqual(d.citations.map(citationLine));
      for (const c of d.citations) for (const code of c.conditions ?? []) expect(d.conditions.some((x) => x.code === code), `${d.id} ${code}`).toBe(true);
    }
  });

  it("lists diagnostics by metric in §13.3 order, and every metric they name has field data", () => {
    const order = METRICS.map((m) => m.id);
    const positions = DIAGNOSTICS.map((d) => order.indexOf(d.metric));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const d of DIAGNOSTICS) expect(METRICS.find((m) => m.id === d.metric)!.fieldInput, d.id).not.toBeNull();
  });

  it("emits at least one quoted citation for every condition, from registered sources", () => {
    for (const d of DIAGNOSTICS) {
      for (const c of d.conditions) expect(d.citations.some((x) => x.conditions === null || x.conditions.includes(c.code)), `${d.id} ${c.code}`).toBe(true);
    }
    const all = [...METRIC_CITATIONS, ...BREAKDOWN_CITATIONS, ...DIAGNOSTICS.flatMap((d) => d.citations)];
    for (const c of all) {
      expect(SOURCES_BY_ID.has(c.source_id), c.source_id).toBe(true);
      expect(c.quote.length, `${c.source_id} ${c.quote}`).toBeGreaterThan(0);
    }
  });

  it("transcribes the statements table in order", () => {
    const rows = [...section13.slice(section13.indexOf("### 13.6")).matchAll(/^\| ([a-z_]+) \| "(.*)" \| (.+) \|$/gm)].map((m) => ({ key: m[1], text: m[2], source: m[3] }));
    expect(PERFORMANCE_STATEMENTS.map((s) => ({ ...s }))).toEqual(rows);
    for (const s of PERFORMANCE_STATEMENTS) {
      if (s.source === "Scanner statement") continue;
      const [id, section] = s.source.split(" · ");
      expect(SOURCES_BY_ID.has(id!), s.key).toBe(true);
      expect(section, s.key).toBeTruthy();
    }
  });

  it("stores the error texts, the delay share and the names the diagnostics read as the section writes them", () => {
    const errors = part("{error} is one of", null);
    const raw = raw13.slice(raw13.indexOf("`{error}` is one of"));
    for (const text of [INPUT_ERROR_TEXT.timeout, INPUT_ERROR_TEXT.network, INPUT_ERROR_TEXT.invalid, INPUT_ERROR_TEXT.unknown_code]) expect(errors).toContain(`"${text}"`);
    expect(errors).toContain(`"${INPUT_ERROR_TEXT.http}"`);
    expect(errors).toContain(`"${INPUT_ERROR_TEXT.lighthouse}"`);
    expect(raw).toContain("`<code>`");
    expect(blockOf("PERF-LCP-01")).toContain(`is ${DELAY_SHARE_PERCENT}% or more of the sum`);
    expect(blockOf("PERF-LCP-05")).toContain(`is ${DELAY_SHARE_PERCENT}% or more of the sum`);
    expect(blockOf("PERF-CLS-01")).toContain(`(${CLS_CAUSES.map((c) => `"${c.cause}"`).join(", ")})`);
    expect(blockOf("PERF-CLS-03")).toContain(`whose failure type is ${BFCACHE_ACTIONABLE}:`);
  });
});

describe("performance sources (SOURCES.md)", () => {
  it("transcribes each registry row §13 cites", () => {
    const ids = new Set([
      ...METRIC_CITATIONS.map((c) => c.source_id),
      ...BREAKDOWN_CITATIONS.map((c) => c.source_id),
      ...DIAGNOSTICS.flatMap((d) => d.citations.map((c) => c.source_id)),
      ...PERFORMANCE_STATEMENTS.filter((s) => s.source !== "Scanner statement").map((s) => s.source.split(" · ")[0]!),
    ]);
    for (const id of ids) {
      const s = SOURCES_BY_ID.get(id)!;
      expect(sources, id).toContain(`| ${s.id} | ${s.title} | ${s.url} | ${s.last_updated} | ${s.verified} |`);
    }
  });
});
