/**
 * Effective robots directives per URL and engine, KNOWLEDGE.md §3.7.
 */

import { parseUnavailableAfter } from "./dates.js";

export const GOOGLE_RULE_NAMES = new Set([
  "all",
  "noindex",
  "nofollow",
  "none",
  "nosnippet",
  "indexifembedded",
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "notranslate",
  "noimageindex",
  "unavailable_after",
]);

export const GOOGLE_UNUSED_RULES = new Set(["noarchive", "nocache", "nositelinkssearchbox"]);

export type DirectiveSource =
  | { kind: "meta"; name: string; line: number; content: string }
  | { kind: "header"; value: string };

export interface DirectiveInput {
  source: DirectiveSource;
  /** Raw segments after scope handling and splitting. */
  segments: string[];
  /** When the header value named a user-agent scope. */
  scopedTo: string | null;
  /** True when this input applies to Google. */
  appliesToGoogle: boolean;
}

export interface EffectiveDirectives {
  inputs: DirectiveInput[];
  noindex: boolean;
  nofollow: boolean;
  nosnippet: boolean;
  noimageindex: boolean;
  notranslate: boolean;
  indexifembedded: boolean;
  /** Smallest non-negative max-snippet, -1 for no limit, null when absent. */
  maxSnippet: number | null;
  maxImagePreview: string | null;
  maxVideoPreview: number | null;
  /** Parsed unavailable_after instants (ms). */
  unavailableAfter: { raw: string; instant: number | null; source: DirectiveSource }[];
  /** Rules recorded as not used by Google Search. */
  unused: string[];
  /** Unrecognized segments. */
  unrecognized: string[];
  /** The directive source and literal directive that produced noindex, for reasons. */
  noindexFrom: { directive: string; source: DirectiveSource } | null;
  /** True when unavailable_after has passed at completed_at. */
  unavailableAfterPassed: { raw: string; source: DirectiveSource } | null;
}

export interface RawDirectiveInputs {
  metas: { name: string; content: string; line: number }[];
  xRobotsTag: string[];
}

/** Split an X-Robots-Tag field into scope and segments (§3.7 step 1). */
export function splitHeaderField(value: string): { scopedTo: string | null; segments: string[] } {
  const trimmed = value.trim();
  const colon = trimmed.indexOf(":");
  let scopedTo: string | null = null;
  let rest = trimmed;
  if (colon > 0) {
    const token = trimmed.slice(0, colon).trim().toLowerCase();
    if (!GOOGLE_RULE_NAMES.has(token) && !GOOGLE_UNUSED_RULES.has(token) && !token.includes(",")) {
      scopedTo = token;
      rest = trimmed.slice(colon + 1);
    }
  }
  return { scopedTo, segments: splitSegments(rest) };
}

/** Split on commas, rejoining the pieces of an RFC 850 unavailable_after date. */
export function splitSegments(value: string): string[] {
  const raw = value.split(",");
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const part = raw[i]!.trim();
    if (part === "") continue;
    if (/^unavailable_after\s*:/i.test(part)) {
      let joined = raw[i]!;
      while (i + 1 < raw.length) {
        const next = raw[i + 1]!;
        const name = next.split(":")[0]!.trim().toLowerCase();
        if (GOOGLE_RULE_NAMES.has(name) || GOOGLE_UNUSED_RULES.has(name)) break;
        joined += `,${next}`;
        i += 1;
      }
      out.push(joined.trim());
    } else {
      out.push(part);
    }
  }
  return out;
}

