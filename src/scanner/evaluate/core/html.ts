/**
 * HTML parsing with the HTML Standard tree-construction algorithm (parse5),
 * source locations, and the head-closing culprit of KNOWLEDGE.md §3.3.
 */

import { Parser, type DefaultTreeAdapterMap, html as parse5Html, type Token } from "parse5";
import { decodeHtml, type DecodedHtml } from "./encoding.js";
import { normalizeText } from "./text.js";

export type Document = DefaultTreeAdapterMap["document"];
export type Element = DefaultTreeAdapterMap["element"];
export type Node = DefaultTreeAdapterMap["node"];
export type ParentNode = DefaultTreeAdapterMap["parentNode"];
export type TextNode = DefaultTreeAdapterMap["textNode"];

export const HTML_NS = parse5Html.NS.HTML;

// parse5's InsertionMode enum is internal; these numeric values are stable in 8.x.
const IN_HEAD = 3;
const IN_HEAD_NO_SCRIPT = 4;
const TEXT = 7;
const IN_TEMPLATE = 17;

function inHeadMode(mode: number): boolean {
  return mode === IN_HEAD || mode === IN_HEAD_NO_SCRIPT;
}

export interface Culprit {
  /** "<iframe>" for an element, "text" for a non-whitespace character token. */
  label: string;
  tagName: string | null;
  line: number;
  offset: number;
  /** Tag names of elements written after the culprit and before X. */
  displaced: string[];
  /** Line of X: the first </head> end tag or <body> start tag token. */
  headClosedLine: number;
}

interface TagRecord {
  tagName: string;
  offset: number;
  line: number;
}

class ObservingParser extends Parser<DefaultTreeAdapterMap> {
  xOffset: number | null = null;
  xLine: number | null = null;
  candidate: { label: string; tagName: string | null; line: number; offset: number } | null = null;
  tagsAfterCandidate: TagRecord[] = [];

  private leftHead(before: number, token: Token.Token, label: string, tagName: string | null): void {
    if (!inHeadMode(before) || this.candidate !== null || !token.location) return;
    const after = this.insertionMode as number;
    // Raw-text elements (title, script, style, noscript, iframe...) switch to
    // the text mode and remember where to return; the head is left only when
    // that return point is outside the head.
    const stillInHead =
      inHeadMode(after) ||
      after === IN_TEMPLATE ||
      (after === TEXT && inHeadMode(this.originalInsertionMode as number));
    if (!stillInHead) {
      this.candidate = {
        label,
        tagName,
        line: token.location.startLine,
        offset: token.location.startOffset,
      };
    }
  }

  override onStartTag(token: Token.TagToken): void {
    const before = this.insertionMode as number;
    if (token.tagName === "body" && this.xOffset === null && token.location) {
      this.xOffset = token.location.startOffset;
      this.xLine = token.location.startLine;
    }
    if (this.candidate !== null && this.xOffset === null && token.location) {
      this.tagsAfterCandidate.push({
        tagName: token.tagName,
        offset: token.location.startOffset,
        line: token.location.startLine,
      });
    }
    super.onStartTag(token);
    if (token.tagName !== "body") this.leftHead(before, token, `<${token.tagName}>`, token.tagName);
  }

  override onEndTag(token: Token.TagToken): void {
    if (token.tagName === "head" && this.xOffset === null && token.location) {
      this.xOffset = token.location.startOffset;
      this.xLine = token.location.startLine;
    }
    super.onEndTag(token);
  }

  override onCharacter(token: Token.CharacterToken): void {
    const before = this.insertionMode as number;
    super.onCharacter(token);
    this.leftHead(before, token, "text", null);
  }

  override onNullCharacter(token: Token.CharacterToken): void {
    const before = this.insertionMode as number;
    super.onNullCharacter(token);
    this.leftHead(before, token, "text", null);
  }

  culprit(): Culprit | null {
    if (this.candidate === null || this.xOffset === null || this.xLine === null) return null;
    if (this.candidate.offset >= this.xOffset) return null;
    const displaced = this.tagsAfterCandidate
      .filter((tag) => tag.offset > this.candidate!.offset && tag.offset < this.xOffset!)
      .map((tag) => `<${tag.tagName}>`);
    return { ...this.candidate, displaced, headClosedLine: this.xLine };
  }
}

