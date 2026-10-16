import { header, outcomeLabel } from "../../snapshot/access.js";
import type { Exchange } from "../../snapshot/types.js";
import { formatExamples, formatInt, sortBytes } from "../core/text.js";
import type { Chain, EvaluationContext } from "../context.js";
import type { Observed } from "../../report/types.js";

export { outcomeLabel };

/** " (reached via {hops} redirects from {original})" or "". */
export function viaClause(chain: Chain): string {
  if (chain.hops === 0) return "";
  return ` (reached via ${formatInt(chain.hops)} redirects from ${chain.requested})`;
}

export function statusOf(exchange: Exchange | null): number | null {
  return exchange && exchange.outcome === "response" ? exchange.status : null;
}

export function errorCode(exchange: Exchange | null): string {
  if (!exchange) return "not_fetched";
  if (exchange.outcome === "response") return `http_${exchange.status}`;
  if (exchange.outcome === "tls_error") return exchange.error_code ? `tls_error:${exchange.error_code}` : "tls_error";
  return exchange.outcome;
}

export function isRedirectExchange(exchange: Exchange | null): boolean {
  return exchange !== null && exchange.outcome === "response" && exchange.status !== null && exchange.status >= 300 && exchange.status < 400 && header(exchange, "location") !== null;
}

/** "a → b → c" for reasons. */
export function chainText(chain: Chain): string {
  const urls = chain.exchanges.map((e) => e.request.url);
  if (chain.problem === "loop") urls.push(chain.finalUrl);
  return urls.join(" → ");
}

export function examples(values: Iterable<string>): string {
  return formatExamples(sortBytes(new Set(values)));
}

export function sizeOf(exchange: Exchange, bytes: Uint8Array | null): number {
  return exchange.size_uncompressed ?? bytes?.length ?? 0;
}

/** Pages in P, as a sorted list, convenient for page-scoped rules. */
export function pagesOf(ctx: EvaluationContext): string[] {
  return ctx.pages;
}

export function withObserved(base: Observed, extra: Observed): Observed {
  return { ...base, ...extra };
}
