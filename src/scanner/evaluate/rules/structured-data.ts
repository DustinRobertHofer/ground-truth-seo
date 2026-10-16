import { FEATURE_REGISTRY, RETIRED_FEATURES } from "../../rules/structured-data.js";
import type { FeatureName } from "../../rules/types.js";
import { headers } from "../../snapshot/access.js";
import { visibleText } from "../core/html.js";
import { readImage } from "../core/image.js";
import { ruleText } from "../core/robots-txt.js";
import {
  allItems,
  isPresent,
  jsonLdBlocks,
  pathPresent,
  presentCount,
  stringOf,
  urlOf,
  valuesAt,
  type JsonLdValue,
  type SdItem,
} from "../core/structured-data.js";
import { foldText, normalizeText } from "../core/text.js";
import { comparisonKey } from "../core/url.js";
import { GOOGLEBOT_IMAGE_CHAIN, type EvaluationContext } from "../context.js";
import { fail, info, notEvaluated, opportunity, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { outcomeLabel, statusOf } from "./helpers.js";

const GOOGLE_IMAGE_FORMATS = new Set(["BMP", "GIF", "JPEG", "PNG", "WebP", "SVG", "AVIF"]);

function itemsOf(ctx: EvaluationContext, url: string): SdItem[] {
  const page = ctx.page(url);
  if (!page) return [];
  return allItems(jsonLdBlocks(page.parsed));
}

export const sd01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const blocks = jsonLdBlocks(ctx.page(url)!.parsed);
    if (blocks.length === 0) continue;
    const bad = blocks.filter((b) => b.error !== null);
    if (bad.length === 0) {
      out.push(pass(url, { blocks: blocks.length }));
      continue;
    }
    for (const block of bad) {
      out.push(fail(url, "invalid_json", { url, line: block.error!.line, column: block.error!.column, error: block.error!.code, excerpt: block.error!.excerpt }));
    }
  }
  return out;
};

function breadcrumbMissing(item: SdItem): string[] {
  const missing: string[] = [];
  if (!pathPresent(item.value, "itemListElement")) return ["itemListElement"];
  const list = valuesAt(item.value, "itemListElement");
  const members: JsonLdValue[] = [];
  for (const v of list) (Array.isArray(v) ? v : [v]).forEach((m) => members.push(m));
  members.forEach((member, index) => {
    if (member === null || typeof member !== "object" || Array.isArray(member)) return;
    const obj = member as { [key: string]: JsonLdValue };
    const last = index === members.length - 1;
    for (const prop of ["position", "name"]) if (!pathPresent(obj, prop)) missing.push(`itemListElement[${index}].${prop}`);
    if (!last && !pathPresent(obj, "item")) missing.push(`itemListElement[${index}].item`);
  });
  return missing;
}

export const sd02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const items = itemsOf(ctx, url);
    const isHome = ctx.inScopeHomePages.includes(url);
    for (const entry of FEATURE_REGISTRY) {
      const matching = items.filter((item) => item.types.includes(entry.type));
      if (matching.length === 0) continue;
      if (entry.feature === "site_name" && !isHome) continue;
      const unit = `${url} [${entry.feature}]`;
      const feature = entry.feature as FeatureName;
      const extra = [{ source_id: entry.source_id, section: "Required properties", quote: entry.quote }];
      let failed = false;
      for (const item of matching) {
        let missing: string[];
        if (entry.feature === "breadcrumb") missing = breadcrumbMissing(item);
        else missing = entry.required.filter((path) => !pathPresent(item.value, path));
        if (missing.length > 0) {
          failed = true;
          if (entry.feature === "site_name") {
            out.push(fail(unit, "missing_required_site_name", { origin: new URL(url).origin, url, missing: missing.join(", ") }, { feature, extraCitations: extra }));
          } else {
            out.push(fail(unit, "missing_required", { url, type: entry.type, missing: missing.join(", ") }, { feature, extraCitations: extra }));
          }
        }
        if (entry.feature === "vacation_rental") {
          const n = presentCount(item.value, "image");
          if (n < 8) {
            failed = true;
            out.push(fail(unit, "too_few_images", { url, n }, { feature, extraCitations: extra }));
          }
        }
      }
      if (!failed) out.push({ ...pass(unit, { type: entry.type, items: matching.length }), feature });
    }
  }
  return out;
};

