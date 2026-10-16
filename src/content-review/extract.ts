/**
 * Content extraction for the advisory review (PRODUCT.md §17.2): a pure
 * function of the snapshot and configuration, so one snapshot always gives
 * the model the same input.
 */

import type { ScanConfig } from "../scanner/config.js";
import { EvaluationContext, type Page } from "../scanner/evaluate/context.js";
import { attr, elements, hasAttr, isElement, isText, metaByName, text as elementText, type Element, type Node, type ParsedHtml } from "../scanner/evaluate/core/html.js";
import { allItems, jsonLdBlocks, stringOf, type JsonLdValue, type SdItem } from "../scanner/evaluate/core/structured-data.js";
import { compareBytes, normalizeText } from "../scanner/evaluate/core/text.js";
import { comparisonKey } from "../scanner/evaluate/core/url.js";
import { accessMatrixRow } from "../scanner/evaluate/rules/ai.js";
import { outcomeLabel } from "../scanner/evaluate/rules/helpers.js";
import { CRAWLERS } from "../scanner/rules/crawlers.js";
import { header, isHtmlMediaType } from "../scanner/snapshot/access.js";
import type { Snapshot } from "../scanner/snapshot/types.js";
import type { CrawlerAccess, LlmsTxtContent, LlmsTxtStructure, PageContent, QaPair, SiteContent } from "./types.js";

export const DEFAULT_REVIEW_PAGES = 6;
export const MAX_REVIEW_PAGES = 20;
const MAX_TEXT_CHARS = 12_000;
const MAX_LLMS_CHARS = 20_000;
const MAX_HEADINGS = 40;
const MAX_QA = 20;

export interface ExtractOptions {
  pages?: number;
}

export function extractContent(snapshot: Snapshot, config: ScanConfig, options: ExtractOptions = {}): SiteContent {
  const limit = Math.max(1, Math.min(options.pages ?? DEFAULT_REVIEW_PAGES, MAX_REVIEW_PAGES));
  const ctx = new EvaluationContext(snapshot, config);

  const depths = new Map<string, number>();
  for (const entry of snapshot.crawl) {
    const key = comparisonKey(entry.url);
    if (key !== null && !depths.has(key)) depths.set(key, entry.depth);
  }

  const seen = new Set<string>();
  const candidates: { url: string; page: Page; depth: number | null }[] = [];
  for (const url of ctx.intended) {
    const page = ctx.page(url);
    if (!page || page.directives.noindex || ctx.disallowedForAnySelectedEngine(url)) continue;
    const finalUrl = page.chain.finalUrl;
    if (seen.has(finalUrl)) continue;
    seen.add(finalUrl);
    candidates.push({ url: finalUrl, page, depth: depths.get(finalUrl) ?? depths.get(url) ?? null });
  }
  candidates.sort((a, b) => {
    if (a.url === ctx.homePage) return -1;
    if (b.url === ctx.homePage) return 1;
    const da = a.depth ?? Number.MAX_SAFE_INTEGER;
    const db = b.depth ?? Number.MAX_SAFE_INTEGER;
    return da !== db ? da - db : compareBytes(a.url, b.url);
  });

  const homeItems = ctx.page(ctx.homePage) ? allItems(jsonLdBlocks(ctx.page(ctx.homePage)!.parsed)) : [];

  return {
    version: 1,
    snapshotId: snapshot.snapshot_id,
    origin: ctx.preferredOrigin,
    homePage: ctx.homePage,
    scannedAt: snapshot.completed_at,
    siteName: firstName(homeItems, (types) => types.includes("WebSite")),
    organizationName: firstName(homeItems, isOrganization),
    candidates: candidates.length,
    pages: candidates.slice(0, limit).map((c) => pageContent(c.url, c.page, c.depth)),
    llmsTxt: llmsTxt(ctx),
    crawlerAccess: crawlerAccess(ctx),
  };
}

// ------------------------------------------------------------------- pages

