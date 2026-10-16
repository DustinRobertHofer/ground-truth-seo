import { header } from "../../snapshot/access.js";
import { charsetFromContentType, resolveEncodingLabel } from "../core/encoding.js";
import {
  attr,
  byteOffset,
  elements,
  endOffsetOf,
  hasAttr,
  isDescendantOf,
  isInHead,
  lineOf,
  metaByHttpEquiv,
  metaByName,
  offsetOf,
  relTokens,
  text as elementText,
  type Element,
} from "../core/html.js";
import { readImage, type ImageInfo } from "../core/image.js";
import { isWellFormedBcp47 } from "../core/lang-codes.js";
import { ruleText } from "../core/robots-txt.js";
import { foldText, normalizeText, sortBytes } from "../core/text.js";
import { comparisonKey } from "../core/url.js";
import { GOOGLEBOT_CHAIN, GOOGLEBOT_IMAGE_CHAIN, type EvaluationContext, type Page } from "../context.js";
import { fail, info, notApplicable, notEvaluated, opportunity, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { examples, outcomeLabel, statusOf } from "./helpers.js";

export function headTitles(page: Page): { head: Element[]; body: Element[] } {
  const all = elements(page.parsed.document, "title");
  return { head: all.filter((t) => isInHead(page.parsed, t)), body: all.filter((t) => !isInHead(page.parsed, t)) };
}

export const head01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const { head, body } = headTitles(page);
    if (head.length === 0) {
      out.push(fail(url, "missing", { url, body_title_clause: body[0] ? `; a <title> appears in <body> at line ${lineOf(body[0])}, outside the head` : "", line: body[0] ? lineOf(body[0]) : 0 }));
    } else if (elementText(head[0]!) === "") {
      out.push(fail(url, "empty", { url }));
    } else {
      out.push(pass(url, { title: elementText(head[0]!) }));
    }
  }
  return out;
};

export const head01b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const n = elements(page.parsed.document, "title").length;
    out.push(n > 1 ? fail(url, "multiple", { url, n }) : pass(url, { n }));
  }
  return out;
};

export const head02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const charsetMetas = elements(page.parsed.document, "meta").filter((m) => hasAttr(m, "charset"));
    const equivMetas = metaByHttpEquiv(page.parsed, "content-type");
    const labels: { label: string; element: Element | null }[] = [];
    for (const meta of charsetMetas) labels.push({ label: attr(meta, "charset") ?? "", element: meta });
    for (const meta of equivMetas) {
      const inner = charsetFromContentType(attr(meta, "content"));
      if (inner) labels.push({ label: inner, element: meta });
    }
    const headerLabel = charsetFromContentType(header(page.exchange, "content-type"));
    if (headerLabel) labels.push({ label: headerLabel, element: null });
    let failed = false;
    if (charsetMetas.length > 1) {
      failed = true;
      out.push(fail(url, "multiple_charset_meta", { url, n: charsetMetas.length }));
    }
    const notUtf8 = labels.find((l) => resolveEncodingLabel(l.label) !== "utf-8");
    if (notUtf8) {
      failed = true;
      out.push(fail(url, "not_utf8", { url, label: notUtf8.label }));
    } else if (page.parsed.decoded.encoding !== "utf-8") {
      failed = true;
      out.push(fail(url, "not_utf8", { url, label: page.parsed.decoded.encoding }));
    }
    const declaration = labels.find((l) => l.element !== null)?.element ?? null;
    if (declaration) {
      const end = endOffsetOf(declaration);
      if (end !== null) {
        const bytes = byteOffset(page.parsed, end);
        if (bytes > 1024) {
          failed = true;
          out.push(fail(url, "declaration_too_late", { url, offset: bytes }));
        }
      }
    }
    if (!failed) out.push(pass(url, { encoding: page.parsed.decoded.encoding }));
  }
  return out;
};