export interface ParsedHtml {
  document: Document;
  html: Element | null;
  head: Element | null;
  body: Element | null;
  culprit: Culprit | null;
  /** The culprit found when parsing with the scripting flag disabled (SEO-HEAD-06). */
  noscriptCulprit: Culprit | null;
  decoded: DecodedHtml;
  bytes: Uint8Array;
}

function parseWith(text: string, scriptingEnabled: boolean): { document: Document; culprit: Culprit | null } {
  const parser = new ObservingParser({ sourceCodeLocationInfo: true, scriptingEnabled });
  parser.tokenizer.write(text, true);
  return { document: parser.document, culprit: parser.culprit() };
}

export function parseHtml(bytes: Uint8Array, contentType: string | null): ParsedHtml {
  const decoded = decodeHtml(bytes, contentType);
  const scripting = parseWith(decoded.text, true);
  // The scripting flag changes tree construction only for noscript elements (HTML
  // Standard, "scripting flag"), and a tag name cannot be written with character
  // references. With no "noscript" in the text, both parses are identical, so the
  // second, the slowest step for large pages, is skipped.
  const noScripting = /noscript/i.test(decoded.text) ? parseWith(decoded.text, false) : scripting;
  const html = childElement(scripting.document, "html");
  const head = html ? childElement(html, "head") : null;
  const body = html ? childElement(html, "body") : null;
  return {
    document: scripting.document,
    html,
    head,
    body,
    culprit: scripting.culprit,
    noscriptCulprit: noScripting.culprit,
    decoded,
    bytes,
  };
}

export function isElement(node: Node): node is Element {
  return "tagName" in node && typeof (node as Element).tagName === "string";
}

export function isText(node: Node): node is TextNode {
  return node.nodeName === "#text";
}

export function isHtmlElement(node: Node, tagName?: string): node is Element {
  return isElement(node) && node.namespaceURI === HTML_NS && (tagName === undefined || node.tagName === tagName);
}

function childElement(parent: ParentNode, tagName: string): Element | null {
  for (const child of parent.childNodes) {
    if (isHtmlElement(child, tagName)) return child;
  }
  return null;
}

export function attr(element: Element, name: string): string | null {
  const found = element.attrs.find((a) => a.name === name && !a.prefix);
  return found ? found.value : null;
}

export function hasAttr(element: Element, name: string): boolean {
  return element.attrs.some((a) => a.name === name && !a.prefix);
}

/** Pre-order walk over every node, including template contents. */
export function* walk(root: ParentNode, includeTemplates = true): Generator<Node> {
  const stack: Node[] = [...root.childNodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    yield node;
    if ("childNodes" in node) {
      const children = (node as ParentNode).childNodes;
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]!);
    }
    if (includeTemplates && node.nodeName === "template" && "content" in node) {
      const content = (node as DefaultTreeAdapterMap["template"]).content;
      for (let i = content.childNodes.length - 1; i >= 0; i -= 1) stack.push(content.childNodes[i]!);
    }
  }
}

/** HTML-namespace elements with the given tag name, in document order. */
export function elements(root: ParentNode, tagName: string, includeTemplates = false): Element[] {
  const out: Element[] = [];
  for (const node of walk(root, includeTemplates)) {
    if (isHtmlElement(node, tagName)) out.push(node);
  }
  return out;
}

export function allElements(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const node of walk(root, false)) if (isElement(node)) out.push(node);
  return out;
}

/** True when the element is a descendant of the document's head element. */
export function isInHead(parsed: ParsedHtml, element: Element): boolean {
  if (!parsed.head) return false;
  let node: ParentNode | null = element.parentNode;
  while (node) {
    if (node === parsed.head) return true;
    node = "parentNode" in node ? (node as Element).parentNode : null;
  }
  return false;
}

export function isDescendantOf(element: Element, ancestor: Element): boolean {
  let node: ParentNode | null = element.parentNode;
  while (node) {
    if (node === ancestor) return true;
    node = "parentNode" in node ? (node as Element).parentNode : null;
  }
  return false;
}