function pageContent(url: string, page: Page, depth: number | null): PageContent {
  const parsed = page.parsed;
  const head = parsed.head;
  const titleEl = head ? elements(head, "title")[0] : undefined;
  const description = metaByName(parsed, "description")[0];
  const items = allItems(jsonLdBlocks(parsed));
  const main = mainText(parsed);
  const images = parsed.body ? elements(parsed.body, "img") : [];

  return {
    url,
    depth,
    title: titleEl ? elementText(titleEl) : null,
    metaDescription: description ? normalizeText(attr(description, "content") ?? "") : null,
    ogTitle: metaProperty(parsed, "og:title"),
    ogDescription: metaProperty(parsed, "og:description"),
    canonical: page.headCanonicals[0]?.key ?? null,
    lang: parsed.html ? attr(parsed.html, "lang") : null,
    headings: headingsOf(parsed),
    text: main.text,
    textTruncated: main.truncated,
    wordCount: main.words,
    streamingFallback: main.streamingFallback,
    visibleQa: detailsPairs(parsed),
    questionHeadings: headingsOf(parsed, 6)
      .filter((h) => h.level > 1 && /[?？]$/.test(h.text))
      .map((h) => h.text)
      .slice(0, MAX_QA),
    jsonLdTypes: [...new Set(items.flatMap((item) => item.types))].sort(compareBytes),
    faqMarkup: faqMarkup(items),
    authors: authorsOf(parsed, items),
    datePublished: firstString(items, "datePublished"),
    dateModified: firstString(items, "dateModified"),
    images: images.length,
    imagesWithoutAlt: images.filter((img) => attr(img, "alt") === null).length,
    nosnippet: page.directives.nosnippet,
  };
}

function metaProperty(parsed: ParsedHtml, property: string): string | null {
  const meta = elements(parsed.document, "meta").find((m) => (attr(m, "property") ?? "").trim().toLowerCase() === property);
  return meta ? normalizeText(attr(meta, "content") ?? "") : null;
}

