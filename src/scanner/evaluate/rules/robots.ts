import { attr, elements } from "../core/html.js";
import { groupLabel, ruleText, selectGroups, type RobotsRule } from "../core/robots-txt.js";
import { formatInt } from "../core/text.js";
import { comparisonKey, hasScheme } from "../core/url.js";
import { BINGBOT_CHAIN, GOOGLEBOT_CHAIN, type EvaluationContext } from "../context.js";
import { fail, info, notApplicable, notEvaluated, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { examples, outcomeLabel, statusOf } from "./helpers.js";

function parsedOrigins(ctx: EvaluationContext) {
  return ctx.inScopeOrigins.flatMap((origin) => {
    const robots = ctx.robots(origin);
    return robots.state === "parsed" ? [{ origin, robots }] : [];
  });
}

export const robots02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { origin, robots } of parsedOrigins(ctx)) {
    const line = robots.parsed.invalidUtf8Line;
    out.push(line === null ? pass(origin) : fail(origin, "invalid_utf8", { origin, line }));
  }
  return out.length > 0 ? out : [notApplicable("site", "No in-scope origin served a 2xx robots.txt.")];
};

export const robots03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { origin, robots } of parsedOrigins(ctx)) {
    const over = robots.parsed.overLimit;
    if (over) out.push(fail(origin, "over_limit", { origin, bytes: robots.parsed.bytes, n: over.rulesBeyond, line: over.line }));
    else out.push(pass(origin, { bytes: robots.parsed.bytes }));
  }
  return out.length > 0 ? out : [notApplicable("site", "No in-scope origin served a 2xx robots.txt.")];
};

export const robots03hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { origin, robots } of parsedOrigins(ctx)) {
    if (robots.parsed.bytes > 102_400) out.push(info(origin, "over_100kib", { origin, bytes: robots.parsed.bytes }));
  }
  return out;
};

export const robots04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const origin of ctx.inScopeOrigins) {
    const robots = ctx.robots(origin);
    if (robots.state === "missing") {
      out.push(notEvaluated(origin, "robots.txt was not fetched for this origin."));
    } else if (robots.state === "unavailable") {
      const status = statusOf(robots.exchange);
      const condition = status !== null ? "server_error" : "unreachable";
      out.push(fail(origin, condition, { origin, outcome: outcomeLabel(robots.exchange) }));
    } else {
      out.push(pass(origin, { outcome: robots.state === "parsed" ? `HTTP ${robots.exchange.status}` : outcomeLabel(robots.exchange) }));
    }
  }
  return out;
};

function disallowObserved(url: string, rule: RobotsRule, group: ReturnType<typeof groupLabel>, competing: RobotsRule | null) {
  return {
    url,
    rule: ruleText(rule),
    line: rule.line,
    group,
    competing_allow: competing ? `${ruleText(competing)} (line ${formatInt(competing.line)})` : "",
  };
}

export const robots05a: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.intended) {
    let failed = false;
    let unavailable = false;
    const engines: { engine: "google" | "bing"; chain: readonly string[]; condition: string }[] = [];
    if (ctx.engines.has("google")) engines.push({ engine: "google", chain: GOOGLEBOT_CHAIN, condition: "disallowed_googlebot" });
    if (ctx.engines.has("bing")) engines.push({ engine: "bing", chain: BINGBOT_CHAIN, condition: "disallowed_bingbot" });
    for (const { chain, condition } of engines) {
      const access = ctx.access(url, chain);
      if (access.kind === "unavailable" || access.kind === "missing") {
        unavailable = true;
        continue;
      }
      if (access.kind === "decided" && !access.decision.allowed && access.decision.rule) {
        failed = true;
        out.push(fail(url, condition, disallowObserved(url, access.decision.rule, groupLabel(access.decision.group), access.decision.competingAllow)));
      }
    }
    if (!failed) {
      if (unavailable) out.push(notEvaluated(url, "robots.txt for this origin is unavailable, so crawl access cannot be decided."));
      else out.push(pass(url));
    }
  }
  return out;
};

export const robots05b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const page = ctx.page(url)!;
    const resources = new Set<string>();
    for (const link of elements(page.parsed.document, "link")) {
      const rel = (attr(link, "rel") ?? "").toLowerCase().split(/\s+/);
      const href = attr(link, "href");
      if (rel.includes("stylesheet") && href) {
        const key = comparisonKey(href, page.base);
        if (key) resources.add(key);
      }
    }
    for (const script of elements(page.parsed.document, "script")) {
      const src = attr(script, "src");
      if (src) {
        const key = comparisonKey(src, page.base);
        if (key) resources.add(key);
      }
    }
    for (const image of page.images) if (image.key) resources.add(image.key);
    const considered = [...resources].filter((r) => ctx.config.check_third_party_resources || ctx.isInScope(r)).sort();
    let unavailable = false;
    const disallowed: { url: string; rule: string }[] = [];
    for (const resource of considered) {
      const access = ctx.access(resource, GOOGLEBOT_CHAIN);
      if (access.kind === "unavailable") unavailable = true;
      else if (access.kind === "decided" && !access.decision.allowed && access.decision.rule) {
        disallowed.push({ url: resource, rule: ruleText(access.decision.rule) });
      }
    }
    if (disallowed.length > 0) {
      out.push(fail(url, "resources_disallowed", { url, n: disallowed.length, example: disallowed[0]!.url, rule: disallowed[0]!.rule }));
    } else if (unavailable) {
      out.push(notEvaluated(url, "robots.txt for a resource origin is unavailable."));
    } else {
      out.push(pass(url, { resources: considered.length }));
    }
  }
  return out;
};

