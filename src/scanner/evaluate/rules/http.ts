import { header } from "../../snapshot/access.js";
import { byteOffset, elements, endOffsetOf, firstElement, offsetOf } from "../core/html.js";
import { formatInt } from "../core/text.js";
import { originOf } from "../core/url.js";
import type { EvaluationContext } from "../context.js";
import { fail, info, notApplicable, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { chainText, errorCode, examples, isRedirectExchange, outcomeLabel, sizeOf, statusOf, viaClause } from "./helpers.js";

const GOOGLEBOT_LIMIT = 2_097_152;

export const http01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.intended) {
    const chain = ctx.chain(url);
    if (chain.problem === "loop") {
      out.push(fail(url, "unresolved_redirect", { url, chain_problem: "the redirect chain loops", chain: chainText(chain) }));
      continue;
    }
    if (chain.problem === "too_many_hops") {
      out.push(fail(url, "unresolved_redirect", { url, chain_problem: "the redirect chain exceeds 10 hops", chain: chainText(chain) }));
      continue;
    }
    const final = chain.final;
    if (!final || chain.problem === "unfetched") {
      out.push(notEvaluated(url, "The URL was not fetched within the scan's budget."));
      continue;
    }
    if (final.outcome === "blocked_by_robots_policy") {
      out.push(notEvaluated(url, "The scanner's own robots policy (respect mode) prevented fetching this URL."));
      continue;
    }
    if (final.outcome !== "response") {
      out.push(fail(url, "no_response", { url: chain.finalUrl, error: errorCode(final), outcome: outcomeLabel(final) }));
      continue;
    }
    const status = final.status ?? 0;
    const observed = { url: chain.finalUrl, original: url, status, via_clause: viaClause(chain), hops: chain.hops };
    if (status >= 500 || status === 429) out.push(fail(url, "server_error", observed));
    else if (status >= 400 && status !== 401 && status !== 403 && status !== 407) out.push(fail(url, "client_error", observed));
    else out.push(pass(url, { status, hops: chain.hops }));
  }
  return out;
};

const WAF_HEADERS = ["cf-mitigated", "x-sucuri-id", "x-akamai-request-id", "x-iinfo", "x-distil-cs"];
const WAF_BODY = ["just a moment", "checking your browser", "attention required", "access denied", "request blocked", "captcha", "bot protection", "incapsula", "perimeterx"];

export const http02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.intended) {
    const chain = ctx.chain(url);
    const final = chain.final;
    if (!final || final.outcome !== "response") {
      out.push(notEvaluated(url, "No final HTTP response is available for this URL."));
      continue;
    }
    const status = final.status ?? 0;
    if (status === 401 || status === 403 || status === 407) {
      const bodyBytes = ctx.body(final);
      const bodyText = bodyBytes ? new TextDecoder("utf-8", { fatal: false }).decode(bodyBytes.subarray(0, 65_536)).toLowerCase() : "";
      const waf = WAF_HEADERS.some((name) => header(final, name) !== null) || WAF_BODY.some((needle) => bodyText.includes(needle));
      out.push(
        fail(url, "auth_required", {
          url: chain.finalUrl,
          status,
          waf_clause: waf ? " The response looks like a bot challenge; it may differ for verified crawlers, which this scanner cannot impersonate." : "",
        }),
      );
    } else {
      out.push(pass(url, { status }));
    }
  }
  return out;
};

export const http03: RuleEvaluator = (ctx) => {
  const unit = ctx.preferredOrigin;
  const probe = ctx.snapshot.probe_404_url;
  const chain = ctx.chain(probe);
  const final = chain.final;
  if (chain.exchanges.length === 0) return [notEvaluated(unit, "The 404 probe was not fetched.")];
  if (final && final.outcome === "response" && (final.status === 404 || final.status === 410)) {
    return [pass(unit, { probe_url: probe, status: final.status ?? 0 })];
  }
  if (final && final.outcome === "response" && final.status === 200) {
    const home = ctx.chain(ctx.homePage).final;
    const same = home?.body_sha256 !== null && home?.body_sha256 !== undefined && home.body_sha256 === final.body_sha256;
    return [
      fail(unit, "probe_200", {
        probe_url: probe,
        same_as_home_clause: same ? " with the same content as the home page" : "",
        same_as_home: same ? "true" : "false",
        via_clause: viaClause(chain),
      }),
    ];
  }
  return [fail(unit, "probe_other", { probe_url: probe, outcome: final ? outcomeLabel(final) : chain.problem === "loop" ? "a redirect loop" : "no final response", via_clause: viaClause(chain) })];
};

