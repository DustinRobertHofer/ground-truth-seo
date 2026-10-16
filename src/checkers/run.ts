/**
 * Builds a focused check's result from a snapshot (PRODUCT.md §19). A pure
 * function of (checker, snapshot, config): it runs the full evaluator, keeps the
 * findings of the checker's rules, and lays out what the snapshot holds for the
 * page to display. It never decides on its own that something is a problem.
 */

import { llmsLinkTargets, llmsTxt } from "../content-review/extract.js";
import { configHash, type ScanConfig, type ScanConfigInput } from "../scanner/config.js";
import { BINGBOT_CHAIN, EvaluationContext, GOOGLEBOT_CHAIN } from "../scanner/evaluate/context.js";
import { describeSource } from "../scanner/evaluate/core/directives.js";
import { attr, isInHead, lineOf, metaByName, text as elementText } from "../scanner/evaluate/core/html.js";
import { selectGroups } from "../scanner/evaluate/core/robots-txt.js";
import { compareBytes, normalizeText, sortBytes } from "../scanner/evaluate/core/text.js";
import { comparisonKey, homePageOf } from "../scanner/evaluate/core/url.js";
import { evaluateRuns, SCANNER_VERSION } from "../scanner/evaluate/index.js";
import { accessCell, accessMatrixRow, accessMatrixSample } from "../scanner/evaluate/rules/ai.js";
import { descriptionGroups, headTitles, titleGroups } from "../scanner/evaluate/rules/head.js";
import { statusOf } from "../scanner/evaluate/rules/helpers.js";
import { annotationKeys } from "../scanner/evaluate/rules/i18n.js";
import { directiveList, directivesOf } from "../scanner/evaluate/rules/indexing.js";
import { headings } from "../scanner/evaluate/rules/links.js";
import { redirectUnits } from "../scanner/evaluate/rules/redirects.js";
import { buildReport } from "../scanner/report/build.js";
import type { CitationOut, Finding, Recommendation, Report } from "../scanner/report/types.js";
import { ACCESS_MATRIX_NOTES, CRAWLERS, RULES_BY_ID, RULESET_VERSION, SOURCES_BY_ID, type CrawlerRef } from "../scanner/rules/index.js";
import { header, outcomeLabel } from "../scanner/snapshot/access.js";
import type { Exchange, Snapshot } from "../scanner/snapshot/types.js";
import type { CheckerConfig } from "./config.js";
import { CRAWLER_ROLES, SEARCH_CRAWLER_TOKENS } from "./crawler-roles.js";
import type {
  AiDetails,
  CanonicalDetails,
  CanonicalPageDetails,
  CheckCitation,
  CheckDetails,
  CheckIssue,
  CheckObservation,
  CheckReach,
  CheckResult,
  CheckRuleStatus,
  CrawlerAccessRow,
  CrawlerVerdict,
  HreflangDetails,
  IndexDetails,
  IndexPageDetails,
  LlmsDetails,
  MetaDetails,
  RedirectChainDetails,
  RedirectDetails,
  RobotsDetails,
  SitemapDetails,
  TitleDetails,
} from "./types.js";

/** Affected units listed per issue; the count is always complete. */
export const MAX_AFFECTED = 50;
/** Pages listed in the canonical and meta description tables. */
export const MAX_PAGES_LISTED = 20;
const MAX_OBSERVATIONS = 60;
const TEXT_CAP = 40_000;
const LLMS_EXCERPT_CAP = 6_000;
/** Info findings the details table already shows, one row per unit. */
const SHOWN_IN_DETAILS = new Set(["SEO-AI-02", "SEO-CANON-03", "SEO-HDG-01"]);

/** The scan configuration for one check: the checker's crawl bounds, nothing optional switched on. */
export function checkerInput(checker: CheckerConfig, startUrl: string): ScanConfigInput {
  return {
    start_url: startUrl,
    max_pages: checker.limits.max_pages,
    max_depth: checker.limits.max_depth,
    max_extra_fetches: checker.limits.max_extra_fetches,
    max_images_per_page: 0,
    render: false,
    crux: false,
    parity_check: false,
  };
}