export const robots08: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { origin, robots } of parsedOrigins(ctx)) {
    if (robots.parsed.sitemaps.length === 0) continue;
    let failed = false;
    for (const line of robots.parsed.sitemaps) {
      const ok = hasScheme(line.value) && (() => { try { return new URL(line.value).host !== ""; } catch { return false; } })();
      if (!ok) {
        failed = true;
        out.push(fail(origin, "not_fully_qualified", { origin, line: line.line, value: line.value }));
      }
    }
    if (!failed) out.push(pass(origin, { sitemap_lines: robots.parsed.sitemaps.length }));
  }
  return out.length > 0 ? out : [notApplicable("site", "No in-scope robots.txt declares a Sitemap line.")];
};

export const robots09: RuleEvaluator = (ctx) => {
  if (ctx.config.staging_hosts.length === 0) return [notApplicable("site", "No staging hosts are configured.")];
  const out: UnitResult[] = [];
  for (const host of ctx.config.staging_hosts) {
    const candidates = [`https://${host}/`, `http://${host}/`];
    const probe = candidates.find((u) => ctx.primaryExchange(u)) ?? null;
    if (!probe) {
      out.push(notEvaluated(host, "The staging host was not fetched."));
      continue;
    }
    const chain = ctx.chain(probe);
    const final = chain.final;
    const status = statusOf(final);
    if (status === 401 || status === 403) {
      out.push(pass(host, { status }));
      continue;
    }
    if (final && new URL(chain.finalUrl).host !== host) {
      out.push(pass(host, { redirected_to: chain.finalUrl }));
      continue;
    }
    if (status === 200) {
      const page = ctx.page(probe);
      if (page?.directives.noindex) out.push(pass(host, { status, noindex: "true" }));
      else out.push(fail(host, "staging_public", { host, status }));
      continue;
    }
    out.push(notEvaluated(host, `The staging host answered ${final ? outcomeLabel(final) : "no final response"}.`));
  }
  return out;
};

export const robots01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const origin of [...new Set([...ctx.inScopeOrigins, ...ctx.variantOrigins])].sort()) {
    const robots = ctx.robots(origin);
    if (robots.state === "missing") continue;
    const exchange = robots.exchange;
    const status = statusOf(exchange);
    const parsed = robots.state === "parsed" ? robots.parsed : null;
    out.push(
      info(origin, "summary", {
        origin,
        outcome: exchange ? outcomeLabel(exchange) : "no response",
        bytes: parsed?.bytes ?? 0,
        hops: robots.hops,
        groups: parsed?.groups.length ?? 0,
        group_lines: parsed ? parsed.groups.map((g) => formatInt(g.line)).join(", ") || "none" : "none",
        sitemaps: parsed?.sitemaps.length ?? 0,
        interpretation_clause: status !== null && status >= 400 && status < 500 && status !== 429 ? " Google's crawlers treat all 4xx errors, except 429, as if a valid robots.txt file didn't exist" : "",
      }),
    );
  }
  return out;
};

export const robots07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { origin, robots } of parsedOrigins(ctx)) {
    const crawlers: { label: string; chain: readonly string[]; engine: "google" | "bing" }[] = [
      { label: "Googlebot", chain: GOOGLEBOT_CHAIN, engine: "google" },
      { label: "bingbot", chain: BINGBOT_CHAIN, engine: "bing" },
    ];
    const wildcard = selectGroups(robots.parsed, ["*"]);
    for (const crawler of crawlers) {
      if (!ctx.engines.has(crawler.engine)) continue;
      const selection = selectGroups(robots.parsed, crawler.chain);
      if (selection.token === null || selection.token === "*") continue;
      const selectedRules = new Set(selection.rules.map((r) => `${r.kind}:${r.pattern}`));
      const shadowed = wildcard.rules.filter((r) => !selectedRules.has(`${r.kind}:${r.pattern}`));
      if (shadowed.length === 0) continue;
      out.push(
        info(origin, "shadowed_rules", {
          token: selection.token,
          line: selection.groups[0]!.line,
          crawler: crawler.label,
          rules: shadowed.map((r) => `${ruleText(r)} (line ${formatInt(r.line)})`).join("; "),
        }),
      );
    }
  }
  return out;
};

export const robots10: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const { origin, robots } of parsedOrigins(ctx)) {
    const noindexLines = new Set(robots.parsed.noindexLines.map((l) => l.line));
    const ignored = robots.parsed.ignored.filter((l) => !noindexLines.has(l.line) && l.reason !== "beyond_limit");
    if (ignored.length === 0) continue;
    out.push(info(origin, "ignored_lines", { origin, n: ignored.length, lines: ignored.map((l) => `line ${formatInt(l.line)}: ${l.text} (${l.reason})`).join("; ") }));
  }
  return out;
};

export const ROBOTS_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-ROBOTS-02": robots02,
  "SEO-ROBOTS-03": robots03,
  "SEO-ROBOTS-03-HC": robots03hc,
  "SEO-ROBOTS-04": robots04,
  "SEO-ROBOTS-05A": robots05a,
  "SEO-ROBOTS-05B": robots05b,
  "SEO-ROBOTS-08": robots08,
  "SEO-ROBOTS-09": robots09,
  "SEO-ROBOTS-01": robots01,
  "SEO-ROBOTS-07": robots07,
  "SEO-ROBOTS-10": robots10,
};

void examples;