export const http07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const unit = "site";
  if (ctx.preferredOrigin.startsWith("http:")) out.push(fail(unit, "preferred_origin_http", { origin: ctx.preferredOrigin }));
  const origins = new Set([...ctx.inScopeOrigins, ...ctx.variantOrigins].filter((o) => o.startsWith("https:")));
  for (const origin of [...origins].sort()) {
    const tls = ctx.snapshot.tls[origin];
    if (tls && !tls.valid) out.push(fail(unit, "certificate_invalid", { origin, error: tls.error ?? "handshake_failed" }));
  }
  for (const url of ctx.allRequestedUrls()) {
    const exchange = ctx.primaryExchange(url);
    if (!exchange || !isRedirectExchange(exchange)) continue;
    const location = header(exchange, "location")!;
    let target: URL;
    try {
      target = new URL(location, exchange.request.url);
    } catch {
      continue;
    }
    if (url.startsWith("https:") && target.protocol === "http:") {
      out.push(fail(unit, "https_to_http_redirect", { from: url, to: target.toString() }));
    }
  }
  return out.length > 0 ? out : [pass(unit, { origin: ctx.preferredOrigin })];
};

function beyondClause(ctx: EvaluationContext, url: string, limit: number): string {
  const page = ctx.page(url);
  if (!page) return "";
  const parts: string[] = [];
  const check = (label: string, charOffset: number | null) => {
    if (charOffset === null) return;
    const bytes = byteOffset(page.parsed, charOffset);
    if (bytes > limit) parts.push(` ${label} starts at byte ${formatInt(bytes)}, beyond the limit.`);
  };
  const head = page.parsed.head;
  check("The end of the head", head ? endOffsetOf(head) : null);
  check("The canonical link", page.headCanonicals[0] ? offsetOf(page.headCanonicals[0].element) : null);
  const robotsMeta = elements(page.parsed.document, "meta").find((m) => /^(robots|googlebot)$/i.test((m.attrs.find((a) => a.name === "name")?.value ?? "").trim()));
  check("The robots meta tag", robotsMeta ? offsetOf(robotsMeta) : null);
  const h1 = firstElement(page.parsed, "h1");
  check("The first h1", h1 ? offsetOf(h1) : null);
  return parts.join("");
}

export const http09: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const bytes = sizeOf(page.exchange, page.bytes);
    if (bytes > GOOGLEBOT_LIMIT) out.push(fail(url, "over_limit", { url, bytes, beyond_clause: beyondClause(ctx, url, GOOGLEBOT_LIMIT) }));
    else out.push(pass(url, { bytes }));
  }
  return out;
};

export const http09b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const bytes = sizeOf(page.exchange, page.bytes);
    if (bytes > 2_000_000 && bytes <= GOOGLEBOT_LIMIT) out.push(info(url, "near_limit", { url, bytes }));
  }
  return out;
};

export const http09hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const bytes = sizeOf(page.exchange, page.bytes);
    if (bytes > 1_000_000) out.push(info(url, "over_1mb", { url, bytes }));
  }
  return out;
};

export const http05: RuleEvaluator = (ctx) => {
  const errors: string[] = [];
  for (const url of ctx.allRequestedUrls()) {
    if (!ctx.isInScope(url)) continue;
    const exchange = ctx.primaryExchange(url);
    if (!exchange || exchange.purpose === "variant_probe" || exchange.purpose === "variant_sample") continue;
    const status = statusOf(ctx.chain(url).final);
    if (status !== null && (status >= 500 || status === 429)) errors.push(url);
  }
  if (errors.length === 0) return [];
  return [info("site", "server_errors", { n: errors.length, examples: examples(errors) })];
};

export const http06: RuleEvaluator = (ctx) => {
  const conditional = ctx.exchangeWithPurpose(ctx.homePage, "conditional");
  if (!conditional) return [];
  const requestHeaders = conditional.request.headers.map(([name]) => name.toLowerCase());
  const validator = requestHeaders.includes("if-none-match") ? "ETag" : requestHeaders.includes("if-modified-since") ? "Last-Modified" : "a validator";
  if (conditional.outcome === "response" && conditional.status === 304) return [info(ctx.preferredOrigin, "supports_304", { validator })];
  return [info(ctx.preferredOrigin, "no_304", { validator, status: statusOf(conditional) ?? 0, outcome: outcomeLabel(conditional) })];
};

export const HTTP_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-HTTP-01": http01,
  "SEO-HTTP-02": http02,
  "SEO-HTTP-03": http03,
  "SEO-HTTP-07": http07,
  "SEO-HTTP-09": http09,
  "SEO-HTTP-09B": http09b,
  "SEO-HTTP-09-HC": http09hc,
  "SEO-HTTP-05": http05,
  "SEO-HTTP-06": http06,
};

// Keep unused imports referenced for future rules.
void originOf;
void notApplicable;