export function buildCheckResult(checker: CheckerConfig, snapshot: Snapshot, config: ScanConfig): CheckResult {
  const { ctx, runs } = evaluateRuns(snapshot, config);
  const report = buildReport(ctx, runs, { scannerVersion: SCANNER_VERSION, rulesetVersion: RULESET_VERSION, configHash: configHash(config) });
  const wanted = new Set(checker.ruleIds);
  const findings = report.findings.filter((f) => wanted.has(f.rule_id));
  const recommendations = report.recommendations.filter((r) => wanted.has(r.rule_id));
  const affected = new Set(recommendations.flatMap((r) => r.affected_units));

  return {
    version: 1,
    checker: checker.slug,
    startUrl: snapshot.start_url,
    origin: ctx.preferredOrigin,
    completedAt: snapshot.completed_at,
    rulesetVersion: report.meta.ruleset_version,
    snapshotId: snapshot.snapshot_id,
    reach: reachOf(ctx, snapshot),
    issueCount: recommendations.filter((r) => r.kind === "fix").length,
    opportunityCount: recommendations.filter((r) => r.kind === "add").length,
    affectedCount: affected.size,
    rules: checker.ruleIds.map((id) => ruleStatus(id, findings)),
    issues: recommendations.map(issueOf),
    observations: findings
      .filter((f) => f.status === "info" && !SHOWN_IN_DETAILS.has(f.rule_id))
      .slice(0, MAX_OBSERVATIONS)
      .map(observationOf),
    details: detailsOf(checker, ctx, report),
  };
}

// ---------------------------------------------------------------- findings

function citationOf(c: CitationOut): CheckCitation {
  const source = SOURCES_BY_ID.get(c.source_id);
  return { source_id: c.source_id, section: c.section, quote: c.quote, title: source?.title ?? c.source_id, url: source?.url ?? null, last_updated: c.source_last_updated };
}

function titleOf(ruleId: string): string {
  return RULES_BY_ID.get(ruleId)?.title ?? ruleId;
}

function issueOf(r: Recommendation): CheckIssue {
  return {
    rule_id: r.rule_id,
    rule_title: titleOf(r.rule_id),
    condition: r.condition,
    kind: r.kind,
    class: r.class,
    weight: r.weight,
    severity: r.severity,
    gate: r.gate,
    action: r.action,
    reason: r.reason,
    outcome: r.outcome,
    citations: r.citations.map(citationOf),
    affected: r.affected_units.slice(0, MAX_AFFECTED),
    affected_count: r.affected_count,
  };
}

function observationOf(f: Finding): CheckObservation {
  return { rule_id: f.rule_id, rule_title: titleOf(f.rule_id), condition: f.condition, unit: f.unit, text: f.reason ?? "", citations: f.citations.map(citationOf) };
}

function ruleStatus(ruleId: string, findings: Finding[]): CheckRuleStatus {
  const rule = RULES_BY_ID.get(ruleId);
  if (!rule) throw new Error(`checker lists unknown rule ${ruleId}`);
  const own = findings.filter((f) => f.rule_id === ruleId);
  const counts: CheckRuleStatus["counts"] = {};
  const notes = new Map<string, CheckRuleStatus["notes"][number]>();
  for (const f of own) {
    counts[f.status] = (counts[f.status] ?? 0) + 1;
    if ((f.status === "not_evaluated" || f.status === "not_applicable") && f.reason) {
      const key = `${f.status}\u0000${f.reason}`;
      const note = notes.get(key);
      if (note) note.units += 1;
      else notes.set(key, { status: f.status, text: f.reason, units: 1 });
    }
  }
  return {
    rule_id: rule.id,
    title: rule.title,
    class: rule.class,
    weight: rule.weight,
    hasOpportunity: rule.conditions.some((c) => c.opportunity === true),
    counts,
    notes: [...notes.values()],
  };
}

// ------------------------------------------------------------------- reach

function lastOf(exchanges: Exchange[]): Exchange | null {
  return exchanges[exchanges.length - 1] ?? null;
}