export function hasAncestorTag(element: Element, tagNames: Set<string>): boolean {
  let node: ParentNode | null = element.parentNode;
  while (node) {
    if (isElement(node) && tagNames.has(node.tagName)) return true;
    node = "parentNode" in node ? (node as Element).parentNode : null;
  }
  return false;
}

export function lineOf(element: Element): number {
  return element.sourceCodeLocation?.startLine ?? 0;
}

export function offsetOf(element: Element): number | null {
  return element.sourceCodeLocation?.startOffset ?? null;
}

export function endOffsetOf(element: Element): number | null {
  const loc = element.sourceCodeLocation;
  if (!loc) return null;
  return loc.endTag?.endOffset ?? loc.startTag?.endOffset ?? loc.endOffset;
}

/** Raw text content of an element (concatenated text nodes, no normalization). */
export function rawText(element: Element): string {
  let out = "";
  for (const node of walk(element, false)) {
    if (isText(node)) out += node.value;
  }
  return out;
}

export function text(element: Element): string {
  return normalizeText(rawText(element));
}

const INVISIBLE = new Set(["script", "style", "template", "noscript"]);

/** Visible text per KNOWLEDGE.md §3.4 (raw mode). */
export function visibleText(parsed: ParsedHtml): string {
  if (!parsed.body) return "";
  let out = "";
  const skip = (node: Node): boolean => {
    let cur: ParentNode | null = isElement(node) ? node : (node as TextNode).parentNode;
    while (cur && isElement(cur)) {
      if (INVISIBLE.has(cur.tagName) || hasAttr(cur, "hidden")) return true;
      cur = cur.parentNode;
    }
    return false;
  };
  for (const node of walk(parsed.body, false)) {
    if (isText(node) && !skip(node)) out += `${node.value} `;
  }
  return normalizeText(out);
}

/** Byte offset in the original body of a character offset in the decoded text. */
export function byteOffset(parsed: ParsedHtml, charOffset: number): number {
  const { encoding, bomLength, text: decodedText } = parsed.decoded;
  if (encoding === "utf-8") {
    return bomLength + new TextEncoder().encode(decodedText.slice(0, charOffset)).length;
  }
  if (encoding === "utf-16le" || encoding === "utf-16be") return bomLength + charOffset * 2;
  // Single-byte encodings: one byte per character.
  return bomLength + charOffset;
}

export function relTokens(element: Element): string[] {
  const rel = attr(element, "rel") ?? "";
  return rel
    .split(/[\t\n\f\r ]+/)
    .filter((token) => token !== "")
    .map((token) => token.toLowerCase());
}

export function hasRel(element: Element, token: string): boolean {
  return relTokens(element).includes(token);
}

/** The document base URL: the first <base href> in the head, resolved against the document URL, else the document URL. */
export function baseUrl(parsed: ParsedHtml, documentUrl: string): string {
  if (parsed.head) {
    for (const base of elements(parsed.head, "base")) {
      const href = attr(base, "href");
      if (href !== null) {
        try {
          return new URL(href.trim(), documentUrl).toString();
        } catch {
          return documentUrl;
        }
      }
    }
  }
  return documentUrl;
}

/** Position of the first heading-like element etc. is handled by rules; expose a generic finder. */
export function firstElement(parsed: ParsedHtml, tagName: string): Element | null {
  for (const node of walk(parsed.document, false)) {
    if (isHtmlElement(node, tagName)) return node;
  }
  return null;
}

/** Meta elements by case-insensitive name or http-equiv. */
export function metaByName(parsed: ParsedHtml, name: string): Element[] {
  const wanted = name.toLowerCase();
  return elements(parsed.document, "meta").filter((meta) => (attr(meta, "name") ?? "").trim().toLowerCase() === wanted);
}

export function metaByHttpEquiv(parsed: ParsedHtml, name: string): Element[] {
  const wanted = name.toLowerCase();
  return elements(parsed.document, "meta").filter(
    (meta) => (attr(meta, "http-equiv") ?? "").trim().toLowerCase() === wanted,
  );
}
