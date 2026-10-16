import { effectiveGoogleDirectives } from "../core/directives.js";
import { attr, elements, isInHead, lineOf, parseHtml, relTokens, text as elementText, type ParsedHtml } from "../core/html.js";
import { allItems, jsonLdBlocks } from "../core/structured-data.js";
import { formatMs, formatThousandths } from "../core/text.js";
import { headers } from "../../snapshot/access.js";
import { canonicalize } from "../../snapshot/canonical-json.js";
import type { Exchange } from "../../snapshot/types.js";
import { comparisonKey } from "../core/url.js";
import type { EvaluationContext } from "../context.js";
import { fail, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";

/** The normalized CrUX record the acquirer stores per (scope, form factor). */
export interface CruxRecord {
  scope: "origin" | "url";
  target: string;
  form_factor: "PHONE" | "DESKTOP";
  first_date: string;
  last_date: string;
  lcp_p75_ms: number | null;
  inp_p75_ms: number | null;
  cls_p75_thousandths: number | null;
}

function isCruxRecord(value: unknown): value is CruxRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (r.scope === "origin" || r.scope === "url") && typeof r.target === "string" && (r.form_factor === "PHONE" || r.form_factor === "DESKTOP");
}

export const perf01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const records = Object.entries(ctx.snapshot.crux ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const pages = new Set(ctx.pages);
  for (const [key, raw] of records) {
    if (!isCruxRecord(raw)) continue;
    if (raw.scope === "url" && !pages.has(raw.target)) continue;
    if (raw.scope === "origin" && raw.target !== ctx.preferredOrigin) continue;
    const unit = key;
    const scopeLabel = raw.scope === "origin" ? `the origin ${raw.target}` : raw.target;
    const bingClause = ctx.engines.has("bing") ? " Bing lists page load time among its main ranking parameters." : "";
    // The three 75th-percentile values travel with every result, pass or fail, so a
    // report can show the field data it judged. "no data" marks a metric the record lacks.
    const base = {
      scope_label: scopeLabel,
      form_factor: raw.form_factor,
      first_date: raw.first_date,
      last_date: raw.last_date,
      bing_clause: bingClause,
      lcp_p75: raw.lcp_p75_ms === null ? "no data" : formatMs(raw.lcp_p75_ms),
      inp_p75: raw.inp_p75_ms === null ? "no data" : formatMs(raw.inp_p75_ms),
      cls_p75: raw.cls_p75_thousandths === null ? "no data" : formatThousandths(raw.cls_p75_thousandths),
    };
    let failed = false;
    if (raw.lcp_p75_ms !== null && raw.lcp_p75_ms > 2500) {
      failed = true;
      out.push(fail(unit, "lcp_over", { ...base, metric: "LCP", value: formatMs(raw.lcp_p75_ms), threshold: "2,500 ms" }));
    }
    if (raw.inp_p75_ms !== null && raw.inp_p75_ms > 200) {
      failed = true;
      out.push(fail(unit, "inp_over", { ...base, metric: "INP", value: formatMs(raw.inp_p75_ms), threshold: "200 ms" }));
    }
    if (raw.cls_p75_thousandths !== null && raw.cls_p75_thousandths > 100) {
      failed = true;
      out.push(fail(unit, "cls_over", { ...base, metric: "CLS", value: formatThousandths(raw.cls_p75_thousandths), threshold: "0.100" }));
    }
    if (!failed) {
      if (raw.lcp_p75_ms === null && raw.inp_p75_ms === null && raw.cls_p75_thousandths === null) out.push(notEvaluated(unit, "The Chrome UX Report has no field data for this scope."));
      else out.push(pass(unit, base));
    }
  }
  if (out.length === 0) return [notEvaluated("site", "No Chrome UX Report field data is stored in the snapshot.")];
  return out;
};

interface ParityView {
  title: string;
  robots: string;
  canonical: string;
  structuredData: string;
}

function parityView(parsed: ParsedHtml, exchange: Exchange, url: string, completedAtMs: number): ParityView {
  const title = elements(parsed.document, "title").find((t) => isInHead(parsed, t));
  const metas = elements(parsed.document, "meta").map((m) => ({ name: attr(m, "name") ?? "", content: attr(m, "content") ?? "", line: lineOf(m) }));
  const d = effectiveGoogleDirectives({ metas, xRobotsTag: headers(exchange, "x-robots-tag") }, completedAtMs);
  const robots = [d.noindex ? "noindex" : "", d.nofollow ? "nofollow" : "", d.nosnippet ? "nosnippet" : ""].filter(Boolean).join(",") || "none";
  const canonicalEl = elements(parsed.document, "link").find((l) => relTokens(l).includes("canonical") && isInHead(parsed, l));
  const canonical = canonicalEl ? comparisonKey(attr(canonicalEl, "href") ?? "", url) ?? "" : "none";
  const items = allItems(jsonLdBlocks(parsed)).map((i) => canonicalize(i.value)).sort();
  return { title: title ? elementText(title) : "none", robots, canonical, structuredData: items.join("|") || "none" };
}

export const perf03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const candidates = [ctx.homePage, ...ctx.pages.filter((u) => u !== ctx.homePage).slice(0, 1)];
  for (const url of candidates) {
    const mobile = ctx.exchangeWithPurpose(url, "parity_mobile");
    const desktop = ctx.exchangeWithPurpose(url, "parity_desktop");
    if (!mobile || !desktop) {
      out.push(notEvaluated(url, "Mobile and desktop fetches are not stored for this URL."));
      continue;
    }
    const mobileBody = ctx.body(mobile);
    const desktopBody = ctx.body(desktop);
    if (!mobileBody || !desktopBody) {
      out.push(notEvaluated(url, "A parity fetch returned no body."));
      continue;
    }
    const m = parityView(parseHtml(mobileBody, headers(mobile, "content-type")[0] ?? null), mobile, url, ctx.completedAtMs);
    const d = parityView(parseHtml(desktopBody, headers(desktop, "content-type")[0] ?? null), desktop, url, ctx.completedAtMs);
    let failed = false;
    const check = (condition: string, field: string, a: string, b: string) => {
      if (a !== b) {
        failed = true;
        out.push(fail(url, condition, { url, field, mobile_value: a, desktop_value: b }));
      }
    };
    check("title_differs", "the title", m.title, d.title);
    check("robots_differs", "robots directives", m.robots, d.robots);
    check("canonical_differs", "the canonical", m.canonical, d.canonical);
    check("structured_data_differs", "structured data", m.structuredData === d.structuredData ? "same" : "different JSON-LD items", "same");
    if (!failed) out.push(pass(url));
  }
  return out;
};

export const PERFORMANCE_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-PERF-01": perf01,
  "SEO-PERF-03": perf03,
};

export type { EvaluationContext };