/** Whether the site answered, and what robots.txt and the start URL returned. Shared with the security checker. */
export function reachOf(ctx: EvaluationContext, snapshot: Snapshot): CheckReach {
  const robotsUrl = `${ctx.preferredOrigin}/robots.txt`;
  const robots = ctx.robots(ctx.preferredOrigin);
  const robotsExchange = robots.state === "missing" ? null : robots.exchange;
  const startChain = ctx.chain(comparisonKey(snapshot.start_url) ?? snapshot.start_url);
  const startLast = startChain.final ?? lastOf(startChain.exchanges);
  const failed = [robotsExchange, startLast].find((e) => e !== null && e.outcome !== "response" && e.outcome !== "blocked_by_robots_policy") ?? null;
  let status: CheckReach["status"] = "ok";
  if (failed?.error_code === "address_blocked") status = "blocked_address";
  else if (failed?.outcome === "dns_error") status = "dns_error";
  else if (robots.state === "unavailable") status = "robots_unavailable";
  return {
    status,
    robotsUrl,
    robotsOutcome: robots.state === "missing" ? "not fetched" : outcomeLabel(robotsExchange),
    startOutcome: startLast ? outcomeLabel(startLast) : "not fetched",
    startFinalUrl: startChain.final ? startChain.finalUrl : null,
    startHops: startChain.hops,
    pagesFetched: ctx.fetchedPages.length,
    truncated: snapshot.truncated,
  };
}

// ----------------------------------------------------------------- details

function detailsOf(checker: CheckerConfig, ctx: EvaluationContext, report: Report): CheckDetails {
  switch (checker.slug) {
    case "robots-txt-checker":
      return robotsDetails(ctx, report);
    case "sitemap-checker":
      return sitemapDetails(ctx, report);
    case "canonical-checker":
      return canonicalDetails(ctx);
    case "llms-txt-checker":
      return llmsDetails(ctx);
    case "ai-crawler-checker":
      return aiDetails(ctx);
    case "meta-description-checker":
      return metaDetails(ctx);
    case "redirect-checker":
      return redirectDetails(ctx);
    case "noindex-checker":
      return indexDetails(ctx);
    case "hreflang-checker":
      return hreflangDetails(ctx);
    case "title-tag-checker":
      return titleDetails(ctx);
  }
}

function decode(bytes: Uint8Array | null): string {
  return bytes ? new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "") : "";
}

function sizeOf(ctx: EvaluationContext, exchange: Exchange | null): number {
  if (!exchange) return 0;
  return exchange.size_uncompressed ?? ctx.body(exchange)?.length ?? 0;
}

/** Robots.txt Sitemap lines, marked by SEO-ROBOTS-08's verdict on each line. */
function sitemapLines(ctx: EvaluationContext, report: Report): RobotsDetails["sitemaps"] {
  const robots = ctx.robots(ctx.preferredOrigin);
  if (robots.state !== "parsed") return [];
  const failing = new Set(
    report.findings
      .filter((f) => f.rule_id === "SEO-ROBOTS-08" && f.status === "fail" && f.unit === ctx.preferredOrigin)
      .map((f) => Number(f.observed.line)),
  );
  return robots.parsed.sitemaps.map((s) => ({ value: s.value, line: s.line, fullyQualified: !failing.has(s.line) }));
}

function crawlerRow(ctx: EvaluationContext, crawler: CrawlerRef): CrawlerAccessRow {
  const cells = accessMatrixRow(ctx, crawler.token);
  const [home, ...rest] = cells;
  const robots = ctx.robots(ctx.preferredOrigin);
  let group: CrawlerAccessRow["group"] = { kind: "none", token: null, lines: [] };
  if (robots.state === "parsed") {
    const selection = selectGroups(robots.parsed, crawler.chain);
    const kind = selection.token === null ? "none" : selection.token === "*" ? "wildcard" : selection.token === crawler.chain[0] ? "named" : "inherited";
    group = { kind, token: selection.token, lines: selection.groups.map((g) => g.line) };
  }
  return {
    token: crawler.token,
    operator: crawler.operator,
    purpose: crawler.purpose,
    robotsBehavior: crawler.robotsBehavior,
    sourceId: crawler.source_id,
    sourceUrl: SOURCES_BY_ID.get(crawler.source_id)?.url ?? null,
    userTriggered: crawler.userTriggered,
    role: CRAWLER_ROLES[crawler.token] ?? "search",
    group,
    home: { url: home!.url, outcome: home!.outcome, rule: home!.rule, line: home!.line },
    sample: {
      allowed: rest.filter((c) => c.outcome === "allowed").length,
      disallowed: rest.filter((c) => c.outcome === "disallowed").length,
      unknown: rest.filter((c) => c.outcome === "unknown").length,
    },
  };
}

