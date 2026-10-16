import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCES_BY_ID } from "../scanner/rules/sources.js";
import {
  ACCESS_CODE_WORDS,
  ACCESS_WORDS,
  DETECTION_LIMITS,
  EXPOSES_ORDER,
  GITHUB_TOKEN_TYPES,
  HTPASSWD_HASH_PREFIXES,
  NPM_AUTH_KEYS,
  PASSWORD_HASH_PREFIXES,
  PASSWORD_NAME_MARKERS,
  PEM_PRIVATE_KEY_LABELS,
  PLACEHOLDER_HOST_SUFFIXES,
  PLACEHOLDER_HOSTS,
  PLACEHOLDER_PASSWORD_FRAGMENTS,
  PLACEHOLDER_PASSWORDS,
  PROBES,
  SEARCH_LIMITS,
  SECRET_NAME_MARKERS,
  SECURITY_CHECKS,
  SECURITY_STATEMENTS,
  VALUE_KINDS,
  VALUE_PLACEHOLDERS,
} from "./knowledge.js";

const knowledge = readFileSync(new URL("../../docs/KNOWLEDGE.md", import.meta.url), "utf8");
const sources = readFileSync(new URL("../../docs/SOURCES.md", import.meta.url), "utf8");
const raw12 = knowledge.slice(knowledge.indexOf("## 12. Exposed secrets and source code"));
const section12 = raw12.replace(/`/g, "").replace(/\\"/g, '"');

function blockOf(id: string, text = section12): string {
  const start = text.indexOf(`#### ${id} · `);
  const end = text.indexOf("\n#### ", start + 1);
  const stop = text.indexOf("\n### ", start + 1);
  return text.slice(start, Math.min(end === -1 ? Infinity : end, stop === -1 ? Infinity : stop));
}

/** Backticked values in a block of the raw Markdown. */
function codeSpans(id: string): Set<string> {
  return new Set([...blockOf(id, raw12).matchAll(/`([^`]+)`/g)].map((m) => m[1]!));
}

describe("security checks (KNOWLEDGE.md §12)", () => {
  it("transcribes every check block and no other", () => {
    const headings = [...raw12.matchAll(/^#### (SEC-[A-Z]+-\d{2}) · (.+)$/gm)].map((m) => `${m[1]} · ${m[2]!.replace(/`/g, "")}`);
    expect(SECURITY_CHECKS.map((c) => `${c.id} · ${c.title}`)).toEqual(headings);
  });

  it("stores every line of each block verbatim", () => {
    for (const check of SECURITY_CHECKS) {
      const block = blockOf(check.id);
      expect(block, check.id).toContain(`\nExposes: ${check.exposesText} · scope: ${check.scope}\n`);
      expect(block, check.id).toContain(`\nInspect: ${check.inspect}\n`);
      expect(block, check.id).toContain(`\nConfirm: ${check.confirm}\n`);
      expect(block, check.id).toContain(`\nFix: ${check.fix}\n`);
      if (check.notes) expect(block, check.id).toContain(`\nNotes: ${check.notes}`);
      const founds = [...block.matchAll(/^Found ([a-z_]+): (.+)$/gm)].map((m) => m[1]);
      expect(check.conditions.map((c) => c.code), check.id).toEqual(founds);
      for (const c of check.conditions) {
        expect(block, `${check.id} ${c.code}`).toContain(`\nFound ${c.code}: ${c.found}\n`);
        expect(block, `${check.id} ${c.code}`).toContain(`\nReason ${c.code}: "${c.reason}"\n`);
        expect(EXPOSES_ORDER).toContain(c.exposes);
        expect(check.exposesText).toContain(c.exposes);
      }
      for (const c of check.citations) {
        const prefix = c.conditions ? `[${c.conditions.join(", ")}] ` : "";
        expect(block, `${check.id} ${c.source_id}`).toContain(`- ${prefix}${c.source_id} · ${c.section}: "${c.quote}"`);
        for (const code of c.conditions ?? []) expect(check.conditions.some((x) => x.code === code)).toBe(true);
      }
    }
  });

  it("emits at least one quoted citation for every condition, from registered sources", () => {
    for (const check of SECURITY_CHECKS) {
      for (const c of check.conditions) {
        expect(check.citations.some((x) => x.conditions === null || x.conditions.includes(c.code)), `${check.id} ${c.code}`).toBe(true);
      }
      for (const c of check.citations) {
        expect(SOURCES_BY_ID.has(c.source_id), `${check.id} cites ${c.source_id}`).toBe(true);
        expect(sources.includes(`| ${c.source_id} |`), c.source_id).toBe(true);
      }
    }
  });

  it("quotes a source inside a reason only from that check's stored citations", () => {
    for (const check of SECURITY_CHECKS) {
      for (const c of check.conditions) {
        for (const quoted of c.reason.matchAll(/"([^"{}]+)"/g)) {
          const fragment = quoted[1]!;
          // A quotation in a reason is either from a stored citation or the check's own prose naming a term ("dumb").
          if (fragment.split(" ").length < 3) continue;
          expect(check.citations.some((x) => x.quote.includes(fragment)), `${check.id} ${c.code}: ${fragment}`).toBe(true);
        }
      }
    }
  });

  it("stores the statements verbatim", () => {
    const rows = [...raw12.matchAll(/^\| `([a-z_]+)` \| "(.+)" \| Scanner statement \|$/gm)].map((m) => ({ key: m[1], text: m[2] }));
    expect(SECURITY_STATEMENTS.map((s) => ({ key: s.key, text: s.text }))).toEqual(rows);
  });
});

