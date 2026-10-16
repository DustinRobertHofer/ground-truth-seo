import { attr, elements, isInHead, parseHtml, relTokens, visibleText } from "../core/html.js";
import { comparisonKey } from "../core/url.js";
import type { EvaluationContext } from "../context.js";
import { fail, info, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";

function renderedParsed(ctx: EvaluationContext, url: string) {
  const html = ctx.snapshot.rendered?.[url];
  if (html === undefined) return null;
  return parseHtml(new TextEncoder().encode(html), "text/html; charset=utf-8");
}

export const js01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const rendered = renderedParsed(ctx, url);
    if (!rendered) {
      out.push(notEvaluated(url, "No rendered DOM is stored for this URL."));
      continue;
    }
    const raw = page.headCanonicals[0]?.key ?? null;
    const renderedLink = elements(rendered.document, "link").find((l) => relTokens(l).includes("canonical") && isInHead(rendered, l));
    const renderedKey = renderedLink ? comparisonKey(attr(renderedLink, "href") ?? "", page.base) : null;
    if (raw === null && renderedKey !== null) out.push(fail(url, "canonical_added_by_js", { url, rendered: renderedKey }));
    else if (raw !== null && renderedKey !== null && raw !== renderedKey) out.push(fail(url, "canonical_changed_by_js", { url, raw, rendered: renderedKey }));
    else out.push(pass(url));
  }
  return out;
};

export const js04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const rendered = renderedParsed(ctx, url);
    if (!rendered) continue;
    const rawWords = visibleText(page.parsed).split(" ").filter(Boolean).length;
    const renderedWords = visibleText(rendered).split(" ").filter(Boolean).length;
    const rawLinks = new Set(page.links.map((l) => l.key).filter((k): k is string => k !== null));
    const renderedLinks = new Set<string>();
    for (const tag of ["a", "area"]) {
      for (const el of elements(rendered.document, tag)) {
        const key = comparisonKey(attr(el, "href") ?? "", page.base);
        if (key) renderedLinks.add(key);
      }
    }
    const onlyRendered = [...renderedLinks].filter((k) => !rawLinks.has(k)).sort();
    if (rawWords === renderedWords && onlyRendered.length === 0) continue;
    out.push(
      info(url, "render_only_content", {
        url,
        raw_words: rawWords,
        rendered_words: renderedWords,
        raw_links: rawLinks.size,
        rendered_links: renderedLinks.size,
        render_only_links_clause: onlyRendered.length > 0 ? ` (links only present after rendering: ${onlyRendered.slice(0, 5).join(", ")})` : "",
      }),
    );
  }
  return out;
};

export const JAVASCRIPT_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-JS-01": js01,
  "SEO-JS-04": js04,
};
