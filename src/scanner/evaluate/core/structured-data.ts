/**
 * Structured data extraction, KNOWLEDGE.md §3.8.
 */

import { attr, elements, isInHead, lineOf, rawText, type Element, type ParsedHtml } from "./html.js";

export type JsonLdValue = string | number | boolean | null | JsonLdValue[] | { [key: string]: JsonLdValue };

export interface JsonLdBlock {
  line: number;
  inHead: boolean;
  raw: string;
  parsed: JsonLdValue | null;
  error: { code: string; line: number; column: number; excerpt: string } | null;
}

export interface SdItem {
  types: string[];
  value: { [key: string]: JsonLdValue };
  /** The block the item came from. */
  blockLine: number;
}

export function mimeEssence(type: string | null): string {
  if (type === null) return "text/javascript";
  return type.split(";")[0]!.trim().toLowerCase();
}

export function jsonLdBlocks(parsed: ParsedHtml): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  for (const script of elements(parsed.document, "script")) {
    if (mimeEssence(attr(script, "type")) !== "application/ld+json") continue;
    const raw = rawText(script).trim();
    const line = lineOf(script);
    try {
      const value = JSON.parse(raw) as JsonLdValue;
      blocks.push({ line, inHead: isInHead(parsed, script), raw, parsed: value, error: null });
    } catch (error) {
      blocks.push({ line, inHead: isInHead(parsed, script), raw, parsed: null, error: jsonError(error, raw, line) });
    }
  }
  return blocks;
}

function jsonError(error: unknown, raw: string, blockLine: number): JsonLdBlock["error"] {
  const message = error instanceof Error ? error.message : "";
  const position = /position (\d+)/.exec(message);
  let line = blockLine;
  let column = 1;
  if (position) {
    const pos = Number(position[1]);
    const before = raw.slice(0, pos);
    const lines = before.split("\n");
    line = blockLine + lines.length - 1;
    column = lines[lines.length - 1]!.length + 1;
  }
  let code = "invalid_json";
  const m = message.toLowerCase();
  if (m.includes("unexpected end")) code = "unexpected_end_of_input";
  else if (m.includes("unexpected token") || m.includes("unexpected non-whitespace")) code = "unexpected_token";
  else if (m.includes("bad control character")) code = "control_character_in_string";
  else if (m.includes("unterminated string")) code = "unterminated_string";
  return { code, line, column, excerpt: raw.slice(0, 80) };
}

export function typesOf(value: { [key: string]: JsonLdValue }): string[] {
  const raw = value["@type"];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/^https?:\/\/schema\.org\//, ""));
}

/** Walk every item (object with @type) in a parsed JSON-LD value, including @graph and nested objects. */
export function itemsOf(value: JsonLdValue, blockLine: number, out: SdItem[] = []): SdItem[] {
  if (Array.isArray(value)) {
    for (const member of value) itemsOf(member, blockLine, out);
    return out;
  }
  if (value === null || typeof value !== "object") return out;
  const types = typesOf(value);
  if (types.length > 0) out.push({ types, value, blockLine });
  for (const [key, child] of Object.entries(value)) {
    if (key === "@context") continue;
    itemsOf(child, blockLine, out);
  }
  return out;
}

export function allItems(blocks: JsonLdBlock[]): SdItem[] {
  const items: SdItem[] = [];
  for (const block of blocks) if (block.parsed !== null) itemsOf(block.parsed, block.line, items);
  return items;
}

/** Whether a value counts as present (§3.8). */
export function isPresent(value: JsonLdValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((member) => isPresent(member));
  return Object.keys(value).some((key) => key !== "@type" && key !== "@context" && key !== "@id");
}

/** Values reachable along a dotted path; arrays fan out. */
export function valuesAt(value: JsonLdValue | undefined, path: string): JsonLdValue[] {
  const segments = path.split(".");
  let current: JsonLdValue[] = value === undefined ? [] : [value];
  for (const segment of segments) {
    const next: JsonLdValue[] = [];
    for (const item of current) {
      const members = Array.isArray(item) ? item : [item];
      for (const member of members) {
        if (member !== null && typeof member === "object" && !Array.isArray(member)) {
          const child = (member as { [key: string]: JsonLdValue })[segment];
          if (child !== undefined) next.push(child);
        }
      }
    }
    current = next;
  }
  return current;
}

/** A property path is present when any value reachable along the path is present. `a | b` is satisfied by either. */
export function pathPresent(item: { [key: string]: JsonLdValue }, path: string): boolean {
  return path.split("|").some((alternative) => valuesAt(item, alternative.trim()).some((v) => isPresent(v)));
}

/** Count present members of a property that may be a single value or an array. */
export function presentCount(item: { [key: string]: JsonLdValue }, property: string): number {
  const value = item[property];
  if (value === undefined) return 0;
  if (Array.isArray(value)) return value.filter((member) => isPresent(member)).length;
  return isPresent(value) ? 1 : 0;
}

/** A URL from a string value or an ImageObject (url / contentUrl). */
export function urlOf(value: JsonLdValue | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return urlOf(value[0]);
  if (value && typeof value === "object") {
    const object = value as { [key: string]: JsonLdValue };
    return urlOf(object.url) ?? urlOf(object.contentUrl) ?? urlOf(object["@id"]);
  }
  return null;
}

export function stringOf(value: JsonLdValue | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return stringOf(value[0]);
  return null;
}

/** Microdata and RDFa are detected and counted only. */
export function countMicrodataAndRdfa(parsed: ParsedHtml): { microdata: number; rdfa: number } {
  let microdata = 0;
  let rdfa = 0;
  const all: Element[] = [];
  for (const el of elements(parsed.document, "*")) all.push(el);
  // elements() with "*" would not match; walk manually.
  for (const node of walkElements(parsed)) {
    if (node.attrs.some((a) => a.name === "itemscope")) microdata += 1;
    if (node.attrs.some((a) => a.name === "typeof" || a.name === "vocab")) rdfa += 1;
  }
  return { microdata, rdfa };
}

function* walkElements(parsed: ParsedHtml): Generator<Element> {
  const stack: Element[] = [];
  for (const child of parsed.document.childNodes) if ("tagName" in child) stack.push(child as Element);
  while (stack.length > 0) {
    const el = stack.pop()!;
    yield el;
    for (const child of el.childNodes) if ("tagName" in child) stack.push(child as Element);
  }
}