export const head04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const lang = page.parsed.html ? attr(page.parsed.html, "lang") : null;
    if (lang === null || lang.trim() === "") out.push(fail(url, "missing", { url }));
    else if (!isWellFormedBcp47(lang)) out.push(fail(url, "malformed", { url, value: lang }));
    else out.push(pass(url, { value: lang }));
  }
  return out;
};

export const head05: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const culprit = ctx.page(url)!.parsed.culprit;
    if (culprit) {
      out.push(fail(url, "head_closed_early", { url, culprit: culprit.label, line: culprit.line, displaced: culprit.displaced.join(", ") || "none", head_closed_line: culprit.headClosedLine }));
    } else {
      out.push(pass(url));
    }
  }
  return out;
};

export const head06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const culprit = page.parsed.noscriptCulprit;
    if (!culprit) continue;
    if (page.parsed.culprit && page.parsed.culprit.offset === culprit.offset) continue;
    const noscript = elements(page.parsed.document, "noscript").find((n) => {
      if (!isInHead(page.parsed, n)) return false;
      const start = offsetOf(n);
      const end = endOffsetOf(n);
      return start !== null && end !== null && culprit.offset > start && culprit.offset < end;
    });
    if (!noscript) continue;
    out.push(info(url, "noscript_closes_head", { url, line: lineOf(noscript), displaced: culprit.displaced.join(", ") || "none" }));
  }
  return out;
};

function headTitleText(page: Page): string | null {
  const title = headTitles(page).head[0];
  return title ? elementText(title) : null;
}

/**
 * Pages in P grouped by their head title, normalized and case-folded
 * (KNOWLEDGE.md §3.5). SEO-META-01 fails every group larger than one.
 */
export function titleGroups(ctx: EvaluationContext): { title: (url: string) => string | null; groupOf: (url: string) => string[] } {
  const groups = new Map<string, string[]>();
  const title = (url: string): string | null => {
    const page = ctx.page(url);
    const value = page ? headTitleText(page) : null;
    return value === null || value === "" ? null : value;
  };
  for (const url of ctx.pages) {
    const value = title(url);
    if (value === null) continue;
    const key = foldText(value);
    const list = groups.get(key);
    if (list) list.push(url);
    else groups.set(key, [url]);
  }
  const groupOf = (url: string): string[] => {
    const value = title(url);
    return value === null ? [] : (groups.get(foldText(value)) ?? [url]);
  };
  return { title, groupOf };
}

export const meta01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const groups = titleGroups(ctx);
  for (const url of ctx.pages) {
    const title = groups.title(url);
    if (title === null) continue; // judged by SEO-HEAD-01
    let failed = false;
    const group = groups.groupOf(url);
    if (group.length > 1) {
      failed = true;
      out.push(fail(url, "duplicate", { url, title, n: group.length, examples: examples(group.filter((u) => u !== url)) }));
    }
    if (ctx.inScopeHomePages.includes(url) && foldText(title) === "home") {
      failed = true;
      out.push(fail(url, "vague_home", { url, title }));
    }
    if (!failed) out.push(pass(url, { title }));
  }
  return out;
};

const TRIVIAL_WORDS = new Set(["the", "and", "for", "with", "from", "that", "this", "your", "our", "you", "are", "not", "but", "all", "any", "can", "has", "have", "was", "were", "will", "its", "into", "than", "then", "them", "they", "a", "an", "of", "to", "in", "on", "at", "by", "or", "is", "it", "as", "be", "de", "la", "le", "el", "und", "der", "die", "das"]);

export const meta01hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const title = headTitleText(ctx.page(url)!);
    if (!title) continue;
    const counts = new Map<string, number>();
    for (const word of foldText(title).split(/[^\p{L}\p{N}]+/u)) {
      if (word.length < 3 || TRIVIAL_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    const repeated = [...counts.entries()].filter(([, n]) => n >= 3).sort();
    if (repeated.length > 0) out.push(info(url, "repeated_words", { url, word: repeated[0]![0], n: repeated[0]![1] }));
  }
  return out;
};

function descriptions(page: Page): Element[] {
  return metaByName(page.parsed, "description");
}

