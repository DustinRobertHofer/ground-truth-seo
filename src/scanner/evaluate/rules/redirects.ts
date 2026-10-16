import { header } from "../../snapshot/access.js";
import { elements, rawText } from "../core/html.js";
import type { EvaluationContext } from "../context.js";
import { fail, info, notApplicable, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { chainText, isRedirectExchange, statusOf } from "./helpers.js";

/** Distinct URLs observed answering with a redirect, excluding variant probes (§4.12). */
export function redirectUnits(ctx: EvaluationContext): string[] {
  return ctx.allRequestedUrls().filter((url) => {
    const exchange = ctx.primaryExchange(url);
    if (!exchange || exchange.purpose === "variant_probe" || exchange.purpose === "variant_sample") return false;
    return isRedirectExchange(exchange);
  });
}

export const redir07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  const intended = new Set(ctx.intended);
  for (const source of redirectUnits(ctx)) {
    if (intended.has(source)) continue;
    const chain = ctx.chain(source);
    if (chain.problem === "loop") out.push(fail(source, "loop", { source, chain: chainText(chain) }));
    else if (chain.problem === "too_many_hops") out.push(fail(source, "too_many_hops", { source, chain: chainText(chain) }));
    else out.push(pass(source, { hops: chain.hops }));
  }
  return out;
};

export const redir03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const source of redirectUnits(ctx)) {
    const chain = ctx.chain(source);
    if (chain.problem === "loop" || chain.problem === "too_many_hops") {
      out.push(notApplicable(source, "The chain never resolves; see SEO-REDIR-07."));
      continue;
    }
    if (chain.problem === "unfetched") continue;
    if (chain.hops >= 2) out.push(fail(source, "multi_hop", { source, final: chain.finalUrl, hops: chain.hops, chain: chainText(chain) }));
    else out.push(pass(source, { hops: chain.hops }));
  }
  return out;
};

export const redir01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const source of redirectUnits(ctx)) {
    const exchange = ctx.primaryExchange(source)!;
    const status = statusOf(exchange);
    if (status === 302 || status === 303 || status === 307) {
      out.push(info(source, "temporary_redirect", { source, status, target: header(exchange, "location") ?? "" }));
    }
  }
  return out;
};

const LOCATION_ASSIGN = /^[ \t]*(?:window\.|document\.|top\.|self\.)?location(?:\.href)?\s*=[^=]|^[ \t]*(?:window\.|document\.|top\.|self\.)?location\.(?:replace|assign)\s*\(/m;

export const redir06: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    for (const script of elements(page.parsed.document, "script")) {
      if (script.attrs.some((a) => a.name === "src")) continue;
      const type = script.attrs.find((a) => a.name === "type")?.value.toLowerCase() ?? "";
      if (type !== "" && !/javascript|module|ecmascript/.test(type)) continue;
      const code = rawText(script);
      const match = LOCATION_ASSIGN.exec(code);
      if (match) {
        // Top level only: no enclosing function keyword before the match.
        const before = code.slice(0, match.index);
        if (/\bfunction\b|=>/.test(before)) continue;
        out.push(info(url, "client_side_redirect", { url, snippet: match[0].trim().slice(0, 80) }));
        break;
      }
    }
  }
  return out;
};

export const REDIRECT_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-REDIR-07": redir07,
  "SEO-REDIR-03": redir03,
  "SEO-REDIR-01": redir01,
  "SEO-REDIR-06": redir06,
};