export const sd04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const home of ctx.inScopeHomePages) {
    const page = ctx.page(home);
    const origin = new URL(home).origin;
    if (!page) {
      out.push(notEvaluated(origin, "The home page did not return 200 HTML."));
      continue;
    }
    const websites = itemsOf(ctx, home).filter((item) => item.types.includes("WebSite"));
    if (websites.length === 0) {
      out.push(opportunity(origin, "missing", { origin }));
      continue;
    }
    let failed = false;
    if (websites.length > 1) {
      failed = true;
      out.push(fail(origin, "multiple_blocks", { origin, n: websites.length }));
    }
    const expected = ctx.headCanonicalOf(home) ?? home;
    const value = urlOf(websites[0]!.value.url);
    const valueKey = value ? comparisonKey(value, home) : null;
    if (valueKey !== expected) {
      failed = true;
      out.push(fail(origin, "url_not_canonical_home", { origin, value: value ?? "(missing)", expected }));
    }
    if (!failed) out.push(pass(origin, { url: value ?? "" }));
  }
  return out;
};

export const sd05: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const orgs = itemsOf(ctx, url).filter((item) => item.types.includes("Organization") && isPresent(item.value.logo));
    for (const org of orgs) {
      const logoUrl = urlOf(org.value.logo);
      if (!logoUrl) continue;
      const key = comparisonKey(logoUrl, page.base);
      const unit = `${url} logo ${key ?? logoUrl}`;
      if (!key) {
        out.push(fail(unit, "logo_not_ok", { logo_url: logoUrl, outcome: "an unparseable URL" }));
        continue;
      }
      const chain = ctx.chain(key);
      if (chain.exchanges.length === 0) {
        out.push(notEvaluated(unit, "The logo was not fetched."));
        continue;
      }
      const final = chain.final;
      let failed = false;
      if (statusOf(final) !== 200) {
        failed = true;
        out.push(fail(unit, "logo_not_ok", { logo_url: key, outcome: final ? outcomeLabel(final) : "no final response" }));
      }
      const access = ctx.access(key, GOOGLEBOT_IMAGE_CHAIN);
      if (access.kind === "decided" && !access.decision.allowed && access.decision.rule) {
        failed = true;
        out.push(fail(unit, "logo_blocked", { logo_url: key, rule: ruleText(access.decision.rule) }));
      }
      if (final && headers(final, "x-robots-tag").some((v) => /\bnoindex\b|\bnone\b/i.test(v))) {
        failed = true;
        out.push(fail(unit, "logo_noindex", { logo_url: key }));
      }
      const bytes = statusOf(final) === 200 ? ctx.body(final) : null;
      if (bytes) {
        const image = readImage(bytes);
        if (image.format === "unknown") {
          failed = true;
          out.push(fail(unit, "logo_unreadable", { logo_url: key }));
        } else if (!GOOGLE_IMAGE_FORMATS.has(image.format)) {
          failed = true;
          out.push(fail(unit, "logo_unsupported_format", { logo_url: key, format: image.format }));
        } else if (image.width === null || image.height === null) {
          failed = true;
          out.push(fail(unit, "logo_unreadable", { logo_url: key }));
        } else if (image.width < 112 || image.height < 112) {
          failed = true;
          out.push(fail(unit, "logo_too_small", { logo_url: key, width: image.width, height: image.height }));
        }
      }
      if (!failed) out.push(pass(unit, { logo_url: key }));
    }
  }
  return out;
};

export const sd03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const registered = new Set(FEATURE_REGISTRY.map((e) => e.type));
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const visible = foldText(visibleText(page.parsed));
    for (const item of itemsOf(ctx, url)) {
      if (!item.types.some((t) => registered.has(t))) continue;
      for (const property of ["name", "headline", "description"]) {
        const value = stringOf(item.value[property]);
        if (!value) continue;
        const needle = foldText(normalizeText(value));
        if (needle !== "" && !visible.includes(needle)) out.push(info(url, "not_visible", { url, type: item.types[0]!, property, value }));
      }
    }
  }
  return out;
};

export const sd06hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    for (const item of itemsOf(ctx, url).filter((i) => i.types.includes("BreadcrumbList"))) {
      const positions = valuesAt(item.value, "itemListElement.position").map((v) => (typeof v === "number" ? v : Number(v)));
      const consecutive = positions.every((p, i) => p === i + 1);
      if (positions.length > 0 && !consecutive) out.push(info(url, "positions_not_consecutive", { url, positions: positions.join(", ") }));
    }
  }
  return out;
};

export const sd07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    for (const item of itemsOf(ctx, url)) {
      for (const retired of RETIRED_FEATURES) {
        if (retired.types.some((t) => item.types.includes(t))) out.push(info(url, "retired_feature", { url, feature: retired.feature, date: retired.date, type: item.types[0]! }));
      }
    }
  }
  return out;
};

export const sd08: RuleEvaluator = () => [];

export const STRUCTURED_DATA_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-SD-01": sd01,
  "SEO-SD-02": sd02,
  "SEO-SD-04": sd04,
  "SEO-SD-05": sd05,
  "SEO-SD-03": sd03,
  "SEO-SD-06-HC": sd06hc,
  "SEO-SD-07": sd07,
  "SEO-SD-08": sd08,
};