export const meta02a: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const n = descriptions(ctx.page(url)!).length;
    out.push(n > 1 ? fail(url, "multiple", { url, n }) : pass(url, { n }));
  }
  return out;
};

/**
 * Pages in P grouped by their first non-empty meta description, normalized and
 * case-folded (KNOWLEDGE.md §3.5). SEO-META-02B fails every group larger than one.
 */
export function descriptionGroups(ctx: EvaluationContext): { content: (url: string) => string | null; groupOf: (url: string) => string[] } {
  const groups = new Map<string, string[]>();
  const content = (url: string): string | null => {
    const page = ctx.page(url);
    const first = page ? descriptions(page)[0] : undefined;
    const value = first ? normalizeText(attr(first, "content") ?? "") : "";
    return value === "" ? null : value;
  };
  for (const url of ctx.pages) {
    const value = content(url);
    if (value === null) continue;
    const key = foldText(value);
    const list = groups.get(key);
    if (list) list.push(url);
    else groups.set(key, [url]);
  }
  const groupOf = (url: string): string[] => {
    const value = content(url);
    return value === null ? [] : (groups.get(foldText(value)) ?? [url]);
  };
  return { content, groupOf };
}

export const meta02b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const { content, groupOf } = descriptionGroups(ctx);
  for (const url of ctx.pages) {
    if (content(url) === null) continue;
    const group = groupOf(url);
    if (group.length > 1) out.push(fail(url, "duplicate", { url, n: group.length - 1, examples: examples(group.filter((u) => u !== url)) }));
    else out.push(pass(url));
  }
  return out;
};

export const meta02c: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const first = descriptions(ctx.page(url)!)[0];
    const value = first ? normalizeText(attr(first, "content") ?? "") : "";
    out.push(value === "" ? opportunity(url, "absent", { url }) : pass(url));
  }
  return out;
};

const FAVICON_FORMATS = new Set(["BMP", "GIF", "ICO", "PNG", "JPEG", "PPM", "TIFF"]);
const FAVICON_RELS = new Set(["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"]);

interface FaviconCandidate {
  url: string;
  element: Element;
  fetched: boolean;
  ok: boolean;
  outcome: string;
  blocked: { rule: string } | null;
  accessUnknown: boolean;
  image: ImageInfo | null;
  formatOk: boolean;
  square: boolean;
  bigEnough: boolean;
  bestSquare: number;
}

function isFaviconLink(link: Element): boolean {
  const tokens = relTokens(link);
  if (tokens.includes("icon")) return true;
  const joined = tokens.join(" ");
  return FAVICON_RELS.has(joined) || tokens.includes("apple-touch-icon") || tokens.includes("apple-touch-icon-precomposed");
}

export function faviconCandidates(ctx: EvaluationContext, page: Page): FaviconCandidate[] {
  const out: FaviconCandidate[] = [];
  if (!page.parsed.head) return out;
  for (const link of elements(page.parsed.head, "link")) {
    if (!isFaviconLink(link)) continue;
    const href = attr(link, "href");
    if (href === null) continue;
    const key = comparisonKey(href, page.base);
    if (!key) continue;
    const chain = ctx.chain(key);
    const final = chain.final;
    const fetched = chain.exchanges.length > 0;
    const ok = statusOf(final) === 200;
    const access = ctx.access(key, GOOGLEBOT_IMAGE_CHAIN);
    const bytes = ok ? ctx.body(final) : null;
    const image = bytes ? readImage(bytes) : null;
    const entries = image ? (image.format === "ICO" ? image.entries : image.width !== null && image.height !== null ? [{ width: image.width, height: image.height }] : []) : [];
    const squares = entries.filter((e) => e.width === e.height);
    const passing = squares.filter((e) => e.width >= 8);
    out.push({
      url: key,
      element: link,
      fetched,
      ok,
      outcome: final ? outcomeLabel(final) : "no response",
      blocked: access.kind === "decided" && !access.decision.allowed && access.decision.rule ? { rule: ruleText(access.decision.rule) } : null,
      accessUnknown: access.kind === "unavailable" || access.kind === "missing",
      image,
      formatOk: image !== null && FAVICON_FORMATS.has(image.format),
      square: squares.length > 0,
      bigEnough: passing.length > 0,
      bestSquare: passing.reduce((m, e) => Math.max(m, e.width), 0),
    });
  }
  return out;
}

