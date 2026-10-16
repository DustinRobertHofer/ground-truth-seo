import { header, headers, isHtmlMediaType } from "../../snapshot/access.js";
import { ruleText } from "../core/robots-txt.js";
import { hasScheme } from "../core/url.js";
import { GOOGLEBOT_CHAIN, splitLinkHeader, type EvaluationContext } from "../context.js";
import { fail, info, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { outcomeLabel, statusOf } from "./helpers.js";
import { directivesOf } from "./indexing.js";

function culpritClause(ctx: EvaluationContext, url: string): { clause: string; head_closed_line: number; culprit: string } {
  const culprit = ctx.page(url)?.parsed.culprit ?? null;
  if (!culprit) return { clause: "", head_closed_line: 0, culprit: "" };
  return {
    clause: ` because the parser closed <head> at line ${culprit.headClosedLine}, where it met ${culprit.label}`,
    head_closed_line: culprit.headClosedLine,
    culprit: culprit.label,
  };
}

export const canon01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    if (page.canonicals.length === 0) continue;
    if (page.headCanonicals.length > 0) {
      out.push(pass(url, { href: page.headCanonicals[0]!.rawHref ?? "" }));
      continue;
    }
    const first = page.canonicals[0]!;
    const c = culpritClause(ctx, url);
    out.push(fail(url, "outside_head", { url, href: first.rawHref ?? "", line: first.line, culprit_clause: c.clause, head_closed_line: c.head_closed_line, culprit: c.culprit }, { related: ["SEO-HEAD-05"] }));
  }
  return out;
};

export const canon02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const first = page.headCanonicals[0];
    if (!first) continue;
    const href = first.rawHref;
    if (href === null || href.trim() === "") out.push(fail(url, "empty_href", { url }));
    else if (!hasScheme(href)) out.push(fail(url, "relative", { url, href }));
    else out.push(pass(url, { href }));
  }
  return out;
};

export const canon08: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    if (page.headCanonicals.length === 0 && page.headerCanonicals.length === 0) continue;
    const keys = new Set<string>();
    for (const c of page.headCanonicals) if (c.key) keys.add(c.key);
    for (const c of page.headerCanonicals) if (c.key) keys.add(c.key);
    if (keys.size > 1) out.push(fail(url, "conflicting_canonicals", { url, n: keys.size, list: [...keys].sort().join(", ") }));
    else out.push(pass(url));
  }
  return out;
};

export const canon04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const target = ctx.headCanonicalOf(url);
    if (target === null || target === url) continue;
    const chain = ctx.chain(target);
    if (chain.exchanges.length === 0) {
      out.push(notEvaluated(url, "The canonical target was not fetched."));
      continue;
    }
    const first = chain.exchanges[0]!;
    const firstStatus = statusOf(first);
    const final = chain.final;
    const finalStatus = statusOf(final);
    if (firstStatus === 300 || firstStatus === 301 || firstStatus === 308) {
      out.push(fail(url, "target_permanent_redirect", { url, target, final: chain.finalUrl }));
      continue;
    }
    if (!final || final.outcome !== "response" || (finalStatus !== null && finalStatus >= 400)) {
      out.push(fail(url, "target_error", { url, target, outcome: final ? outcomeLabel(final) : chain.problem === "loop" ? "a redirect loop" : "no final response" }));
      continue;
    }
    // The target's own head canonical (read from its final page). A temporary redirect
    // to a self-canonical page is not a chain: the RFC allows a temporary-redirect source.
    const third = ctx.headCanonicalOf(target);
    if (third !== null && third !== target && third !== chain.finalUrl) {
      out.push(fail(url, "target_canonical_chain", { url, target, third }));
      continue;
    }
    out.push(pass(url, { target }));
  }
  return out;
};

