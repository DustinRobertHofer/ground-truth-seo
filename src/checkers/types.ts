/**
 * The result of a focused check, sent to the browser. Every verdict in it
 * comes from the ruleset's own findings; the `details` block only lays out
 * what the snapshot contains so the page can show it.
 */

import type { FindingStatus } from "../scanner/report/types.js";
import type { RuleClass, Severity } from "../scanner/rules/types.js";
import type { CheckerSlug } from "./config.js";

export interface CheckCitation {
  source_id: string;
  section: string;
  quote: string | null;
  /** The registry title and URL of the source, so the page can link to it. */
  title: string;
  url: string | null;
  last_updated: string;
}

/** One (rule, condition) to act on, as the full report's recommendation states it. */
export interface CheckIssue {
  rule_id: string;
  rule_title: string;
  condition: string;
  /** `fix` for a failing rule, `add` for a documented practice not yet adopted (an opportunity). */
  kind: "fix" | "add";
  class: RuleClass;
  weight: number;
  severity: Severity;
  gate: string | null;
  action: string;
  reason: string;
  outcome: string;
  citations: CheckCitation[];
  /** Up to MAX_AFFECTED units, sorted. */
  affected: string[];
  affected_count: number;
}

/** An informational finding (class C4 or an info condition). Never a failure. */
export interface CheckObservation {
  rule_id: string;
  rule_title: string;
  condition: string | null;
  unit: string;
  text: string;
  citations: CheckCitation[];
}

export interface CheckRuleStatus {
  rule_id: string;
  title: string;
  class: RuleClass;
  weight: number;
  /** The rule has an opportunity condition, so it can report something to add. */
  hasOpportunity: boolean;
  counts: Partial<Record<FindingStatus, number>>;
  /** Why units were not evaluated or not applicable, with how many units each reason covers. */
  notes: { status: "not_evaluated" | "not_applicable"; text: string; units: number }[];
}

export type ReachStatus =
  /** Responses came back; the check ran. */
  | "ok"
  /** robots.txt did not answer usably, so the scanner assumed complete disallow (RFC 9309) and fetched nothing else. */
  | "robots_unavailable"
  /** The host did not resolve in DNS. */
  | "dns_error"
  /** The host resolves to a private, loopback or reserved address, which the scanner refuses. */
  | "blocked_address";

export interface CheckReach {
  status: ReachStatus;
  robotsUrl: string;
  /** `HTTP 200`, `a timeout` and so on (KNOWLEDGE.md §1.5), or "not fetched". */
  robotsOutcome: string;
  startOutcome: string;
  /** The start URL's final URL, when its chain ended. */
  startFinalUrl: string | null;
  startHops: number;
  pagesFetched: number;
  truncated: boolean;
}

export type GroupKind = "named" | "inherited" | "wildcard" | "none";

export interface CrawlerAccessRow {
  token: string;
  operator: string;
  purpose: string;
  robotsBehavior: string;
  sourceId: string;
  sourceUrl: string | null;
  userTriggered: boolean;
  role: CrawlerRole;
  /** Which robots.txt group the crawler follows: its own, one it inherits, the * group, or none. */
  group: { kind: GroupKind; token: string | null; lines: number[] };
  home: { url: string; outcome: "allowed" | "disallowed" | "unknown"; rule: string | null; line: number | null };
  /** Sampled intended URLs other than the home page. */
  sample: { allowed: number; disallowed: number; unknown: number };
}

export type CrawlerRole = "search" | "training" | "control" | "user" | "dataset";

export interface RobotsDetails {
  kind: "robots";
  url: string;
  state: "parsed" | "not_found" | "unavailable" | "missing";
  outcome: string;
  finalUrl: string | null;
  hops: number;
  contentType: string | null;
  bytes: number;
  /** The file as text, for display, capped at TEXT_CAP characters. */
  text: string | null;
  textTruncated: boolean;
  groups: { agents: string[]; line: number; rules: { kind: "allow" | "disallow"; pattern: string; line: number }[] }[];
  sitemaps: { value: string; line: number; fullyQualified: boolean }[];
  ignored: { line: number; text: string; reason: string }[];
  /** Search crawlers only; the AI crawler checker covers the rest. */
  crawlers: CrawlerAccessRow[];
  /** Intended URLs tested against the file (the home page and valid sitemap URLs). */
  intendedTested: number;
}