export function effectiveGoogleDirectives(raw: RawDirectiveInputs, completedAtMs: number): EffectiveDirectives {
  const inputs: DirectiveInput[] = [];
  for (const meta of raw.metas) {
    const name = meta.name.trim().toLowerCase();
    if (name !== "robots" && name !== "googlebot") continue;
    inputs.push({
      source: { kind: "meta", name, line: meta.line, content: meta.content },
      segments: splitSegments(meta.content),
      scopedTo: null,
      appliesToGoogle: true,
    });
  }
  for (const header of raw.xRobotsTag) {
    const { scopedTo, segments } = splitHeaderField(header);
    inputs.push({
      source: { kind: "header", value: header },
      segments,
      scopedTo,
      appliesToGoogle: scopedTo === null || scopedTo === "googlebot",
    });
  }

  const result: EffectiveDirectives = {
    inputs,
    noindex: false,
    nofollow: false,
    nosnippet: false,
    noimageindex: false,
    notranslate: false,
    indexifembedded: false,
    maxSnippet: null,
    maxImagePreview: null,
    maxVideoPreview: null,
    unavailableAfter: [],
    unused: [],
    unrecognized: [],
    noindexFrom: null,
    unavailableAfterPassed: null,
  };

  for (const input of inputs) {
    if (!input.appliesToGoogle) continue;
    for (const segment of input.segments) {
      const colon = segment.indexOf(":");
      const name = (colon >= 0 ? segment.slice(0, colon) : segment).trim().toLowerCase();
      const value = colon >= 0 ? segment.slice(colon + 1).trim() : "";
      switch (name) {
        case "all":
          break;
        case "noindex":
          result.noindex = true;
          result.noindexFrom ??= { directive: "noindex", source: input.source };
          break;
        case "none":
          result.noindex = true;
          result.nofollow = true;
          result.noindexFrom ??= { directive: "none", source: input.source };
          break;
        case "nofollow":
          result.nofollow = true;
          break;
        case "nosnippet":
          result.nosnippet = true;
          break;
        case "noimageindex":
          result.noimageindex = true;
          break;
        case "notranslate":
          result.notranslate = true;
          break;
        case "indexifembedded":
          result.indexifembedded = true;
          break;
        case "max-snippet": {
          const n = /^-?\d+$/.test(value) ? Number(value) : null;
          if (n === null) {
            result.unrecognized.push(segment);
            break;
          }
          if (n === 0) result.nosnippet = true;
          if (n >= 0) {
            result.maxSnippet = result.maxSnippet === null || result.maxSnippet === -1 ? n : Math.min(result.maxSnippet, n);
          } else if (result.maxSnippet === null) {
            result.maxSnippet = -1;
          }
          break;
        }
        case "max-image-preview": {
          const v = value.toLowerCase();
          if (v === "none" || v === "standard" || v === "large") result.maxImagePreview = v;
          else result.unrecognized.push(segment);
          break;
        }
        case "max-video-preview": {
          const n = /^-?\d+$/.test(value) ? Number(value) : null;
          if (n === null) result.unrecognized.push(segment);
          else result.maxVideoPreview = result.maxVideoPreview === null ? n : Math.min(result.maxVideoPreview, n);
          break;
        }
        case "unavailable_after": {
          const instant = parseUnavailableAfter(value);
          result.unavailableAfter.push({ raw: value, instant, source: input.source });
          if (instant !== null && instant <= completedAtMs) {
            result.noindex = true;
            result.unavailableAfterPassed ??= { raw: value, source: input.source };
          }
          break;
        }
        default:
          if (GOOGLE_UNUSED_RULES.has(name)) result.unused.push(name);
          else result.unrecognized.push(segment);
      }
    }
  }
  return result;
}

/** Bing's informational reading: meta robots and unprefixed X-Robots-Tag values. */
export function bingDirectiveTokens(raw: RawDirectiveInputs): string[] {
  const tokens: string[] = [];
  for (const meta of raw.metas) {
    if (meta.name.trim().toLowerCase() !== "robots") continue;
    tokens.push(...splitSegments(meta.content).map((s) => s.toLowerCase()));
  }
  for (const header of raw.xRobotsTag) {
    const { scopedTo, segments } = splitHeaderField(header);
    if (scopedTo !== null) continue;
    tokens.push(...segments.map((s) => s.toLowerCase()));
  }
  return tokens;
}

/** Human label for a directive source: meta robots (line 12), meta googlebot (line 12), X-Robots-Tag header. */
export function describeSource(source: DirectiveSource): string {
  if (source.kind === "header") return "the X-Robots-Tag header";
  return `meta ${source.name} (line ${source.line})`;
}
