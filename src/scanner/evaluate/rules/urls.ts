import { header } from "../../snapshot/access.js";
import { attr, elements, hasRel } from "../core/html.js";
import { caseFoldedKey, comparisonKey, pathAndQuery } from "../core/url.js";
import type { EvaluationContext } from "../context.js";
import { fail, info, notApplicable, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { chainText, examples, statusOf } from "./helpers.js";

export const url01: RuleEvaluator = (ctx) => {
  if (ctx.variantOrigins.length === 0) return [notApplicable("site", "No host or protocol variant of the preferred origin resolves in DNS.")];
  const out: UnitResult[] = [];
  const unit = "site";
  let probes = 0;
  for (const origin of ctx.variantOrigins) {
    const probeUrls = [`${origin}/`];
    const sample = ctx.exchangesFor(`${origin}/`).length > 0
      ? ctx.allRequestedUrls().filter((u) => u.startsWith(`${origin}/`) && u !== `${origin}/` && ctx.primaryExchange(u)?.purpose === "variant_sample")
      : [];
    probeUrls.push(...sample);
    for (const probe of probeUrls) {
      const first = ctx.primaryExchange(probe);
      if (!first) continue;
      probes += 1;
      const expected = `${ctx.preferredOrigin}${pathAndQuery(probe)}`;
      const chain = ctx.chain(probe);
      const status = statusOf(first);
      if (first.outcome !== "response" || status === null) continue; // judged by SEO-HTTP-07 / not reachable
      if (status === 200) {
        out.push(fail(unit, "variant_serves_content", { variant_url: probe, expected }));
        continue;
      }
      const location = header(first, "location");
      const target = location ? comparisonKey(location, probe) ?? location : "";
      if (status === 302 || status === 303 || status === 307) {
        out.push(fail(unit, "variant_temporary_redirect", { variant_url: probe, target, status }));
        continue;
      }
      if (status === 301 || status === 308) {
        if (target === expected) {
          out.push(pass(unit, { variant_url: probe }));
        } else if (chain.final && chain.finalUrl === expected && chain.hops > 1) {
          out.push(fail(unit, "variant_multi_hop", { variant_url: probe, expected, hops: chain.hops, chain: chainText(chain) }));
        } else {
          out.push(fail(unit, "variant_wrong_target", { variant_url: probe, target, expected }));
        }
        continue;
      }
      // 4xx/5xx on a variant: not a consolidation signal either way; report as wrong target when it should redirect.
      if (status >= 300 && status < 400) out.push(fail(unit, "variant_temporary_redirect", { variant_url: probe, target, status }));
    }
  }
  if (probes === 0) return [notApplicable(unit, "No variant origin was probed.")];
  const fails = out.filter((r) => r.status === "fail");
  return fails.length > 0 ? fails : [pass(unit, { probes })];
};

const INVALID_CHARS = /[\u0000-\u001f\u007f "<>\\^`{|}]/;

export const url02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const values: string[] = [];
    for (const link of page.links) values.push(link.rawHref.trim());
    for (const link of elements(page.parsed.document, "link")) {
      if ((hasRel(link, "canonical") || attr(link, "hreflang") !== null) && attr(link, "href") !== null) values.push(attr(link, "href")!.trim());
    }
    for (const image of page.images) if (image.src !== null) values.push(image.src.trim());
    const invalid = values.filter((v) => INVALID_CHARS.test(v));
    const badPercent = values.filter((v) => /%(?![0-9A-Fa-f]{2})/.test(v));
    const nonAscii = values.filter((v) => /[^\u0000-\u007f]/.test(v)).length;
    let failed = false;
    if (invalid.length > 0) {
      failed = true;
      const example = [...invalid].sort()[0]!;
      const char = INVALID_CHARS.exec(example)![0];
      out.push(fail(url, "invalid_characters", { url, n: invalid.length, example, char: char === " " ? "space" : /[\u0000-\u001f\u007f]/.test(char) ? `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : char, non_ascii_count: nonAscii }));
    }
    if (badPercent.length > 0) {
      failed = true;
      out.push(fail(url, "bad_percent_encoding", { url, n: badPercent.length, example: [...badPercent].sort()[0]!, non_ascii_count: nonAscii }));
    }
    if (!failed) out.push(pass(url, { non_ascii_count: nonAscii }));
  }
  return out;
};

export const url03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.intended) {
    if (ctx.isBlocked(url)) continue;
    const path = new URL(url).pathname;
    out.push(path.includes("_") ? fail(url, "underscore_in_path", { url }) : pass(url));
  }
  return out;
};

export const url03hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.intended) {
    if (/[A-Z]/.test(new URL(url).pathname)) out.push(info(url, "uppercase_in_path", { url }));
  }
  return out;
};

export const url04: RuleEvaluator = (ctx) => {
  const routes: string[] = [];
  for (const url of ctx.fetchedPages) {
    const page = ctx.page(url);
    if (!page) continue;
    for (const link of page.links) {
      if (link.internal && (link.fragment.startsWith("#!") || link.fragment.startsWith("#/"))) {
        routes.push(`${link.key}${link.fragment}`);
      }
    }
  }
  if (routes.length === 0) return [pass("site")];
  const sorted = [...new Set(routes)].sort();
  return [fail("site", "fragment_routes", { n: routes.length, example: sorted[0]! })];
};

export const url05: RuleEvaluator = (ctx) => {
  const groups = new Map<string, string[]>();
  for (const url of ctx.allRequestedUrls()) {
    if (!ctx.isInScope(url)) continue;
    const exchange = ctx.primaryExchange(url);
    if (!exchange || exchange.purpose === "variant_probe" || exchange.purpose === "variant_sample") continue;
    if (statusOf(exchange) !== 200) continue;
    const folded = caseFoldedKey(url);
    const list = groups.get(folded);
    if (list) list.push(url);
    else groups.set(folded, [url]);
  }
  const out: UnitResult[] = [];
  for (const [, urls] of [...groups.entries()].sort()) {
    if (urls.length < 2) continue;
    const canonicals = new Set(urls.map((u) => ctx.headCanonicalOf(u) ?? "(none)"));
    const agree = canonicals.size === 1 && !canonicals.has("(none)") && urls.includes([...canonicals][0]!);
    if (!agree) out.push(fail("site", "case_duplicates", { urls: urls.join(", "), n: urls.length }));
  }
  return out.length > 0 ? out : [pass("site")];
};

export const url06: RuleEvaluator = (ctx) => {
  const found = new Set<string>();
  for (const url of ctx.fetchedPages) {
    const page = ctx.page(url);
    if (!page) continue;
    for (const link of page.links) {
      if (!link.internal || !link.key) continue;
      const query = new URL(link.key).search;
      if (/[,;[\]]/.test(query)) found.add(link.key);
    }
  }
  if (found.size === 0) return [];
  return [info("site", "separator_characters", { n: found.size, example: [...found].sort()[0]! })];
};

export const URL_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-URL-01": url01,
  "SEO-URL-02": url02,
  "SEO-URL-03": url03,
  "SEO-URL-03-HC": url03hc,
  "SEO-URL-04": url04,
  "SEO-URL-05": url05,
  "SEO-URL-06": url06,
};

void examples;
export type { EvaluationContext };
