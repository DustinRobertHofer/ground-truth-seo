import { HREFLANG_CONDITION_LABEL, validateHreflang } from "../core/lang-codes.js";
import { hasScheme } from "../core/url.js";
import type { EvaluationContext, HreflangLink, Page } from "../context.js";
import { fail, info, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { outcomeLabel, statusOf } from "./helpers.js";

function annotated(ctx: EvaluationContext): { url: string; page: Page }[] {
  return ctx.pages.flatMap((url) => {
    const page = ctx.page(url)!;
    return page.hreflangs.length > 0 ? [{ url, page }] : [];
  });
}

function culpritClause(page: Page): string {
  const culprit = page.parsed.culprit;
  return culprit ? ` because the parser closed <head> at line ${culprit.headClosedLine}, where it met ${culprit.label}` : "";
}

export const i18n07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    const html = page.hreflangs.filter((h) => h.method === "html");
    if (html.length === 0) continue;
    const inBody = html.filter((h) => !h.inHead);
    if (inBody.length > 0) out.push(fail(url, "outside_head", { url, n: inBody.length, culprit_clause: culpritClause(page), line: inBody[0]!.line }, { related: ["SEO-HEAD-05"] }));
    else out.push(pass(url, { n: html.length }));
  }
  return out;
};

export function annotationKeys(page: Page): Set<string> {
  const keys = new Set<string>();
  for (const h of page.hreflangs) if (h.key) keys.add(h.key);
  return keys;
}

export const i18n02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    const keys = annotationKeys(page);
    let failed = false;
    if (!keys.has(url)) {
      failed = true;
      out.push(fail(url, "missing_self", { url }));
    }
    const checked = new Set<string>();
    for (const alt of page.hreflangs) {
      if (!alt.key || alt.key === url || checked.has(alt.key)) continue;
      checked.add(alt.key);
      const target = ctx.page(alt.key);
      if (!target || statusOf(target.exchange) !== 200) continue; // reported by SEO-I18N-09
      if (!annotationKeys(target).has(url)) {
        failed = true;
        out.push(fail(url, "not_reciprocated", { url, target: alt.key, code: alt.hreflang }));
      }
    }
    if (!failed) out.push(pass(url, { alternates: checked.size }));
  }
  return out;
};

export const i18n03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    const bad = page.hreflangs.filter((h) => !hasScheme(h.rawHref));
    if (bad.length > 0) for (const h of bad) out.push(fail(url, "not_fully_qualified", { url, href: h.rawHref }));
    else out.push(pass(url));
  }
  return out;
};

export const i18n04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    let failed = false;
    const seen = new Set<string>();
    for (const h of page.hreflangs) {
      if (seen.has(h.hreflang)) continue;
      seen.add(h.hreflang);
      const verdict = validateHreflang(h.hreflang);
      if (!verdict.valid) {
        failed = true;
        out.push(fail(url, verdict.condition, { url, code: h.hreflang, condition_label: HREFLANG_CONDITION_LABEL[verdict.condition] }));
      }
    }
    if (!failed) out.push(pass(url, { codes: seen.size }));
  }
  return out;
};

function languageOf(page: Page, key: string): string | null {
  const match = page.hreflangs.find((h) => h.key === key);
  if (!match) return null;
  const verdict = validateHreflang(match.hreflang);
  return verdict.valid ? verdict.language : null;
}

export const i18n06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    const canonical = ctx.headCanonicalOf(url);
    if (canonical === null) continue;
    const own = languageOf(page, url);
    const other = canonical === url ? own : languageOf(page, canonical);
    if (canonical !== url && own !== null && other !== null && own !== other) {
      out.push(fail(url, "cross_language_canonical", { url, canonical, lang: own, other_lang: other }));
    } else {
      out.push(pass(url, { canonical }));
    }
  }
  return out;
};

export const i18n08: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    const html = page.hreflangs.filter((h) => h.method === "html");
    if (html.length === 0) continue;
    out.push(html.some((h) => h.hasMedia) ? fail(url, "combined_attributes", { url }) : pass(url));
  }
  return out;
};

export const i18n09: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { url, page } of annotated(ctx)) {
    const seen = new Set<string>();
    for (const alt of page.hreflangs) {
      if (!alt.key || alt.key === url || seen.has(alt.key) || !ctx.wasFetched(alt.key)) continue;
      seen.add(alt.key);
      const final = ctx.chain(alt.key).final;
      if (statusOf(final) !== 200) out.push(info(url, "target_not_200", { url, target: alt.key, code: alt.hreflang, outcome: final ? outcomeLabel(final) : "no final response" }));
    }
  }
  return out;
};

export const i18n05: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const label: Record<HreflangLink["method"], string> = { html: "HTML link elements", header: "the Link response header", sitemap: "sitemap xhtml:link entries" };
  for (const { url, page } of annotated(ctx)) {
    const methods = [...new Set(page.hreflangs.map((h) => h.method))].sort();
    if (methods.length > 1) out.push(info(url, "multiple_methods", { url, methods: methods.map((m) => label[m]).join(" and ") }));
  }
  return out;
};

export const I18N_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-I18N-07": i18n07,
  "SEO-I18N-02": i18n02,
  "SEO-I18N-03": i18n03,
  "SEO-I18N-04": i18n04,
  "SEO-I18N-06": i18n06,
  "SEO-I18N-08": i18n08,
  "SEO-I18N-09": i18n09,
  "SEO-I18N-05": i18n05,
};
