import { allElements, attr, elements, hasAttr, isHtmlElement, lineOf, text as elementText, type Element } from "../core/html.js";
import { foldText } from "../core/text.js";
import type { EvaluationContext } from "../context.js";
import { fail, info, notApplicable, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { statusOf } from "./helpers.js";

interface Inbound {
  from: string;
  nofollow: boolean;
}

function inboundLinks(ctx: EvaluationContext): Map<string, Inbound[]> {
  const map = new Map<string, Inbound[]>();
  for (const from of ctx.fetchedPages) {
    const page = ctx.page(from);
    if (!page) continue;
    for (const link of page.links) {
      if (!link.internal || !link.key) continue;
      const targets = new Set([link.key]);
      if (ctx.wasFetched(link.key)) {
        const chain = ctx.chain(link.key);
        if (chain.final) targets.add(chain.finalUrl);
      }
      for (const target of targets) {
        const list = map.get(target);
        const entry = { from, nofollow: link.nofollow };
        if (list) list.push(entry);
        else map.set(target, [entry]);
      }
    }
  }
  return map;
}

export const link02: RuleEvaluator = (ctx) => {
  const units = ctx.intended.filter((url) => !ctx.inScopeHomePages.includes(url));
  if (units.length === 0) return [];
  if (ctx.intentInferred) return [notApplicable("site", "Intent was inferred from links, so every intended page was found by a link.")];
  if (ctx.snapshot.truncated) return units.map((url) => notEvaluated(url, "The crawl was truncated, so orphan detection is not reliable."));
  const inbound = inboundLinks(ctx);
  const out: UnitResult[] = [];
  for (const url of units) {
    const links = (inbound.get(url) ?? []).filter((l) => l.from !== url);
    if (links.length === 0) out.push(fail(url, "orphan", { url, intent_source: (ctx.intentSource.get(url) ?? "").replace(/^it is in /, "").replace(/^it matches include pattern /, "include pattern ") || "the intended set" }));
    else if (links.every((l) => l.nofollow)) out.push(fail(url, "only_nofollow", { url, n: links.length }));
    else out.push(pass(url, { inbound: links.length }));
  }
  return out;
};

const GENERIC = new Set(["click here", "read more", "website", "article"]);

export const link03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const generic: { text: string; target: string }[] = [];
    const empty: string[] = [];
    const aria: string[] = [];
    for (const link of page.links) {
      if (!link.key) continue;
      const anchor = link.anchorText !== "" ? link.anchorText : link.imageAlts;
      if (anchor === "") {
        if (link.ariaLabel && link.ariaLabel.trim() !== "") aria.push(link.key);
        else empty.push(link.key);
        continue;
      }
      if (GENERIC.has(foldText(anchor))) generic.push({ text: anchor, target: link.key });
    }
    let failed = false;
    if (generic.length > 0) {
      failed = true;
      out.push(fail(url, "generic_text", { url, n: generic.length, text: generic[0]!.text, target: generic[0]!.target }));
    }
    if (empty.length > 0) {
      failed = true;
      out.push(fail(url, "empty_text", { url, n: empty.length, target: empty[0]! }));
    }
    if (aria.length > 0) out.push(info(url, "aria_label_only", { url, n: aria.length, target: aria[0]! }));
    if (!failed) out.push(pass(url, { links: page.links.length }));
  }
  return out;
};

export function headings(ctx: EvaluationContext, url: string): { level: number; element: Element }[] {
  const page = ctx.page(url)!;
  const body = page.parsed.body;
  if (!body) return [];
  const out: { level: number; element: Element }[] = [];
  for (const el of allElements(body)) {
    const m = /^h([1-6])$/.exec(el.tagName);
    if (m && isHtmlElement(el)) out.push({ level: Number(m[1]), element: el });
  }
  return out;
}

export const hdg02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const list = headings(ctx, url);
    let failed = false;
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.level > prev.level + 1) {
        failed = true;
        out.push(fail(url, "skipped_level", { url, a: prev.level, b: cur.level, text_a: elementText(prev.element), text_b: elementText(cur.element), line_a: lineOf(prev.element), line_b: lineOf(cur.element) }));
        break;
      }
    }
    if (!failed) out.push(pass(url, { headings: list.length }));
  }
  return out;
};

export const hdg01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const h1s = headings(ctx, url).filter((h) => h.level === 1);
    out.push(info(url, "inventory", { url, n: h1s.length, text: h1s[0] ? elementText(h1s[0].element) : "" }));
  }
  return out;
};

export const link01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const kinds = new Set<string>();
    const found: string[] = [];
    for (const anchor of elements(page.parsed.document, "a")) {
      if (!hasAttr(anchor, "href")) {
        kinds.add("anchors without href");
        found.push(`<a> without href at line ${lineOf(anchor)}`);
      }
    }
    for (const link of page.links) {
      if (/^\s*javascript:/i.test(link.rawHref)) {
        kinds.add("javascript: URLs");
        found.push(link.rawHref.trim());
      }
    }
    for (const el of allElements(page.parsed.document)) {
      if (!isHtmlElement(el)) continue;
      if (hasAttr(el, "href") && !["a", "area", "link", "base"].includes(el.tagName)) {
        kinds.add("href on non-anchor elements");
        found.push(`<${el.tagName} href> at line ${lineOf(el)}`);
      }
      if (hasAttr(el, "routerlink") || hasAttr(el, "[routerlink]")) {
        kinds.add("routerLink attributes");
        found.push(`<${el.tagName} routerLink> at line ${lineOf(el)}`);
      }
    }
    if (found.length > 0) out.push(info(url, "uncrawlable", { url, n: found.length, kinds: [...kinds].sort().join(", "), example: found[0]! }));
  }
  return out;
};

export const link06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const errors: { target: string; status: number }[] = [];
    const seen = new Set<string>();
    for (const link of page.links) {
      if (!link.internal || !link.key || seen.has(link.key)) continue;
      seen.add(link.key);
      const status = statusOf(ctx.chain(link.key).final);
      if (status !== null && status >= 400) errors.push({ target: link.key, status });
    }
    if (errors.length > 0) {
      errors.sort((a, b) => (a.target < b.target ? -1 : 1));
      out.push(info(url, "error_targets", { url, n: errors.length, target: errors[0]!.target, status: errors[0]!.status }));
    }
  }
  return out;
};

export const LINK_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-LINK-02": link02,
  "SEO-LINK-03": link03,
  "SEO-HDG-02": hdg02,
  "SEO-HDG-01": hdg01,
  "SEO-LINK-01": link01,
  "SEO-LINK-06": link06,
};

void attr;