describe("detection constants match the Confirm, Inspect and Notes lines", () => {
  it("probes exactly the paths each check inspects", () => {
    for (const check of SECURITY_CHECKS) {
      const paths = PROBES.filter((p) => p.check === check.id).map((p) => p.path);
      const inspectLine = /^Inspect: (.+)$/m.exec(blockOf(check.id, raw12))![1]!;
      const inspected = [...inspectLine.matchAll(/`([^`]+)`/g)].map((m) => m[1]!).filter((s) => s.startsWith("/."));
      expect(paths, check.id).toEqual(inspected);
      for (const p of PROBES.filter((x) => x.check === check.id)) expect(check.conditions.some((c) => c.code === p.condition)).toBe(true);
    }
  });

  it("names GitHub token types as SEC-SECRET-01 does", () => {
    const notes = SECURITY_CHECKS.find((c) => c.id === "SEC-SECRET-01")!.notes!;
    for (const t of GITHUB_TOKEN_TYPES) expect(notes).toContain(`${t.prefix} ${t.type}`);
    const spans = codeSpans("SEC-SECRET-01");
    for (const t of GITHUB_TOKEN_TYPES) expect(spans.has(t.prefix)).toBe(true);
  });

  it("lists the values and numbers the Confirm lines state", () => {
    const pem = codeSpans("SEC-SECRET-02");
    for (const label of PEM_PRIVATE_KEY_LABELS) expect(pem.has(`-----BEGIN ${label}-----`), label).toBe(true);
    const named = codeSpans("SEC-SECRET-04");
    for (const v of [...SECRET_NAME_MARKERS, ...VALUE_PLACEHOLDERS]) expect(named.has(v), v).toBe(true);
    const urls = codeSpans("SEC-SECRET-03");
    for (const v of [...PLACEHOLDER_HOSTS, ...PLACEHOLDER_HOST_SUFFIXES, ...PLACEHOLDER_PASSWORDS, ...PLACEHOLDER_PASSWORD_FRAGMENTS]) expect(urls.has(v), v).toBe(true);
    const files = codeSpans("SEC-FILE-02");
    for (const v of [...NPM_AUTH_KEYS, ...HTPASSWD_HASH_PREFIXES]) expect(files.has(v), v).toBe(true);

    const confirm = (id: string) => SECURITY_CHECKS.find((c) => c.id === id)!.confirm;
    expect(confirm("SEC-SECRET-01")).toContain(`at least ${DETECTION_LIMITS.tokenMinLength} characters`);
    expect(confirm("SEC-SECRET-01")).toContain(`fewer than ${DETECTION_LIMITS.tokenMinDistinct} distinct characters`);
    expect(confirm("SEC-SECRET-02")).toContain("within 16,384 characters");
    expect(DETECTION_LIMITS.pemWindow).toBe(16_384);
    expect(confirm("SEC-SECRET-02")).toContain(`at least ${DETECTION_LIMITS.pemMinBody} characters long`);
    expect(confirm("SEC-SECRET-03")).toContain(`a scheme of ${DETECTION_LIMITS.schemeMin} to ${DETECTION_LIMITS.schemeMax} characters`);
    expect(confirm("SEC-SECRET-04")).toContain(`of at most ${DETECTION_LIMITS.nameMax} characters`);
    expect(confirm("SEC-SECRET-04")).toContain(`The value is ${DETECTION_LIMITS.valueMin} to ${DETECTION_LIMITS.valueMax} characters`);
    expect(confirm("SEC-SECRET-04")).toContain(`at least ${DETECTION_LIMITS.valueMinDistinct} distinct characters`);
    expect(section12).toContain(`is at most ${DETECTION_LIMITS.envNameMax} characters long`);
    expect(section12).toContain(`lists up to ${DETECTION_LIMITS.envNamesListed} names`);
    expect(section12).toContain("give the first ten members");
    expect(DETECTION_LIMITS.listShown).toBe(10);
    expect(section12).toContain("A matched value of four or more characters");
    expect(DETECTION_LIMITS.scrubMin).toBe(4);
  });

  it("lists the words, prefixes and numbers of the SEC-DATA checks", () => {
    const confirm = (id: string) => SECURITY_CHECKS.find((c) => c.id === id)!.confirm;
    const words = (list: readonly string[]) => `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
    expect(confirm("SEC-DATA-01")).toContain(`it ends with an access word, ${words(ACCESS_WORDS)}, followed by ${words(ACCESS_CODE_WORDS)},`);
    expect(confirm("SEC-DATA-01")).toContain(`a quoted string of ${DETECTION_LIMITS.codeMin} to ${DETECTION_LIMITS.codeMax} characters`);
    expect(confirm("SEC-DATA-01")).toContain(`an integer of ${DETECTION_LIMITS.codeDigitsMin} to ${DETECTION_LIMITS.codeDigitsMax} digits`);
    expect(confirm("SEC-DATA-01")).toContain(`of at most ${DETECTION_LIMITS.nameMax} characters`);
    expect(confirm("SEC-DATA-02")).toContain(`contains ${words(PASSWORD_NAME_MARKERS)}.`);
    expect(confirm("SEC-DATA-02")).toContain(`The value starts with ${words(PASSWORD_HASH_PREFIXES)}, is ${DETECTION_LIMITS.hashMin} to ${DETECTION_LIMITS.hashMax} characters long`);
    expect(confirm("SEC-DATA-02")).toContain(`fewer than ${DETECTION_LIMITS.hashMinDistinct} distinct characters`);
    const spans = new Set([...codeSpans("SEC-DATA-01"), ...codeSpans("SEC-DATA-02")]);
    for (const v of [...ACCESS_WORDS, ...ACCESS_CODE_WORDS, ...PASSWORD_NAME_MARKERS, ...PASSWORD_HASH_PREFIXES]) expect(spans.has(v), v).toBe(true);
  });
});

describe("search (KNOWLEDGE.md §12.7)", () => {
  const raw = raw12.slice(raw12.indexOf("### 12.7 Searching the served text"));
  const text = raw.replace(/`/g, "");

  it("states the limits the code uses", () => {
    expect(text).toContain(`- Terms: up to ${SEARCH_LIMITS.terms}. Each is ${SEARCH_LIMITS.termMin} to ${SEARCH_LIMITS.termMax} characters long`);
    expect(text).toContain(`- Listed: the first ${SEARCH_LIMITS.listed} occurrences of each term`);
  });

  it("transcribes the value kinds table in order", () => {
    const rows = [...raw.matchAll(/^\| `([a-z_]+)` \| (.+) \| "(.+)" \|$/gm)].map((m) => ({ kind: m[1], value: m[2]!.replace(/`/g, ""), text: m[3] }));
    expect(VALUE_KINDS.map((k) => ({ kind: k.kind, value: k.value, text: k.text }))).toEqual(rows);
  });
});

