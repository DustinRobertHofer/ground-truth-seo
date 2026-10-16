/**
 * robots.txt parsing and matching, KNOWLEDGE.md §3.6. This module decides
 * every crawl-access question.
 */

import { firstInvalidUtf8, lineOfOffset } from "./text.js";
import { normalizePercentEncoding } from "./url.js";

export const ROBOTS_PARSE_LIMIT = 512_000;

export interface RobotsRule {
  kind: "allow" | "disallow";
  /** The pattern as written (trimmed). */
  pattern: string;
  line: number;
}

export interface RobotsGroup {
  /** Product tokens of the user-agent lines, lowercased. */
  tokens: string[];
  /** The raw user-agent values and their lines. */
  agents: { value: string; line: number }[];
  rules: RobotsRule[];
  /** Line of the first user-agent line. */
  line: number;
}

export interface IgnoredLine {
  line: number;
  text: string;
  /** Versioned enumeration of reasons. */
  reason:
    | "unsupported_field"
    | "unparseable"
    | "rule_before_group"
    | "path_not_rooted"
    | "beyond_limit"
    | "invalid_utf8";
}

export interface SitemapLine {
  value: string;
  line: number;
}

export interface NoindexLine {
  line: number;
  text: string;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: SitemapLine[];
  ignored: IgnoredLine[];
  noindexLines: NoindexLine[];
  /** Byte length of the body. */
  bytes: number;
  /** Byte offset of the first invalid UTF-8 sequence, or -1. */
  firstInvalidUtf8: number;
  /** 1-based line of the first invalid UTF-8 sequence, or null. */
  invalidUtf8Line: number | null;
  /** When the body exceeds the limit: the line containing byte 512,000 and the count of rules beyond it. */
  overLimit: { line: number; rulesBeyond: number } | null;
}

const SUPPORTED_FIELDS = new Set(["user-agent", "allow", "disallow", "sitemap"]);

/** The product token: the longest leading run of ASCII letters, digits, `_` and `-`. */
export function productToken(value: string): string {
  if (value.trim() === "*") return "*";
  const match = /^[A-Za-z0-9_-]+/.exec(value.trim());
  return (match?.[0] ?? "").toLowerCase();
}

interface RawLine {
  line: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

function splitLines(bytes: Uint8Array): RawLine[] {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const lines: RawLine[] = [];
  let start = 0;
  let lineNo = 1;
  const n = bytes.length;
  let i = 0;
  // Skip a leading UTF-8 BOM.
  if (n >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
    i = 3;
  }
  while (i <= n) {
    const b = i < n ? bytes[i] : 0x0a;
    if (i === n || b === 0x0a || b === 0x0d) {
      lines.push({
        line: lineNo,
        text: decoder.decode(bytes.subarray(start, i)),
        startOffset: start,
        endOffset: i,
      });
      lineNo += 1;
      if (b === 0x0d && bytes[i + 1] === 0x0a) i += 1;
      start = i + 1;
    }
    i += 1;
  }
  // Drop a trailing empty line produced by a final line break.
  const last = lines[lines.length - 1];
  if (last && last.text === "" && last.startOffset >= n) lines.pop();
  return lines;
}

export function parseRobotsTxt(bytes: Uint8Array): ParsedRobots {
  const invalid = firstInvalidUtf8(bytes);
  const result: ParsedRobots = {
    groups: [],
    sitemaps: [],
    ignored: [],
    noindexLines: [],
    bytes: bytes.length,
    firstInvalidUtf8: invalid,
    invalidUtf8Line: invalid >= 0 ? lineOfOffset(bytes, invalid) : null,
    overLimit: null,
  };

  const lines = splitLines(bytes);
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  let rulesBeyond = 0;
  let limitLine: number | null = null;

  for (const raw of lines) {
    const beyond = raw.endOffset > ROBOTS_PARSE_LIMIT;
    if (beyond && limitLine === null && raw.startOffset <= ROBOTS_PARSE_LIMIT) {
      limitLine = raw.line;
    }
    const noComment = raw.text.replace(/#.*$/, "");
    const text = noComment.trim();
    if (text === "") continue;
    const colon = text.indexOf(":");
    if (colon < 0) {
      if (!beyond) result.ignored.push({ line: raw.line, text, reason: "unparseable" });
      continue;
    }
    const field = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();

    if (beyond) {
      // A line that straddles or lies beyond the limit is dropped entirely.
      if (field === "allow" || field === "disallow") rulesBeyond += 1;
      result.ignored.push({ line: raw.line, text, reason: "beyond_limit" });
      continue;
    }

    if (field === "noindex") {
      result.noindexLines.push({ line: raw.line, text });
      result.ignored.push({ line: raw.line, text, reason: "unsupported_field" });
      lastWasAgent = false;
      continue;
    }
    if (!SUPPORTED_FIELDS.has(field)) {
      result.ignored.push({ line: raw.line, text, reason: "unsupported_field" });
      lastWasAgent = false;
      continue;
    }
    if (field === "sitemap") {
      result.sitemaps.push({ value, line: raw.line });
      // Sitemap lines belong to no group and do not end one.
      continue;
    }
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { tokens: [], agents: [], rules: [], line: raw.line };
        result.groups.push(current);
      }
      current.tokens.push(productToken(value));
      current.agents.push({ value, line: raw.line });
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) {
      result.ignored.push({ line: raw.line, text, reason: "rule_before_group" });
      continue;
    }
    if (value === "") continue; // An allow/disallow with an empty value is not a rule.
    if (!value.startsWith("/") && !value.startsWith("*")) {
      result.ignored.push({ line: raw.line, text, reason: "path_not_rooted" });
      continue;
    }
    current.rules.push({ kind: field as "allow" | "disallow", pattern: value, line: raw.line });
  }