export const canon05: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const redirecting: { target: string; final: string }[] = [];
    const nonCanonical: { target: string; canonical: string }[] = [];
    const seen = new Set<string>();
    for (const link of page.links) {
      if (!link.internal || !link.key || seen.has(link.key)) continue;
      seen.add(link.key);
      if (!ctx.wasFetched(link.key)) continue;
      if (ctx.redirects(link.key)) {
        redirecting.push({ target: link.key, final: ctx.chain(link.key).finalUrl });
        continue;
      }
      const canonical = ctx.headCanonicalOf(link.key);
      if (canonical !== null && canonical !== link.key) nonCanonical.push({ target: link.key, canonical });
    }
    const badAlternates: { target: string; problem: string }[] = [];
    for (const alt of page.hreflangs) {
      if (!alt.key || alt.key === url || !ctx.wasFetched(alt.key)) continue;
      if (ctx.redirects(alt.key)) badAlternates.push({ target: alt.key, problem: `redirects to ${ctx.chain(alt.key).finalUrl}` });
      else {
        const canonical = ctx.headCanonicalOf(alt.key);
        if (canonical !== null && canonical !== alt.key) badAlternates.push({ target: alt.key, problem: `names ${canonical} as canonical` });
      }
    }
    let failed = false;
    if (redirecting.length > 0) {
      failed = true;
      redirecting.sort((a, b) => (a.target < b.target ? -1 : 1));
      out.push(fail(url, "links_to_redirects", { url, n: redirecting.length, example: redirecting[0]!.target, final: redirecting[0]!.final }));
    }
    if (nonCanonical.length > 0) {
      failed = true;
      nonCanonical.sort((a, b) => (a.target < b.target ? -1 : 1));
      out.push(fail(url, "links_to_non_canonical", { url, n: nonCanonical.length, example: nonCanonical[0]!.target, canonical: nonCanonical[0]!.canonical }));
    }
    if (badAlternates.length > 0) {
      failed = true;
      badAlternates.sort((a, b) => (a.target < b.target ? -1 : 1));
      out.push(fail(url, "hreflang_to_non_canonical", { url, n: badAlternates.length, example: badAlternates[0]!.target, target_problem: badAlternates[0]!.problem }));
    }
    if (!failed) out.push(pass(url, { internal_links: seen.size }));
  }
  return out;
};

export const canon07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.fetchedPages) {
    const target = ctx.headCanonicalOf(url);
    if (target === null || target === url) continue;
    const own = directivesOf(ctx, url);
    let failed = false;
    if (own?.noindex) {
      failed = true;
      out.push(fail(url, "noindex_with_cross_canonical", { url, target }));
    }
    if (ctx.wasFetched(target)) {
      const targetDirectives = directivesOf(ctx, target);
      if (targetDirectives?.noindex) {
        failed = true;
        out.push(fail(url, "target_noindex", { url, target }));
      }
    }
    const access = ctx.access(target, GOOGLEBOT_CHAIN);
    if (access.kind === "decided" && !access.decision.allowed && access.decision.rule) {
      failed = true;
      out.push(fail(url, "target_disallowed", { url, target, rule: ruleText(access.decision.rule) }));
    }
    if (!failed) out.push(pass(url, { target }));
  }
  return out;
};

export const canon03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const target = ctx.headCanonicalOf(url);
    if (target === null) out.push(info(url, "absent", { url }));
    else if (target === url) out.push(info(url, "self_referencing", { url }));
    else out.push(info(url, "cross_page", { url, target }));
  }
  return out;
};

export const canon06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.allRequestedUrls()) {
    if (!ctx.isInScope(url)) continue;
    const final = ctx.chain(url).final;
    if (!final || statusOf(final) !== 200 || isHtmlMediaType(header(final, "content-type"))) continue;
    for (const value of headers(final, "link")) {
      for (const part of splitLinkHeader(value)) {
        if (!part.rel.includes("canonical")) continue;
        out.push(info(url, "canonical_header", { url, target: part.url, absoluteness: hasScheme(part.url) ? "absolute" : "relative" }));
      }
    }
  }
  return out;
};

export const CANONICAL_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-CANON-01": canon01,
  "SEO-CANON-02": canon02,
  "SEO-CANON-08": canon08,
  "SEO-CANON-04": canon04,
  "SEO-CANON-05": canon05,
  "SEO-CANON-07": canon07,
  "SEO-CANON-03": canon03,
  "SEO-CANON-06": canon06,
};
