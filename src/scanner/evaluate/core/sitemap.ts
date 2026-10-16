/**
 * Sitemap parsing, KNOWLEDGE.md §3.13 and §4.7. XML is parsed with DTD
 * processing disabled (the parser never loads external entities).
 */

import { parseXml, XmlElement, XmlError, type XmlNode, XmlText, XmlCdata } from "@rgrove/parse-xml";
import { isGzip, gunzip } from "./gzip.js";
import { firstInvalidUtf8, lineOfOffset } from "./text.js";

export const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
export const XHTML_NS = "http://www.w3.org/1999/xhtml";
export const SITEMAP_BYTE_LIMIT = 52_428_800;

export interface SitemapEntry {
  /** Entity-decoded loc text, trimmed. */
  loc: string;
  lastmod: string | null;
  priority: string | null;
  changefreq: string | null;
  /** xhtml:link alternates on this URL entry. */
  alternates: { hreflang: string; href: string }[];
}

export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex" | "feed" | "plain" | "invalid";
  /** Uncompressed bytes after gzip decoding. */
  uncompressedBytes: number;
  gzip: boolean;
  gzipTruncated: boolean;
  /** XML well-formedness error, when any. */
  error: { message: string; line: number; column: number } | null;
  /** Root element name as written, and its resolved namespace. */
  root: { name: string; namespace: string | null } | null;
  entries: SitemapEntry[];
  /** For an index: child sitemap locs with lastmod. */
  children: { loc: string; lastmod: string | null }[];
  firstInvalidUtf8Line: number | null;
  hasPriorityOrChangefreq: boolean;
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

function prefixOf(name: string): string | null {
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(0, colon) : null;
}

function resolveNamespace(element: XmlElement, prefix: string | null): string | null {
  let node: XmlNode | null = element;
  while (node instanceof XmlElement) {
    const attrName = prefix === null ? "xmlns" : `xmlns:${prefix}`;
    if (attrName in node.attributes) return node.attributes[attrName]!;
    node = node.parent;
  }
  return null;
}

function elementNamespace(element: XmlElement): string | null {
  return resolveNamespace(element, prefixOf(element.name));
}

function textOf(element: XmlElement): string {
  let out = "";
  for (const child of element.children) {
    if (child instanceof XmlText || child instanceof XmlCdata) out += child.text;
  }
  return out.trim();
}

function childElements(element: XmlElement, local: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => child instanceof XmlElement && localName(child.name) === local,
  );
}

function firstChildText(element: XmlElement, local: string): string | null {
  const child = childElements(element, local)[0];
  return child ? textOf(child) : null;
}