function robotsDetails(ctx: EvaluationContext, report: Report): RobotsDetails {
  const url = `${ctx.preferredOrigin}/robots.txt`;
  const robots = ctx.robots(ctx.preferredOrigin);
  const chain = ctx.chain(url);
  const exchange = robots.state === "missing" ? null : robots.exchange;
  const parsed = robots.state === "parsed" ? robots.parsed : null;
  const text = parsed ? decode(ctx.body(exchange)) : null;
  return {
    kind: "robots",
    url,
    state: robots.state,
    outcome: robots.state === "missing" ? "not fetched" : outcomeLabel(exchange),
    finalUrl: chain.final ? chain.finalUrl : null,
    hops: chain.hops,
    contentType: header(exchange, "content-type"),
    bytes: parsed ? parsed.bytes : sizeOf(ctx, exchange),
    text: text === null ? null : text.slice(0, TEXT_CAP),
    textTruncated: text !== null && text.length > TEXT_CAP,
    groups: (parsed?.groups ?? []).map((g) => ({ agents: g.agents.map((a) => a.value), line: g.line, rules: g.rules.map((r) => ({ kind: r.kind, pattern: r.pattern, line: r.line })) })),
    sitemaps: sitemapLines(ctx, report),
    ignored: (parsed?.ignored ?? []).map((l) => ({ line: l.line, text: l.text, reason: l.reason })),
    crawlers: SEARCH_CRAWLER_TOKENS.map((token) => crawlerRow(ctx, CRAWLERS.find((c) => c.token === token)!)),
    intendedTested: ctx.intended.length,
  };
}

function sitemapDetails(ctx: EvaluationContext, report: Report): SitemapDetails {
  const origin = ctx.preferredOrigin;
  const declared = sitemapLines(ctx, report);
  const conventionUrl = `${origin}/sitemap.xml`;
  const conventionTried = declared.length === 0 && ctx.primaryExchange(conventionUrl) !== null;
  const conventionChain = ctx.chain(conventionUrl);
  const robots = ctx.robots(origin);
  const files = ctx.sitemaps.map((file) => {
    const final = file.chain.final;
    const parsed = file.parsed;
    return {
      url: file.url,
      foundBy: file.foundBy,
      parent: file.parent,
      outcome: final ? outcomeLabel(final) : file.chain.problem === "loop" ? "a redirect loop" : outcomeLabel(lastOf(file.chain.exchanges)),
      finalUrl: final ? file.chain.finalUrl : null,
      hops: file.chain.hops,
      contentType: header(final, "content-type"),
      format: parsed ? parsed.kind : ("unread" as const),
      gzip: parsed?.gzip ?? false,
      bytes: parsed?.uncompressedBytes ?? sizeOf(ctx, final),
      urls: parsed && parsed.kind !== "sitemapindex" ? parsed.entries.length : 0,
      children: parsed?.children.length ?? 0,
      valid: file.validLocs.length,
      outOfScope: file.outOfScope.length,
      notAbsolute: file.notAbsolute.length,
      lastmods: parsed ? parsed.entries.filter((e) => e.lastmod !== null).length + parsed.children.filter((c) => c.lastmod !== null).length : 0,
      error: parsed?.error ?? null,
    };
  });
  const listed = sortBytes(new Set(ctx.sitemaps.flatMap((f) => f.validLocs).filter((loc) => ctx.isInScope(loc))));
  const sampled = listed
    .filter((loc) => ctx.wasFetched(loc))
    .map((loc) => {
      const chain = ctx.chain(loc);
      return {
        url: loc,
        outcome: chain.final ? outcomeLabel(chain.final) : chain.problem === "loop" ? "a redirect loop" : outcomeLabel(lastOf(chain.exchanges)),
        finalUrl: chain.finalUrl,
        redirects: ctx.redirects(loc),
        canonical: ctx.headCanonicalOf(loc),
      };
    });
  return {
    kind: "sitemaps",
    robotsUrl: `${origin}/robots.txt`,
    robotsOutcome: robots.state === "missing" ? "not fetched" : outcomeLabel(robots.exchange),
    declared,
    conventionOutcome: conventionTried ? (conventionChain.final ? outcomeLabel(conventionChain.final) : outcomeLabel(lastOf(conventionChain.exchanges))) : null,
    files,
    listed: listed.length,
    sampled,
  };
}