describe("security sources (SOURCES.md)", () => {
  it("transcribes each registry row the checks cite", () => {
    const ids = new Set(SECURITY_CHECKS.flatMap((c) => c.citations.map((x) => x.source_id)));
    for (const id of ids) {
      const s = SOURCES_BY_ID.get(id)!;
      expect(sources, id).toContain(`| ${s.id} | ${s.title} | ${s.url} | ${s.last_updated} | ${s.verified} |`);
    }
  });
});

describe("redaction, limits and the confirmation rule (KNOWLEDGE.md §12.1, §12.2, §12.6)", () => {
  it("stores them verbatim", async () => {
    const { REDACTION_RULES, NOT_REPORTED, CONFIRMATION_QUOTE } = await import("./knowledge.js");
    const redaction = section12.slice(section12.indexOf("### 12.2 Redaction"), section12.indexOf("### 12.3"));
    REDACTION_RULES.forEach((rule, i) => expect(redaction).toContain(`\n${i + 1}. ${rule}\n`));
    expect(redaction).not.toContain(`\n${REDACTION_RULES.length + 1}. `);
    const limits = section12.slice(section12.indexOf("### 12.6"), section12.indexOf("### 12.7"));
    expect(limits.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2))).toEqual([...NOT_REPORTED]);
    expect(section12).toContain(`"${CONFIRMATION_QUOTE.quote}" (${CONFIRMATION_QUOTE.source_id} · ${CONFIRMATION_QUOTE.section})`);
  });
});