export interface SitemapFileDetails {
  url: string;
  foundBy: "robots" | "config" | "convention" | "index";
  parent: string | null;
  outcome: string;
  finalUrl: string | null;
  hops: number;
  contentType: string | null;
  format: "urlset" | "sitemapindex" | "feed" | "plain" | "invalid" | "unread";
  gzip: boolean;
  bytes: number;
  urls: number;
  children: number;
  valid: number;
  outOfScope: number;
  notAbsolute: number;
  lastmods: number;
  error: { message: string; line: number; column: number } | null;
}

export interface SitemapDetails {
  kind: "sitemaps";
  robotsUrl: string;
  robotsOutcome: string;
  declared: { value: string; line: number; fullyQualified: boolean }[];
  /** No Sitemap line was found, so /sitemap.xml was tried by convention; what it returned. */
  conventionOutcome: string | null;
  files: SitemapFileDetails[];
  /** Distinct valid, in-scope URLs listed across all files. */
  listed: number;
  /** Listed URLs this check loaded, with what they returned. */
  sampled: { url: string; outcome: string; finalUrl: string; redirects: boolean; canonical: string | null }[];
}

export interface CanonicalPageDetails {
  url: string;
  /** The URL the visitor entered (after redirects). */
  entered: boolean;
  canonicals: { href: string | null; resolved: string | null; inHead: boolean; line: number }[];
  headers: { raw: string; resolved: string | null }[];
  /** What the first head canonical says about this page. */
  relation: "self" | "other" | "none" | "body_only" | "empty";
  target: string | null;
  /** The target's first response and final outcome, when it was fetched. */
  targetFirst: string | null;
  targetFinal: string | null;
  targetFinalUrl: string | null;
  targetCanonical: string | null;
  /** The canonical uses a different scheme (http or https) than the page. */
  schemeDiffers: boolean;
}

export interface CanonicalDetails {
  kind: "canonical";
  preferredOrigin: string;
  pages: CanonicalPageDetails[];
  /** Fetched HTML pages beyond the ones listed. */
  more: number;
}

export interface LlmsDetails {
  kind: "llms";
  url: string;
  outcome: string;
  finalUrl: string | null;
  hops: number;
  contentType: string | null;
  bytes: number;
  /** A 200 response that is not an HTML page. */
  found: boolean;
  servedHtml: boolean;
  /** The scanner's own robots.txt rules kept it from requesting /llms.txt. */
  blockedForScanner: boolean;
  structure: {
    h1: string | null;
    summary: string | null;
    sections: { title: string; links: number }[];
    links: number;
    markdownLinks: number;
  } | null;
  /** Link targets that do not parse as URLs. */
  malformedLinks: string[];
  lines: number;
  excerpt: string | null;
  excerptTruncated: boolean;
}

export interface AiDetails {
  kind: "ai";
  robotsUrl: string;
  robotsOutcome: string;
  robotsState: "parsed" | "not_found" | "unavailable" | "missing";
  sampled: string[];
  crawlers: CrawlerAccessRow[];
  notes: string[];
}

export interface MetaPageDetails {
  url: string;
  entered: boolean;
  descriptions: { content: string; length: number; line: number; inHead: boolean }[];
  /** Other listed pages whose first description is the same after normalization and case folding. */
  duplicates: string[];
  /** nosnippet or max-snippet from robots meta and X-Robots-Tag. */
  snippetControls: string[];
}

export interface MetaDetails {
  kind: "meta";
  pages: MetaPageDetails[];
  more: number;
  /** Loaded pages left out because they are not intended for indexing (noindex, or blocked for a search crawler), as in the full audit. */
  excluded: number;
}

/** One response in a redirect chain, first to last. */
export interface RedirectHop {
  url: string;
  outcome: string;
  /** Where a redirect points, resolved against the request URL; null for a final response. */
  next: string | null;
}

export interface RedirectChainDetails {
  url: string;
  entered: boolean;
  hops: RedirectHop[];
  /** Redirects followed (KNOWLEDGE.md §3.12). */
  redirects: number;
  /** The URL the chain ends at, when it ends in a response. */
  finalUrl: string | null;
  /** The final response, or why the chain did not end ("a redirect loop", "more than 10 redirects", "not fetched"). */
  finalOutcome: string;
}