function headingsOf(parsed: ParsedHtml, maxLevel = 3): { level: number; text: string }[] {
  if (!parsed.body) return [];
  const out: { level: number; text: string }[] = [];
  for (const el of visibleElements(parsed.body)) {
    const level = headingLevel(el);
    if (level === 0 || level > maxLevel) continue;
    const value = elementText(el);
    if (value !== "") out.push({ level, text: value });
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

function headingLevel(el: Element): number {
  const m = /^h([1-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : 0;
}

/** Elements in document order, skipping hidden subtrees and non-content elements. */
function* visibleElements(root: Element): Generator<Element> {
  const stack: Node[] = [...root.childNodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!isElement(node) || SKIP.has(node.tagName) || isHidden(node)) continue;
    yield node;
    for (let i = node.childNodes.length - 1; i >= 0; i -= 1) stack.push(node.childNodes[i]!);
  }
}

function detailsPairs(parsed: ParsedHtml): QaPair[] {
  if (!parsed.body) return [];
  const out: QaPair[] = [];
  for (const details of elements(parsed.body, "details")) {
    const summary = details.childNodes.find((n): n is Element => isElement(n) && n.tagName === "summary");
    if (!summary) continue;
    const question = elementText(summary);
    if (question === "") continue;
    const answer = normalizeText(
      details.childNodes
        .filter((n) => n !== summary)
        .map((n) => (isElement(n) ? elementText(n) : isText(n) ? n.value : ""))
        .join(" "),
    );
    out.push({ question, answer, collapsed: !hasAttr(details, "open") });
    if (out.length >= MAX_QA) break;
  }
  return out;
}

// ------------------------------------------------------------ main content

const SKIP = new Set(["script", "style", "template", "noscript", "svg", "iframe", "object", "embed", "canvas", "select", "datalist", "dialog"]);
const OUTSIDE_MAIN = new Set(["nav", "footer", "aside"]);
/** Inline elements that sites place side by side without whitespace, such as rows of links. */
const WORD_BOUNDARY = new Set(["a", "button", "label"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "caption", "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure",
  "footer", "form", "header", "hgroup", "hr", "main", "ol", "p", "pre", "section", "table", "tbody", "tfoot", "thead", "ul",
]);

/** React streams server-rendered Suspense content into <div hidden id="S:n"> and an inline script moves it into place. */
function isStreamingSegment(el: Element): boolean {
  return el.tagName === "div" && hasAttr(el, "hidden") && /^S:\d+$/.test(attr(el, "id") ?? "");
}

function isHidden(el: Element): boolean {
  if (isStreamingSegment(el)) return false;
  return hasAttr(el, "hidden") || (attr(el, "aria-hidden") ?? "").trim().toLowerCase() === "true";
}

function inStreamingSegment(el: Element): boolean {
  for (let node = el.parentNode; node && isElement(node); node = node.parentNode) {
    if (isStreamingSegment(node)) return true;
  }
  return false;
}

class TextBuilder {
  readonly lines: string[] = [];
  private inline = "";
  private prefix = "";
  length = 0;
  words = 0;
  truncated = false;

  append(value: string): void {
    this.inline += value;
  }

  block(prefix = ""): void {
    this.flush();
    this.prefix = prefix;
  }

  flush(): void {
    const value = normalizeText(this.inline);
    const prefix = this.prefix;
    this.inline = "";
    this.prefix = "";
    if (value === "") return;
    this.words += value.split(" ").length;
    if (this.truncated) return;
    const line = prefix + value;
    if (this.length + line.length + 1 > MAX_TEXT_CHARS) {
      this.truncated = true;
      return;
    }
    this.lines.push(line);
    this.length += line.length + 1;
  }
}

interface MainText {
  text: string;
  truncated: boolean;
  words: number;
  /** What the first main element shows before scripts move streamed content into place. */
  streamingFallback: string | null;
}

function serializeRoot(root: Element, chrome: boolean): Omit<MainText, "streamingFallback"> {
  const builder = new TextBuilder();
  serialize(root, builder, { chrome, collapsed: false });
  builder.flush();
  return { text: builder.lines.join("\n"), truncated: builder.truncated, words: builder.words };
}

/**
 * Main content (PRODUCT.md §17.2): the main element with the most text (the
 * first one is often a streaming fallback), else the only article, else the
 * body without site chrome.
 */
function mainText(parsed: ParsedHtml): MainText {
  if (!parsed.body) return { text: "", truncated: false, words: 0, streamingFallback: null };
  const visible = [...visibleElements(parsed.body)];
  const mains = visible.filter((el) => el.tagName === "main");
  if (mains.length > 0) {
    const texts = mains.map((main) => serializeRoot(main, false));
    let best = 0;
    texts.forEach((t, i) => {
      if (t.words > texts[best]!.words) best = i;
    });
    const streamed = best > 0 && inStreamingSegment(mains[best]!);
    return { ...texts[best]!, streamingFallback: streamed ? texts[0]!.text.slice(0, 300) : null };
  }
  const articles = visible.filter((el) => el.tagName === "article");
  if (articles.length === 1) return { ...serializeRoot(articles[0]!, false), streamingFallback: null };
  return { ...serializeRoot(parsed.body, true), streamingFallback: null };
}

interface SerializeState {
  chrome: boolean;
  collapsed: boolean;
}

function serialize(el: Element, out: TextBuilder, state: SerializeState): void {
  for (const child of el.childNodes) serializeNode(child, out, state);
}

function serializeNode(node: Node, out: TextBuilder, state: SerializeState): void {
  if (isText(node)) {
    out.append(node.value);
    return;
  }
  if (!isElement(node)) return;
  const tag = node.tagName;
  if (SKIP.has(tag) || isHidden(node)) return;
  if (state.chrome && (OUTSIDE_MAIN.has(tag) || (tag === "header" && elements(node, "h1").length === 0))) return;
  const mark = state.collapsed ? "[collapsed] " : "";
  const level = headingLevel(node);
  if (level > 0) {
    out.block(`${mark}${"#".repeat(level)} `);
    serialize(node, out, state);
    out.flush();
  } else if (tag === "li") {
    out.block(`${mark}- `);
    serialize(node, out, state);
    out.flush();
  } else if (tag === "tr") {
    out.block(`${mark}| `);
    serialize(node, out, state);
    out.flush();
  } else if (tag === "td" || tag === "th") {
    serialize(node, out, state);
    out.append(" | ");
  } else if (tag === "details") {
    // The summary stays visible when the details element is closed; the rest does not.
    const inner = { ...state, collapsed: state.collapsed || !hasAttr(node, "open") };
    out.block(mark);
    for (const part of node.childNodes) {
      if (isElement(part) && part.tagName === "summary") {
        out.block(`${mark}[toggle] `);
        serialize(part, out, state);
        out.flush();
      } else serializeNode(part, out, inner);
    }
    out.flush();
  } else if (tag === "br") {
    out.block(mark);
  } else if (tag === "img") {
    const alt = normalizeText(attr(node, "alt") ?? "");
    if (alt !== "") out.append(` [image: ${alt}] `);
  } else if (BLOCK.has(tag)) {
    out.block(mark);
    serialize(node, out, state);
    out.flush();
  } else if (WORD_BOUNDARY.has(tag)) {
    out.append(" ");
    serialize(node, out, state);
    out.append(" ");
  } else {
    serialize(node, out, state);
  }
}

// --------------------------------------------------------- structured data

function isOrganization(types: string[]): boolean {
  return types.some((t) => t === "Organization" || t === "LocalBusiness" || t === "Corporation" || t === "NGO" || t.endsWith("Business") || t.endsWith("Store") || t.endsWith("Organization"));
}

function firstName(items: SdItem[], match: (types: string[]) => boolean): string | null {
  for (const item of items) {
    if (!match(item.types)) continue;
    const name = stringOf(item.value.name);
    if (name && name.trim() !== "") return normalizeText(name);
  }
  return null;
}

function firstString(items: SdItem[], property: string): string | null {
  for (const item of items) {
    const value = stringOf(item.value[property]);
    if (value && value.trim() !== "") return normalizeText(value);
  }
  return null;
}

function plain(value: JsonLdValue | undefined): string {
  const raw = stringOf(value) ?? "";
  return normalizeText(raw.replace(/<[^>]*>/g, " "));
}

function faqMarkup(items: SdItem[]): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (const item of items) {
    if (!item.types.includes("Question")) continue;
    const question = plain(item.value.name);
    if (question === "") continue;
    const accepted = item.value.acceptedAnswer ?? item.value.suggestedAnswer;
    const first = Array.isArray(accepted) ? accepted[0] : accepted;
    const answer = first && typeof first === "object" && !Array.isArray(first) ? plain((first as { [k: string]: JsonLdValue }).text) : "";
    out.push({ question, answer });
    if (out.length >= MAX_QA) break;
  }
  return out;
}

function authorsOf(parsed: ParsedHtml, items: SdItem[]): string[] {
  const names = new Set<string>();
  for (const meta of metaByName(parsed, "author")) {
    const value = normalizeText(attr(meta, "content") ?? "");
    if (value !== "") names.add(value);
  }
  for (const item of items) {
    const author = item.value.author;
    for (const entry of Array.isArray(author) ? author : author === undefined ? [] : [author]) {
      const name = typeof entry === "string" ? entry : entry && typeof entry === "object" && !Array.isArray(entry) ? stringOf((entry as { [k: string]: JsonLdValue }).name) : null;
      if (name && name.trim() !== "") names.add(normalizeText(name));
    }
  }
  return [...names].sort(compareBytes).slice(0, 5);
}

// ------------------------------------------------------------- site level

/** /llms.txt on the preferred origin as the snapshot holds it; the llms.txt checker reads it the same way. */
export function llmsTxt(ctx: EvaluationContext): LlmsTxtContent {
  const url = `${ctx.preferredOrigin}/llms.txt`;
  const empty = { url, found: false, servedHtml: false, text: null, truncated: false, structure: null };
  if (!ctx.primaryExchange(url)) return { ...empty, outcome: "not fetched" };
  const final = ctx.chain(url).final;
  if (!final) return { ...empty, outcome: "no final response" };
  const outcome = outcomeLabel(final);
  if (final.outcome !== "response" || final.status !== 200) return { ...empty, outcome };
  const bytes = ctx.body(final) ?? new Uint8Array(0);
  const decoded = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const servedHtml = isHtmlMediaType(header(final, "content-type")) || /^\s*<(!doctype|html)/i.test(decoded);
  if (servedHtml) return { ...empty, outcome, servedHtml: true };
  const truncated = decoded.length > MAX_LLMS_CHARS || final.truncated;
  const text = decoded.slice(0, MAX_LLMS_CHARS);
  return { url, outcome, found: true, servedHtml: false, text, truncated, structure: llmsStructure(text) };
}

/** Targets of Markdown links, [name](url), in one line of text. */
function linkTargets(line: string): string[] {
  return [...line.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map((match) => match[1]!);
}

/** Every Markdown link target in an llms.txt file, in order. */
export function llmsLinkTargets(text: string): string[] {
  return text.split(/\r\n|\r|\n/).flatMap((line) => linkTargets(line.trim()));
}

/** The structure the llms.txt proposal defines: H1 name, blockquote summary, H2 sections of link lists. */
export function llmsStructure(text: string): LlmsTxtStructure {
  const lines = text.split(/\r\n|\r|\n/);
  const firstContent = lines.find((line) => line.trim() !== "") ?? "";
  const h1Match = /^#\s+(.+)$/.exec(firstContent.trim());
  const sections: { title: string; links: number }[] = [];
  const summary: string[] = [];
  let links = 0;
  let markdownLinks = 0;
  let inPreamble = true;
  for (const line of lines) {
    const trimmed = line.trim();
    const h2 = /^##\s+(.+)$/.exec(trimmed);
    if (h2) {
      inPreamble = false;
      sections.push({ title: h2[1]!.trim(), links: 0 });
      continue;
    }
    if (inPreamble && trimmed.startsWith(">")) summary.push(trimmed.replace(/^>\s?/, ""));
    for (const target of linkTargets(trimmed)) {
      links += 1;
      if (/\.md(?:$|[?#])/i.test(target)) markdownLinks += 1;
      if (sections.length > 0) sections[sections.length - 1]!.links += 1;
    }
  }
  return {
    h1: h1Match ? h1Match[1]!.trim() : null,
    summary: summary.length > 0 ? normalizeText(summary.join(" ")) : null,
    sections,
    links,
    markdownLinks,
  };
}

function crawlerAccess(ctx: EvaluationContext): CrawlerAccess[] {
  return CRAWLERS.map((crawler) => {
    const home = accessMatrixRow(ctx, crawler.token)[0]!;
    return {
      crawler: crawler.token,
      operator: crawler.operator,
      purpose: crawler.purpose,
      outcome: home.outcome,
      rule: home.rule,
      userTriggered: crawler.userTriggered,
    };
  });
}