export function parseSitemap(rawBytes: Uint8Array): ParsedSitemap {
  let bytes = rawBytes;
  let gzip = false;
  let gzipTruncated = false;
  if (isGzip(rawBytes)) {
    gzip = true;
    const out = gunzip(rawBytes, SITEMAP_BYTE_LIMIT + 1);
    if (out === null) {
      return {
        kind: "invalid",
        uncompressedBytes: rawBytes.length,
        gzip,
        gzipTruncated: false,
        error: { message: "invalid_gzip", line: 1, column: 1 },
        root: null,
        entries: [],
        children: [],
        firstInvalidUtf8Line: null,
        hasPriorityOrChangefreq: false,
      };
    }
    bytes = out.bytes;
    gzipTruncated = out.truncated;
    if (out.truncated) {
      // The file is beyond the protocol limit; report the declared size and sniff the root from the prefix.
      const prefix = new TextDecoder("utf-8", { fatal: false }).decode(out.bytes.subarray(0, 65_536));
      const isIndex = /<(?:[A-Za-z_][\w.-]*:)?sitemapindex[\s>]/.test(prefix);
      return {
        kind: isIndex ? "sitemapindex" : /<(?:[A-Za-z_][\w.-]*:)?urlset[\s>]/.test(prefix) ? "urlset" : "plain",
        uncompressedBytes: Math.max(out.declaredSize, SITEMAP_BYTE_LIMIT + 1),
        gzip,
        gzipTruncated: true,
        error: null,
        root: null,
        entries: [],
        children: [],
        firstInvalidUtf8Line: null,
        hasPriorityOrChangefreq: false,
      };
    }
  }

  const invalid = firstInvalidUtf8(bytes);
  const firstInvalidUtf8Line = invalid >= 0 ? lineOfOffset(bytes, invalid) : null;
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start));
  const firstChar = /^\s*(.)/s.exec(text)?.[1];

  const base: ParsedSitemap = {
    kind: "plain",
    uncompressedBytes: bytes.length,
    gzip,
    gzipTruncated,
    error: null,
    root: null,
    entries: [],
    children: [],
    firstInvalidUtf8Line,
    hasPriorityOrChangefreq: false,
  };

  if (firstChar !== "<") {
    // Plain-text sitemap: one URL per line.
    for (const line of text.split(/\r\n|\r|\n/)) {
      const value = line.trim();
      if (value === "") continue;
      base.entries.push({ loc: value, lastmod: null, priority: null, changefreq: null, alternates: [] });
    }
    return base;
  }

  let doc;
  try {
    doc = parseXml(text, { ignoreUndefinedEntities: true });
  } catch (error) {
    if (error instanceof XmlError) {
      return { ...base, kind: "invalid", error: { message: xmlErrorCode(error.message), line: error.line, column: error.column } };
    }
    return { ...base, kind: "invalid", error: { message: "not_well_formed", line: 1, column: 1 } };
  }
  const root = doc.root;
  if (!root) return { ...base, kind: "invalid", error: { message: "no_root_element", line: 1, column: 1 } };
  const rootLocal = localName(root.name);
  const namespace = elementNamespace(root);
  base.root = { name: root.name, namespace };

  if (rootLocal === "rss" || rootLocal === "feed") return { ...base, kind: "feed" };

  if (namespace !== SITEMAP_NS || (rootLocal !== "urlset" && rootLocal !== "sitemapindex")) {
    return { ...base, kind: "invalid" };
  }

  if (rootLocal === "sitemapindex") {
    base.kind = "sitemapindex";
    for (const child of childElements(root, "sitemap")) {
      const loc = firstChildText(child, "loc");
      if (loc === null) continue;
      base.children.push({ loc, lastmod: firstChildText(child, "lastmod") });
    }
    return base;
  }

  base.kind = "urlset";
  for (const urlEl of childElements(root, "url")) {
    const loc = firstChildText(urlEl, "loc");
    if (loc === null) continue;
    const priority = firstChildText(urlEl, "priority");
    const changefreq = firstChildText(urlEl, "changefreq");
    if (priority !== null || changefreq !== null) base.hasPriorityOrChangefreq = true;
    const alternates: { hreflang: string; href: string }[] = [];
    for (const link of childElements(urlEl, "link")) {
      if (elementNamespace(link) !== XHTML_NS) continue;
      const rel = link.attributes.rel ?? "";
      const hreflang = link.attributes.hreflang;
      const href = link.attributes.href;
      if (rel.split(/\s+/).includes("alternate") && hreflang !== undefined && href !== undefined) {
        alternates.push({ hreflang, href });
      }
    }
    base.entries.push({ loc, lastmod: firstChildText(urlEl, "lastmod"), priority, changefreq, alternates });
  }
  return base;
}

/** Map the parser's message to a versioned enumeration value (never emit library text). */
function xmlErrorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("end tag")) return "mismatched_end_tag";
  if (m.includes("attribute")) return "invalid_attribute";
  if (m.includes("entity")) return "invalid_entity_reference";
  if (m.includes("root")) return "invalid_root";
  if (m.includes("unclosed") || m.includes("unexpected end")) return "unexpected_end_of_input";
  return "not_well_formed";
}

/** Code point length of a string. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}