/** The entered page first, then the home page, then the rest in byte order. */
function orderPages(ctx: EvaluationContext, urls: string[]): string[] {
  const entered = ctx.snapshot.start_final_url;
  const home = homePageOf(ctx.preferredOrigin);
  const rank = (url: string) => (url === entered ? 0 : url === home ? 1 : 2);
  return [...urls].sort((a, b) => rank(a) - rank(b) || compareBytes(a, b));
}

function canonicalDetails(ctx: EvaluationContext): CanonicalDetails {
  const urls = orderPages(ctx, ctx.fetchedPages.filter((url) => !ctx.redirects(url)));
  const pages = urls.slice(0, MAX_PAGES_LISTED).map((url): CanonicalPageDetails => {
    const page = ctx.page(url)!;
    const first = page.headCanonicals[0];
    let relation: CanonicalPageDetails["relation"] = "none";
    if (page.canonicals.length > 0 && !first) relation = "body_only";
    else if (first && (first.rawHref === null || first.rawHref.trim() === "")) relation = "empty";
    else if (first) relation = first.key === url ? "self" : "other";
    const target = relation === "other" ? first!.key : null;
    const chain = target ? ctx.chain(target) : null;
    const fetched = chain !== null && chain.exchanges.length > 0;
    let schemeDiffers = false;
    if (first?.key) schemeDiffers = new URL(first.key).protocol !== new URL(url).protocol;
    return {
      url,
      entered: url === ctx.snapshot.start_final_url,
      canonicals: page.canonicals.map((c) => ({ href: c.rawHref, resolved: c.key, inHead: c.inHead, line: c.line })),
      headers: page.headerCanonicals.map((h) => ({ raw: h.raw, resolved: h.key })),
      relation,
      target,
      targetFirst: fetched ? outcomeLabel(chain!.exchanges[0]!) : null,
      targetFinal: fetched ? (chain!.final ? outcomeLabel(chain!.final) : chain!.problem === "loop" ? "a redirect loop" : outcomeLabel(lastOf(chain!.exchanges))) : null,
      targetFinalUrl: fetched && chain!.final ? chain!.finalUrl : null,
      targetCanonical: fetched && target ? ctx.headCanonicalOf(target) : null,
      schemeDiffers,
    };
  });
  return { kind: "canonical", preferredOrigin: ctx.preferredOrigin, pages, more: Math.max(0, urls.length - pages.length) };
}

function llmsDetails(ctx: EvaluationContext): LlmsDetails {
  const content = llmsTxt(ctx);
  const chain = ctx.chain(content.url);
  const last = chain.final ?? lastOf(chain.exchanges);
  const text = content.text;
  const malformed = text === null ? [] : llmsLinkTargets(text).filter((target) => {
    try {
      new URL(target, content.url);
      return false;
    } catch {
      return true;
    }
  });
  return {
    kind: "llms",
    url: content.url,
    outcome: content.outcome,
    finalUrl: chain.final ? chain.finalUrl : null,
    hops: chain.hops,
    contentType: header(chain.final, "content-type"),
    bytes: sizeOf(ctx, chain.final),
    found: content.found,
    servedHtml: content.servedHtml,
    blockedForScanner: last?.outcome === "blocked_by_robots_policy",
    structure: content.structure,
    malformedLinks: [...new Set(malformed)].slice(0, 20),
    lines: text === null ? 0 : text.split(/\r\n|\r|\n/).length,
    excerpt: text === null ? null : text.slice(0, LLMS_EXCERPT_CAP),
    excerptTruncated: text !== null && (text.length > LLMS_EXCERPT_CAP || content.truncated),
  };
}

function aiDetails(ctx: EvaluationContext): AiDetails {
  const robots = ctx.robots(ctx.preferredOrigin);
  return {
    kind: "ai",
    robotsUrl: `${ctx.preferredOrigin}/robots.txt`,
    robotsOutcome: robots.state === "missing" ? "not fetched" : outcomeLabel(robots.exchange),
    robotsState: robots.state,
    sampled: accessMatrixSample(ctx),
    crawlers: CRAWLERS.map((crawler) => crawlerRow(ctx, crawler)),
    notes: ACCESS_MATRIX_NOTES,
  };
}