  if (bytes.length > ROBOTS_PARSE_LIMIT) {
    result.overLimit = { line: limitLine ?? lineOfOffset(bytes, ROBOTS_PARSE_LIMIT), rulesBeyond };
  }
  return result;
}

/** Normalize a target or pattern the way §3.6 step 1 requires. */
export function normalizeRobotsPath(value: string): string {
  // Percent-encode non-ASCII as UTF-8, then normalize existing escapes.
  let encoded = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) encoded += ch;
    else encoded += encodeURIComponent(ch);
  }
  return normalizePercentEncoding(encoded);
}

function patternMatches(pattern: string, target: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split("*");
  // Greedy wildcard match without regular expressions, in octet space.
  let pos = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (i === 0) {
      if (!target.startsWith(part)) return false;
      pos = part.length;
      continue;
    }
    const isLast = i === parts.length - 1;
    if (isLast && anchored) {
      if (target.length - pos < part.length) return false;
      return target.endsWith(part);
    }
    const idx = target.indexOf(part, pos);
    if (idx < 0) return false;
    pos = idx + part.length;
  }
  if (parts.length === 1 && anchored) return target === body;
  return true;
}

export interface GroupSelection {
  /** The token that matched, or "*" for the wildcard fallback, or null when no rules apply. */
  token: string | null;
  groups: RobotsGroup[];
  rules: RobotsRule[];
}

/** Group selection for a crawler's ordered token chain (§3.6). */
export function selectGroups(robots: ParsedRobots, chain: readonly string[]): GroupSelection {
  for (const token of chain) {
    const wanted = token.toLowerCase();
    if (wanted === "*") continue;
    const matching = robots.groups.filter((group) => group.tokens.includes(wanted));
    if (matching.length > 0) {
      return { token: wanted, groups: matching, rules: matching.flatMap((g) => g.rules) };
    }
  }
  const wildcard = robots.groups.filter((group) => group.tokens.includes("*"));
  if (wildcard.length > 0) {
    return { token: "*", groups: wildcard, rules: wildcard.flatMap((g) => g.rules) };
  }
  return { token: null, groups: [], rules: [] };
}

export interface AccessDecision {
  allowed: boolean;
  /** The winning rule, when a rule matched. */
  rule: RobotsRule | null;
  /** The group containing the winning rule. */
  group: RobotsGroup | null;
  /** The token that selected the group. */
  token: string | null;
  /** A shorter competing allow rule that also matched, when the result is disallow. */
  competingAllow: RobotsRule | null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Decide access for a URL path (path plus "?query" when present) using the
 * rules selected for a crawler chain.
 */
export function decideAccess(
  robots: ParsedRobots,
  chain: readonly string[],
  pathWithQuery: string,
): AccessDecision {
  const target = normalizeRobotsPath(pathWithQuery);
  if (target === "/robots.txt") {
    return { allowed: true, rule: null, group: null, token: null, competingAllow: null };
  }
  const selection = selectGroups(robots, chain);
  let best: RobotsRule | null = null;
  let bestLength = -1;
  let bestAllow: RobotsRule | null = null;
  for (const rule of selection.rules) {
    const pattern = normalizeRobotsPath(rule.pattern);
    if (!patternMatches(pattern, target)) continue;
    const length = byteLength(rule.pattern);
    if (rule.kind === "allow" && (!bestAllow || length > byteLength(bestAllow.pattern))) {
      bestAllow = rule;
    }
    if (
      length > bestLength ||
      (length === bestLength && rule.kind === "allow" && best?.kind === "disallow")
    ) {
      best = rule;
      bestLength = length;
    }
  }
  const group = best ? selection.groups.find((g) => g.rules.includes(best!)) ?? null : null;
  const allowed = !best || best.kind === "allow";
  return {
    allowed,
    rule: best,
    group,
    token: selection.token,
    competingAllow: !allowed && bestAllow ? bestAllow : null,
  };
}

/** The group label for reasons: the user-agent value(s) of the group, joined. */
export function groupLabel(group: RobotsGroup | null): string {
  if (!group) return "*";
  return group.agents.map((agent) => agent.value).join(", ");
}

/** `Disallow: /path` as written in the file. */
export function ruleText(rule: RobotsRule): string {
  return `${rule.kind === "allow" ? "Allow" : "Disallow"}: ${rule.pattern}`;
}