export function faviconPasses(c: FaviconCandidate): boolean {
  return c.ok && c.blocked === null && !c.accessUnknown && c.formatOk && c.square && c.bigEnough;
}

export const meta05a: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const home of ctx.inScopeHomePages) {
    const page = ctx.page(home);
    if (!page) {
      out.push(notEvaluated(home, "The home page did not return 200 HTML."));
      continue;
    }
    const origin = new URL(home).origin;
    const homeAccess = ctx.access(home, GOOGLEBOT_CHAIN);
    const candidates = faviconCandidates(ctx, page);
    const results: UnitResult[] = [];
    if (homeAccess.kind === "decided" && !homeAccess.decision.allowed && homeAccess.decision.rule) {
      results.push(fail(home, "home_blocked", { origin, resource: home, crawler: "Googlebot", rule: ruleText(homeAccess.decision.rule) }));
    }
    if (candidates.length === 0) {
      results.push(opportunity(home, "no_icon_link", { origin }));
    } else if (!candidates.some(faviconPasses)) {
      if (candidates.some((c) => !c.fetched || c.accessUnknown) && candidates.every((c) => (!c.fetched || c.accessUnknown) || !faviconPasses(c))) {
        const unfetched = candidates.filter((c) => !c.fetched || c.accessUnknown);
        if (unfetched.length === candidates.length) {
          out.push(notEvaluated(home, "Favicon candidates or their robots.txt were not fetched."));
          continue;
        }
      }
      for (const c of candidates) {
        if (!c.fetched) continue;
        if (!c.ok) results.push(fail(home, "icon_not_ok", { origin, icon_url: c.url, outcome: c.outcome }));
        if (c.blocked) results.push(fail(home, "icon_blocked", { origin, resource: c.url, crawler: "Googlebot-Image", rule: c.blocked.rule }));
        if (c.ok && c.image && !c.formatOk) results.push(fail(home, "unsupported_format", { origin, icon_url: c.url, format: c.image.format }));
        if (c.ok && c.image && c.formatOk) {
          const w = c.image.width ?? 0;
          const h = c.image.height ?? 0;
          if (!c.square) results.push(fail(home, "not_square", { origin, icon_url: c.url, width: w, height: h }));
          else if (!c.bigEnough) results.push(fail(home, "too_small", { origin, icon_url: c.url, width: w, height: h }));
        }
      }
    }
    if (results.length === 0) out.push(pass(home, { candidates: candidates.length, best: candidates.filter(faviconPasses).reduce((m, c) => Math.max(m, c.bestSquare), 0) }));
    else out.push(...results);
  }
  return out;
};

export const meta05b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const home of ctx.inScopeHomePages) {
    const page = ctx.page(home);
    if (!page) continue;
    const homeAccess = ctx.access(home, GOOGLEBOT_CHAIN);
    if (homeAccess.kind === "decided" && !homeAccess.decision.allowed) {
      out.push(notApplicable(home, "SEO-META-05A does not pass for this home page."));
      continue;
    }
    const passing = faviconCandidates(ctx, page).filter(faviconPasses);
    if (passing.length === 0) {
      out.push(notApplicable(home, "SEO-META-05A does not pass for this home page."));
      continue;
    }
    const size = passing.reduce((m, c) => Math.max(m, c.bestSquare), 0);
    out.push(size <= 48 ? fail(home, "not_larger_than_48", { origin: new URL(home).origin, size }) : pass(home, { size }));
  }
  return out;
};