function metaDetails(ctx: EvaluationContext): MetaDetails {
  const { groupOf } = descriptionGroups(ctx);
  const urls = orderPages(ctx, ctx.pages);
  const pages = urls.slice(0, MAX_PAGES_LISTED).map((url) => {
    const page = ctx.page(url)!;
    const d = page.directives;
    const snippetControls: string[] = [];
    if (d.nosnippet) snippetControls.push(d.maxSnippet === 0 ? "max-snippet:0" : "nosnippet");
    else if (d.maxSnippet !== null && d.maxSnippet > 0) snippetControls.push(`max-snippet:${d.maxSnippet}`);
    return {
      url,
      entered: url === ctx.snapshot.start_final_url,
      descriptions: metaByName(page.parsed, "description").map((el) => {
        const content = normalizeText(attr(el, "content") ?? "");
        return { content, length: [...content].length, line: lineOf(el), inHead: isInHead(page.parsed, el) };
      }),
      duplicates: groupOf(url).filter((other) => other !== url),
      snippetControls,
    };
  });
  const listed = new Set(ctx.pages);
  const excluded = ctx.fetchedPages.filter((url) => !ctx.redirects(url) && !listed.has(url)).length;
  return { kind: "meta", pages, more: Math.max(0, urls.length - pages.length), excluded };
}

/** What a chain ended with, or why it did not end. */
function finalOutcomeOf(chain: ReturnType<EvaluationContext["chain"]>): string {
  if (chain.final) return outcomeLabel(chain.final);
  if (chain.problem === "loop") return "a redirect loop";
  if (chain.problem === "too_many_hops") return "more than 10 redirects";
  return chain.exchanges.length > 0 ? "not fetched within this check's limit" : "not fetched";
}

function chainDetails(ctx: EvaluationContext, url: string, entered = false): RedirectChainDetails {
  const chain = ctx.chain(url);
  return {
    url,
    entered,
    hops: chain.exchanges.map((e) => {
      const location = header(e, "location");
      const redirect = e.outcome === "response" && e.status !== null && e.status >= 300 && e.status < 400 && location !== null;
      return { url: comparisonKey(e.request.url) ?? e.request.url, outcome: outcomeLabel(e), next: redirect ? (comparisonKey(location, e.request.url) ?? location) : null };
    }),
    redirects: chain.hops,
    finalUrl: chain.final ? chain.finalUrl : null,
    finalOutcome: finalOutcomeOf(chain),
  };
}

/** The variant probes SEO-URL-01 judges: each resolving variant's home page, then its sample path. */
function variantProbes(ctx: EvaluationContext): string[] {
  const out: string[] = [];
  for (const origin of ctx.variantOrigins) {
    const home = `${origin}/`;
    if (ctx.exchangesFor(home).length === 0) continue;
    out.push(home);
    out.push(...ctx.allRequestedUrls().filter((u) => u.startsWith(home) && u !== home && ctx.primaryExchange(u)?.purpose === "variant_sample"));
  }
  return out;
}

function redirectDetails(ctx: EvaluationContext): RedirectDetails {
  const startKey = comparisonKey(ctx.snapshot.start_url) ?? ctx.snapshot.start_url;
  const entered = chainDetails(ctx, startKey, true);
  const onEnteredChain = new Set(entered.hops.map((h) => h.url));
  const others = redirectUnits(ctx).filter((u) => !onEnteredChain.has(u));
  return {
    kind: "redirects",
    preferredOrigin: ctx.preferredOrigin,
    entered,
    variants: variantProbes(ctx).map((u) => chainDetails(ctx, u)),
    redirecting: others.slice(0, MAX_PAGES_LISTED).map((u) => chainDetails(ctx, u)),
    more: Math.max(0, others.length - MAX_PAGES_LISTED),
  };
}

function verdictOf(ctx: EvaluationContext, url: string, chain: readonly string[]): CrawlerVerdict {
  const { outcome, rule, line } = accessCell(ctx, url, chain);
  return { outcome, rule, line };
}