export interface RedirectDetails {
  kind: "redirects";
  preferredOrigin: string;
  /** The URL the visitor entered, followed hop by hop. */
  entered: RedirectChainDetails;
  /** Requests to the other http/https and www/non-www origins of the host that resolve in DNS. */
  variants: RedirectChainDetails[];
  /** Other URLs seen answering with a redirect: internal links, canonical and redirect targets, robots.txt. */
  redirecting: RedirectChainDetails[];
  more: number;
}

export interface CrawlerVerdict {
  outcome: "allowed" | "disallowed" | "unknown";
  rule: string | null;
  line: number | null;
}

export interface IndexPageDetails {
  url: string;
  entered: boolean;
  outcome: string;
  /** How the URL entered the intended set (PRODUCT.md §7.4), or null when it is not in it. */
  intent: string | null;
  googlebot: CrawlerVerdict;
  bingbot: CrawlerVerdict;
  /** Each robots meta tag and X-Robots-Tag header, as served. */
  directives: { source: string; value: string; appliesToGoogle: boolean }[];
  /** The effective Google rules after combining them (KNOWLEDGE.md §3.7), or null without a final 200. */
  effective: string | null;
  noindex: boolean;
  /** The first head canonical, when it names another URL. */
  canonical: string | null;
}

export interface IndexDetails {
  kind: "indexing";
  robotsUrl: string;
  robotsOutcome: string;
  /** A sitemap was found, so the pages it lists state what the site wants indexed. */
  sitemapFound: boolean;
  /** Intended URLs, mostly from sitemaps, tested against robots.txt. */
  intended: number;
  pages: IndexPageDetails[];
  more: number;
}

export interface HreflangAlternateDetails {
  code: string;
  href: string;
  url: string | null;
  method: "html" | "header" | "sitemap";
  inHead: boolean;
  self: boolean;
  /** What the alternate returned, or null when it was not requested. */
  outcome: string | null;
  /** Whether the alternate's own annotations name this page; null when it did not answer 200 HTML. */
  linksBack: boolean | null;
}

export interface HreflangPageDetails {
  url: string;
  entered: boolean;
  alternates: HreflangAlternateDetails[];
  canonical: string | null;
}

export interface HreflangDetails {
  kind: "hreflang";
  pages: HreflangPageDetails[];
  /** Loaded pages that carry no hreflang annotation. */
  without: number;
  more: number;
}

export interface TitlePageDetails {
  url: string;
  entered: boolean;
  titles: { text: string; length: number; line: number; inHead: boolean }[];
  /** Other listed pages whose head title is the same after normalization and case folding. */
  duplicates: string[];
  h1Count: number;
  firstH1: string | null;
}

export interface TitleDetails {
  kind: "titles";
  pages: TitlePageDetails[];
  more: number;
  /** Loaded pages left out because they are not intended for indexing, as in the full audit. */
  excluded: number;
}

export type CheckDetails =
  | RobotsDetails
  | SitemapDetails
  | CanonicalDetails
  | LlmsDetails
  | AiDetails
  | MetaDetails
  | RedirectDetails
  | IndexDetails
  | HreflangDetails
  | TitleDetails;

export interface CheckResult {
  version: 1;
  checker: CheckerSlug;
  startUrl: string;
  origin: string;
  completedAt: string;
  rulesetVersion: string;
  snapshotId: string;
  reach: CheckReach;
  /** Distinct failing (rule, condition) pairs: things to fix. */
  issueCount: number;
  /** Distinct (rule, condition) pairs for practices not yet adopted: things to add. */
  opportunityCount: number;
  /** Distinct URLs, files or origins with at least one thing to fix or add. */
  affectedCount: number;
  rules: CheckRuleStatus[];
  issues: CheckIssue[];
  observations: CheckObservation[];
  details: CheckDetails;
}

export type CheckOutcome = { ok: true; result: CheckResult } | { ok: false; error: string; reason: CheckFailure };

export type CheckFailure = "invalid_url" | "unreachable" | "blocked_address" | "timeout" | "scan_error" | "connection";

/** Frames of the /api/check event stream. */
export type CheckStreamEvent =
  | { type: "progress"; message: string }
  | { type: "result"; result: CheckResult }
  | { type: "error"; message: string; reason: CheckFailure };