/** The HTML Standard's shared declarative refresh steps, reduced to: does the content yield a URL? */
export function refreshUrl(content: string): string | null {
  const m = /^[\t\n\f\r ]*\d+(?:\.\d*)?(?:[\t\n\f\r ]*[;,][\t\n\f\r ]*|[\t\n\f\r ]+)(?:[Uu][Rr][Ll][\t\n\f\r ]*=[\t\n\f\r ]*)?(.*)$/s.exec(content);
  if (!m) return null;
  let url = m[1]!.trim();
  if (url.startsWith('"') || url.startsWith("'")) {
    const quote = url[0]!;
    const end = url.indexOf(quote, 1);
    url = end > 0 ? url.slice(1, end) : url.slice(1);
  }
  return url === "" ? null : url;
}

export const meta06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const refreshes = metaByHttpEquiv(page.parsed, "refresh");
    const redirecting = refreshes.filter((m) => refreshUrl(attr(m, "content") ?? "") !== null);
    if (redirecting.length > 0) {
      out.push(fail(url, "meta_refresh_redirect", { url, content: attr(redirecting[0]!, "content") ?? "", line: lineOf(redirecting[0]!) }));
    } else {
      out.push(pass(url, { timed_reloads: refreshes.length }));
    }
  }
  return out;
};

export const head03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    if (metaByName(ctx.page(url)!.parsed, "viewport").length === 0) out.push(info(url, "absent", { url }));
  }
  return out;
};

export const meta03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    if (metaByName(ctx.page(url)!.parsed, "keywords").length > 0) out.push(info(url, "present", { url }));
  }
  return out;
};

export const meta04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const d = page.directives;
    const controls: string[] = [];
    if (d.nosnippet) controls.push("nosnippet");
    if (d.maxSnippet !== null) controls.push(`max-snippet:${d.maxSnippet}`);
    if (d.maxImagePreview !== null) controls.push(`max-image-preview:${d.maxImagePreview}`);
    if (d.maxVideoPreview !== null) controls.push(`max-video-preview:${d.maxVideoPreview}`);
    const nosnippetElements: Element[] = [];
    for (const node of elements(page.parsed.document, "span").concat(elements(page.parsed.document, "div"), elements(page.parsed.document, "section"))) {
      if (hasAttr(node, "data-nosnippet")) nosnippetElements.push(node);
    }
    let others = 0;
    const stack: Element[] = page.parsed.html ? [page.parsed.html] : [];
    while (stack.length > 0) {
      const el = stack.pop()!;
      if (hasAttr(el, "data-nosnippet") && !["span", "div", "section"].includes(el.tagName)) {
        others += 1;
        out.push(info(url, "data_nosnippet_unsupported_element", { url, element: el.tagName, line: lineOf(el) }));
      }
      for (const child of el.childNodes) if ("tagName" in child) stack.push(child as Element);
    }
    if (nosnippetElements.length > 0) controls.push(`data-nosnippet on ${nosnippetElements.length} elements`);
    if (controls.length > 0) {
      out.push(info(url, "snippet_controls", { url, controls: controls.join(", "), effect: d.nosnippet ? "Google shows no text snippet for the page, and nosnippet also prevents the content from being used as a direct input for AI Overviews and AI Mode." : "Google limits the snippet or preview as declared." }));
    }
    void others;
  }
  return out;
};

export const HEAD_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-HEAD-01": head01,
  "SEO-HEAD-01B": head01b,
  "SEO-HEAD-02": head02,
  "SEO-HEAD-04": head04,
  "SEO-HEAD-05": head05,
  "SEO-HEAD-06": head06,
  "SEO-META-01": meta01,
  "SEO-META-01-HC": meta01hc,
  "SEO-META-02A": meta02a,
  "SEO-META-02B": meta02b,
  "SEO-META-02C": meta02c,
  "SEO-META-05A": meta05a,
  "SEO-META-05B": meta05b,
  "SEO-META-06": meta06,
  "SEO-HEAD-03": head03,
  "SEO-META-03": meta03,
  "SEO-META-04": meta04,
};

void isDescendantOf;
void sortBytes;