function indexDetails(ctx: EvaluationContext): IndexDetails {
  const robots = ctx.robots(ctx.preferredOrigin);
  const intended = new Set(ctx.intended);
  const crawled = sortBytes(new Set(ctx.snapshot.crawl.flatMap((c) => {
    const key = comparisonKey(c.url);
    return key && ctx.isInScope(key) && !ctx.redirects(key) ? [key] : [];
  })));
  const urls = orderPages(ctx, crawled);
  const pages = urls.slice(0, MAX_PAGES_LISTED).map((url): IndexPageDetails => {
    const chain = ctx.chain(url);
    const directives = directivesOf(ctx, url);
    const canonical = ctx.page(url) ? ctx.headCanonicalOf(url) : null;
    return {
      url,
      entered: url === ctx.snapshot.start_final_url,
      outcome: finalOutcomeOf(chain),
      intent: intended.has(url) ? (ctx.intentSource.get(url) ?? null) : null,
      googlebot: verdictOf(ctx, url, GOOGLEBOT_CHAIN),
      bingbot: verdictOf(ctx, url, BINGBOT_CHAIN),
      directives: (directives?.inputs ?? []).map((input) => ({
        source: describeSource(input.source),
        value: input.source.kind === "meta" ? input.source.content : input.source.value,
        appliesToGoogle: input.appliesToGoogle,
      })),
      effective: directives ? directiveList(directives) : null,
      noindex: directives?.noindex ?? false,
      canonical: canonical !== null && canonical !== url ? canonical : null,
    };
  });
  return {
    kind: "indexing",
    robotsUrl: `${ctx.preferredOrigin}/robots.txt`,
    robotsOutcome: robots.state === "missing" ? "not fetched" : outcomeLabel(robots.exchange),
    sitemapFound: ctx.sitemapFound,
    intended: ctx.intended.length,
    pages,
    more: Math.max(0, urls.length - pages.length),
  };
}

function hreflangDetails(ctx: EvaluationContext): HreflangDetails {
  const entered = ctx.snapshot.start_final_url;
  const annotated = ctx.pages.filter((url) => ctx.page(url)!.hreflangs.length > 0);
  const listed = entered !== null && ctx.pages.includes(entered) && !annotated.includes(entered) ? [...annotated, entered] : annotated;
  const urls = orderPages(ctx, listed);
  const pages = urls.slice(0, MAX_PAGES_LISTED).map((url) => {
    const page = ctx.page(url)!;
    const canonical = ctx.headCanonicalOf(url);
    return {
      url,
      entered: url === entered,
      canonical: canonical !== null && canonical !== url ? canonical : null,
      alternates: page.hreflangs.map((h) => {
        const self = h.key === url;
        let outcome: string | null = null;
        let linksBack: boolean | null = null;
        if (!self && h.key) {
          const chain = ctx.chain(h.key);
          if (chain.exchanges.length > 0) outcome = finalOutcomeOf(chain);
          const target = ctx.page(h.key);
          if (target && statusOf(target.exchange) === 200) linksBack = annotationKeys(target).has(url);
        }
        return { code: h.hreflang, href: h.rawHref, url: h.key, method: h.method, inHead: h.inHead, self, outcome, linksBack };
      }),
    };
  });
  return { kind: "hreflang", pages, without: ctx.pages.length - annotated.length, more: Math.max(0, urls.length - pages.length) };
}

function titleDetails(ctx: EvaluationContext): TitleDetails {
  const { groupOf } = titleGroups(ctx);
  const urls = orderPages(ctx, ctx.pages);
  const pages = urls.slice(0, MAX_PAGES_LISTED).map((url) => {
    const page = ctx.page(url)!;
    const { head, body } = headTitles(page);
    const h1s = headings(ctx, url).filter((h) => h.level === 1);
    return {
      url,
      entered: url === ctx.snapshot.start_final_url,
      titles: [...head, ...body].map((el) => {
        const text = elementText(el);
        return { text, length: [...text].length, line: lineOf(el), inHead: isInHead(page.parsed, el) };
      }),
      duplicates: groupOf(url).filter((other) => other !== url),
      h1Count: h1s.length,
      firstH1: h1s[0] ? elementText(h1s[0].element) : null,
    };
  });
  const listed = new Set(ctx.pages);
  const excluded = ctx.fetchedPages.filter((url) => !ctx.redirects(url) && !listed.has(url)).length;
  return { kind: "titles", pages, more: Math.max(0, urls.length - pages.length), excluded };
}
