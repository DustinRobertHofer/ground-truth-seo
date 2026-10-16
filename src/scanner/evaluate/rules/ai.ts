import { CRAWLERS } from "../../rules/crawlers.js";
import { hasAttr, allElements } from "../core/html.js";
import { ruleText } from "../core/robots-txt.js";
import type { EvaluationContext } from "../context.js";
import { info, type RuleEvaluator, type UnitResult } from "../findings.js";
import { outcomeLabel, statusOf } from "./helpers.js";

export const ai01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const d = page.directives;
    if (d.nosnippet) out.push(info(url, "nosnippet_policy", { url, directive: d.maxSnippet === 0 ? "max-snippet:0" : "nosnippet" }));
    else if (d.maxSnippet !== null && d.maxSnippet > 0) out.push(info(url, "max_snippet_limit", { url, directive: `max-snippet:${d.maxSnippet}` }));
    const n = allElements(page.parsed.document).filter((el) => hasAttr(el, "data-nosnippet")).length;
    if (n > 0) out.push(info(url, "data_nosnippet_regions", { url, n }));
  }
  return out;
};

export interface MatrixCell {
  url: string;
  outcome: "allowed" | "disallowed" | "unknown";
  rule: string | null;
  line: number | null;
}

export function accessMatrixSample(ctx: EvaluationContext): string[] {
  return [ctx.homePage, ...ctx.intended.filter((u) => u !== ctx.homePage).slice(0, 10)];
}

/** Whether robots.txt lets a crawler (by its token chain) fetch one URL, with the deciding rule. */
export function accessCell(ctx: EvaluationContext, url: string, chain: readonly string[]): MatrixCell {
  const access = ctx.access(url, chain);
  if (access.kind === "decided") {
    if (access.decision.allowed) return { url, outcome: "allowed", rule: null, line: null };
    return { url, outcome: "disallowed", rule: access.decision.rule ? ruleText(access.decision.rule) : null, line: access.decision.rule?.line ?? null };
  }
  if (access.kind === "allowed_no_robots") return { url, outcome: "allowed", rule: null, line: null };
  return { url, outcome: "unknown", rule: null, line: null };
}

export function accessMatrixRow(ctx: EvaluationContext, token: string): MatrixCell[] {
  const chain = ctx.crawlerChain(token);
  return accessMatrixSample(ctx).map((url) => accessCell(ctx, url, chain));
}

export const ai02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const crawler of CRAWLERS) {
    const cells = accessMatrixRow(ctx, crawler.token);
    const home = cells[0]!;
    out.push(
      info(crawler.token, "access_matrix", {
        crawler: crawler.token,
        operator: crawler.operator,
        url: home.url,
        outcome: home.outcome,
        rule_clause: home.rule ? ` by ${home.rule} (line ${home.line})` : "",
        meaning: `${crawler.purpose}. ${crawler.robotsBehavior}`,
      }, { extraCitations: [{ source_id: crawler.source_id, section: "Crawler reference", quote: null }] }),
    );
  }
  return out;
};

export const ai04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const tokens = ctx.page(url)!.bingTokens;
    const found = tokens.filter((t) => t === "noarchive" || t === "nocache");
    if (found.length > 0) out.push(info(url, "answer_use_control", { url, directive: [...new Set(found)].sort().join(", ") }));
  }
  return out;
};

export const ai05: RuleEvaluator = (ctx) => {
  const url = `${ctx.preferredOrigin}/llms.txt`;
  const exchange = ctx.primaryExchange(url);
  if (!exchange) return [];
  const final = ctx.chain(url).final;
  const presence = statusOf(final) === 200 ? "/llms.txt is present (HTTP 200)." : `/llms.txt returned ${final ? outcomeLabel(final) : "no final response"}.`;
  return [info(ctx.preferredOrigin, "llms_txt", { presence })];
};

export const AI_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-AI-01": ai01,
  "SEO-AI-02": ai02,
  "SEO-AI-04": ai04,
  "SEO-AI-05": ai05,
};
