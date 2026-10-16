import { header, headers } from "../../snapshot/access.js";
import { describeSource, effectiveGoogleDirectives, type EffectiveDirectives } from "../core/directives.js";
import { attr, elements, lineOf, parseHtml } from "../core/html.js";
import { ruleText } from "../core/robots-txt.js";
import { GOOGLEBOT_CHAIN, type EvaluationContext } from "../context.js";
import { fail, info, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { statusOf } from "./helpers.js";

/** Directives of a URL whose chain ends in 200: from the page, or from headers alone for non-HTML. */
export function directivesOf(ctx: EvaluationContext, url: string): EffectiveDirectives | null {
  const page = ctx.page(url);
  if (page) return page.directives;
  const final = ctx.chain(url).final;
  if (!final || statusOf(final) !== 200) return null;
  return effectiveGoogleDirectives({ metas: [], xRobotsTag: headers(final, "x-robots-tag") }, ctx.completedAtMs);
}

/** Directives computed from the rendered DOM stored in the snapshot, when rendering ran. */
export function renderedDirectives(ctx: EvaluationContext, url: string): EffectiveDirectives | null {
  const html = ctx.snapshot.rendered?.[url];
  if (html === undefined) return null;
  const final = ctx.chain(url).final;
  const parsed = parseHtml(new TextEncoder().encode(html), "text/html; charset=utf-8");
  const metas = elements(parsed.document, "meta").map((meta) => ({ name: attr(meta, "name") ?? "", content: attr(meta, "content") ?? "", line: lineOf(meta) }));
  return effectiveGoogleDirectives({ metas, xRobotsTag: headers(final, "x-robots-tag") }, ctx.completedAtMs);
}

export function directiveList(d: EffectiveDirectives): string {
  const parts: string[] = [];
  if (d.noindex) parts.push("noindex");
  if (d.nofollow) parts.push("nofollow");
  if (d.nosnippet) parts.push("nosnippet");
  if (d.noimageindex) parts.push("noimageindex");
  if (d.notranslate) parts.push("notranslate");
  if (d.indexifembedded) parts.push("indexifembedded");
  if (d.maxSnippet !== null) parts.push(`max-snippet:${d.maxSnippet}`);
  if (d.maxImagePreview !== null) parts.push(`max-image-preview:${d.maxImagePreview}`);
  if (d.maxVideoPreview !== null) parts.push(`max-video-preview:${d.maxVideoPreview}`);
  for (const ua of d.unavailableAfter) parts.push(`unavailable_after:${ua.raw}`);
  return parts.length > 0 ? parts.join(", ") : "none";
}

export const idx06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.intended) {
    const final = ctx.chain(url).final;
    if (!final || statusOf(final) !== 200) continue; // scope: members of I with a final 200
    const directives = directivesOf(ctx, url)!;
    let failed = false;
    if (directives.unavailableAfterPassed) {
      failed = true;
      out.push(fail(url, "unavailable_after_passed", { url, date: directives.unavailableAfterPassed.raw }));
    }
    if (directives.noindex && directives.noindexFrom) {
      failed = true;
      out.push(
        fail(url, "noindex", {
          url,
          intent_source: ctx.intentSource.get(url) ?? "it is the home page",
          directive: directives.noindexFrom.directive,
          directive_source: describeSource(directives.noindexFrom.source),
        }),
      );
    }
    if (ctx.config.render && !failed) {
      const rendered = renderedDirectives(ctx, url);
      if (rendered?.noindex && rendered.noindexFrom && !directives.noindex) {
        failed = true;
        out.push(fail(url, "noindex_after_render", { url, directive: rendered.noindexFrom.directive }));
      }
    }
    if (!failed) out.push(pass(url, { directives: directiveList(directives) }));
  }
  return out;
};

