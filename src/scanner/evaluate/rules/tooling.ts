import { attr, metaByName } from "../core/html.js";
import type { RuleEvaluator } from "../findings.js";
import { info } from "../findings.js";

export const tools01: RuleEvaluator = (ctx) => {
  const found: string[] = [];
  const host = new URL(ctx.preferredOrigin).hostname;
  const txt = [...(ctx.snapshot.dns[host]?.txt ?? []), ...(ctx.snapshot.dns[host.replace(/^www\./, "")]?.txt ?? [])];
  if (txt.some((v) => v.startsWith("google-site-verification="))) found.push("a google-site-verification DNS TXT record");
  const home = ctx.page(ctx.homePage);
  if (home) {
    if (metaByName(home.parsed, "google-site-verification").some((m) => (attr(m, "content") ?? "").trim() !== "")) found.push("a google-site-verification meta tag");
    if (metaByName(home.parsed, "msvalidate.01").some((m) => (attr(m, "content") ?? "").trim() !== "")) found.push("an msvalidate.01 meta tag");
  }
  if (found.length === 0) return [];
  return [info("site", "verification_tokens", { tokens_clause: `The scan observed ${found.join(", ")}.` })];
};

export const TOOLING_EVALUATORS: Record<string, RuleEvaluator> = { "SEO-TOOLS-01": tools01 };