export const idx02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.allRequestedUrls()) {
    if (!ctx.isInScope(url)) continue;
    const exchange = ctx.primaryExchange(url);
    if (!exchange || exchange.purpose === "variant_probe" || exchange.purpose === "variant_sample") continue;
    const directives = directivesOf(ctx, url);
    if (!directives?.noindex || !directives.noindexFrom) continue;
    const access = ctx.access(url, GOOGLEBOT_CHAIN);
    if (access.kind === "unavailable") {
      out.push(notEvaluated(url, "robots.txt is unavailable, so Googlebot's access cannot be decided."));
      continue;
    }
    if (access.kind === "decided" && !access.decision.allowed && access.decision.rule) {
      out.push(
        fail(url, "noindex_behind_disallow", {
          url,
          directive_source: describeSource(directives.noindexFrom.source),
          rule: ruleText(access.decision.rule),
          line: access.decision.rule.line,
        }),
      );
    } else {
      out.push(pass(url));
    }
  }
  return out;
};

export const idx03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const origin of ctx.inScopeOrigins) {
    const robots = ctx.robots(origin);
    if (robots.state !== "parsed") continue;
    if (robots.parsed.noindexLines.length === 0) {
      out.push(pass(origin));
      continue;
    }
    for (const line of robots.parsed.noindexLines) out.push(fail(origin, "noindex_in_robots_txt", { origin, line: line.line, text: line.text }));
  }
  return out;
};

export const idx04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.fetchedPages) {
    const raw = directivesOf(ctx, url);
    const rendered = renderedDirectives(ctx, url);
    if (!raw || !rendered) {
      out.push(notEvaluated(url, "No rendered DOM is stored for this URL."));
      continue;
    }
    if (raw.noindex && raw.noindexFrom && !rendered.noindex) {
      out.push(fail(url, "raw_noindex_removed_by_js", { url, directive_source: describeSource(raw.noindexFrom.source) }));
    } else {
      out.push(pass(url));
    }
  }
  return out;
};

export const idx01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.fetchedPages) {
    const directives = directivesOf(ctx, url);
    if (!directives?.noindex || !directives.noindexFrom) continue;
    out.push(
      info(url, "inventory", {
        url,
        directive_source: describeSource(directives.noindexFrom.source),
        intended_clause: ctx.intended.includes(url) ? "; the URL is in the intended-indexable set" : "; the URL is not in the intended-indexable set",
      }),
    );
  }
  return out;
};

export const idx05: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const inputs = page.directives.inputs.filter((i) => i.appliesToGoogle);
    const metas = inputs.filter((i) => i.source.kind === "meta");
    const hdrs = inputs.filter((i) => i.source.kind === "header");
    const distinct = new Set(inputs.map((i) => i.segments.map((s) => s.toLowerCase()).sort().join(",")));
    if (metas.length > 1 || (hdrs.length > 0 && metas.length > 0 && distinct.size > 1)) {
      out.push(
        info(url, "combined", {
          url,
          inputs: inputs.map((i) => `${describeSource(i.source)}: ${i.segments.join(", ") || "(empty)"}`).join("; "),
          effective: directiveList(page.directives),
        }),
      );
    }
  }
  return out;
};

export const idx07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.fetchedPages) {
    const raw = directivesOf(ctx, url);
    const rendered = renderedDirectives(ctx, url);
    if (!raw || !rendered) continue;
    if (raw.noindex !== rendered.noindex) continue; // reported by SEO-IDX-04 / SEO-IDX-06
    const a = directiveList(raw);
    const b = directiveList(rendered);
    if (a !== b) out.push(info(url, "directives_changed", { url, raw_directives: a, rendered_directives: b }));
  }
  return out;
};

export const INDEXING_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-IDX-06": idx06,
  "SEO-IDX-02": idx02,
  "SEO-IDX-03": idx03,
  "SEO-IDX-04": idx04,
  "SEO-IDX-01": idx01,
  "SEO-IDX-05": idx05,
  "SEO-IDX-07": idx07,
};

void header;
