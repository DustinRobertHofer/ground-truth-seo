/**
 * The evaluation context: everything rules read, derived once from the
 * snapshot and the configuration. Pure: no network, clock, randomness or
 * locale.
 */

import type { ScanConfig } from "../config.js";
import { CRAWLERS } from "../rules/crawlers.js";
import type { Engine } from "../rules/types.js";
import { bodyOf, header, headers, isHtmlMediaType } from "../snapshot/access.js";
import type { Exchange, Snapshot } from "../snapshot/types.js";
import { parseCompletedAt } from "./core/dates.js";
import { effectiveGoogleDirectives, bingDirectiveTokens, type EffectiveDirectives } from "./core/directives.js";
import {
  attr,
  baseUrl,
  elements,
  isInHead,
  lineOf,
  parseHtml,
  relTokens,
  text as elementText,
  type Element,
  type ParsedHtml,
} from "./core/html.js";
import { decideAccess, parseRobotsTxt, type AccessDecision, type ParsedRobots } from "./core/robots-txt.js";
import { parseSitemap, type ParsedSitemap } from "./core/sitemap.js";
import { compareBytes, sortBytes } from "./core/text.js";
import { comparisonKey, directoryOf, homePageOf, keyOfUrl, matchesPathGlob, originOf, pathAndQuery } from "./core/url.js";

export interface Chain {
  requested: string;
  /** Every exchange in the chain, first to last. */
  exchanges: Exchange[];
  /** Number of 3xx responses with a Location header that were followed. */
  hops: number;
  /** The final non-redirect exchange, or null when the chain did not end in the snapshot. */
  final: Exchange | null;
  /** Comparison key of the final URL (the last requested URL). */
  finalUrl: string;
  problem: null | "loop" | "too_many_hops" | "unfetched";
}

export type RobotsState =
  | { state: "parsed"; parsed: ParsedRobots; exchange: Exchange; hops: number; url: string }
  | { state: "not_found"; exchange: Exchange | null; hops: number; url: string }
  | { state: "unavailable"; exchange: Exchange | null; hops: number; url: string }
  | { state: "missing"; url: string };

export type Access =
  | { kind: "decided"; decision: AccessDecision; robots: ParsedRobots; robotsUrl: string }
  | { kind: "allowed_no_robots" }
  | { kind: "unavailable" }
  | { kind: "missing" };

export interface PageLink {
  element: Element;
  rawHref: string;
  key: string | null;
  internal: boolean;
  nofollow: boolean;
  line: number;
  anchorText: string;
  imageAlts: string;
  ariaLabel: string | null;
  fragment: string;
}

export interface PageImage {
  element: Element;
  src: string | null;
  key: string | null;
  alt: string | null;
  loading: string | null;
  width: string | null;
  height: string | null;
  line: number;
  inTemplate: boolean;
}

export interface CanonicalLink {
  element: Element;
  rawHref: string | null;
  key: string | null;
  inHead: boolean;
  line: number;
}

export interface HreflangLink {
  element: Element | null;
  method: "html" | "header" | "sitemap";
  hreflang: string;
  rawHref: string;
  key: string | null;
  inHead: boolean;
  line: number;
  hasMedia: boolean;
}

export interface Page {
  key: string;
  chain: Chain;
  exchange: Exchange;
  bytes: Uint8Array;
  parsed: ParsedHtml;
  base: string;
  directives: EffectiveDirectives;
  bingTokens: string[];
  canonicals: CanonicalLink[];
  headCanonicals: CanonicalLink[];
  headerCanonicals: { raw: string; key: string | null }[];
  links: PageLink[];
  images: PageImage[];
  hreflangs: HreflangLink[];
}

export interface SitemapFile {
  url: string;
  foundBy: "robots" | "config" | "convention" | "index";
  parent: string | null;
  chain: Chain;
  parsed: ParsedSitemap | null;
  /** Keys of locs that pass SEO-SITEMAP-02 and SEO-SITEMAP-02B. */
  validLocs: string[];
  /** Keys of locs rejected by scope or absoluteness. */
  outOfScope: string[];
  notAbsolute: string[];
}

const CRAWLER_CHAINS = new Map(CRAWLERS.map((c) => [c.token.toLowerCase(), c.chain]));
export const GOOGLEBOT_CHAIN = CRAWLER_CHAINS.get("googlebot")!;
export const GOOGLEBOT_IMAGE_CHAIN = CRAWLER_CHAINS.get("googlebot-image")!;
export const BINGBOT_CHAIN = CRAWLER_CHAINS.get("bingbot")!;
export const SCANNER_TOKEN_CHAIN = ["groundtruthseoscanner", "*"];

const DIAGNOSTIC_PURPOSES = new Set(["conditional", "parity_mobile", "parity_desktop"]);

export class EvaluationContext {
  readonly snapshot: Snapshot;
  readonly config: ScanConfig;
  readonly engines: Set<Engine>;
  readonly completedAtMs: number;
  readonly preferredOrigin: string;
  readonly homePage: string;
  readonly inScopeOrigins: string[];
  readonly variantOrigins: string[];
  private readonly exchangesByUrl = new Map<string, Exchange[]>();
  private readonly chainCache = new Map<string, Chain>();
  private readonly robotsCache = new Map<string, RobotsState>();
  private readonly pageCache = new Map<string, Page | null>();
  readonly sitemaps: SitemapFile[];
  /** Whether a sitemap was found (declared, configured or by convention). */
  readonly sitemapFound: boolean;
  /** Intent was inferred from links (PRODUCT.md §7.4 step 4). */
  readonly intentInferred: boolean;
  readonly intended: string[];
  /** How each intended URL entered I. */
  readonly intentSource = new Map<string, string>();
  private blockedSet = new Set<string>();
  private blockedByGate = new Map<string, string[]>();
  private pageSet: string[] | null = null;
  readonly fetchedPages: string[];

  constructor(snapshot: Snapshot, config: ScanConfig) {
    this.snapshot = snapshot;
    this.config = config;
    this.engines = new Set(config.engines);
    this.completedAtMs = parseCompletedAt(snapshot.completed_at);
    this.preferredOrigin = snapshot.preferred_origin;
    this.homePage = homePageOf(this.preferredOrigin);
    this.inScopeOrigins = sortBytes(new Set([this.preferredOrigin, ...config.additional_origins]));
    this.variantOrigins = sortBytes(snapshot.variant_origins);

    const sorted = [...snapshot.exchanges].sort((a, b) => a.seq - b.seq);
    for (const exchange of sorted) {
      const key = comparisonKey(exchange.request.url);
      if (key === null) continue;
      const list = this.exchangesByUrl.get(key);
      if (list) list.push(exchange);
      else this.exchangesByUrl.set(key, [exchange]);
    }

    this.sitemaps = this.loadSitemaps();
    this.sitemapFound = this.sitemaps.length > 0;
    this.fetchedPages = this.computeFetchedPages();
    const intent = this.computeIntended();
    this.intended = intent.intended;
    this.intentInferred = intent.inferred;
  }

  // ---------------------------------------------------------------- exchanges

  /** Every exchange for a URL (comparison key), by sequence. */
  exchangesFor(url: string): Exchange[] {
    return this.exchangesByUrl.get(url) ?? [];
  }

  /** The primary exchange for a URL: the first non-diagnostic one. */
  primaryExchange(url: string): Exchange | null {
    for (const exchange of this.exchangesFor(url)) {
      if (!DIAGNOSTIC_PURPOSES.has(exchange.purpose)) return exchange;
    }
    return null;
  }

  exchangeWithPurpose(url: string, purpose: Exchange["purpose"]): Exchange | null {
    return this.exchangesFor(url).find((e) => e.purpose === purpose) ?? null;
  }

  wasFetched(url: string): boolean {
    return this.primaryExchange(url) !== null;
  }

  /** All comparison keys with a primary exchange, sorted. */
  allRequestedUrls(): string[] {
    return sortBytes(this.exchangesByUrl.keys());
  }

  body(exchange: Exchange | null): Uint8Array | null {
    return bodyOf(this.snapshot, exchange);
  }

  // ------------------------------------------------------------------- chains

  /** Follow the redirect chain of a URL within the snapshot (KNOWLEDGE.md §3.12). */
  chain(url: string): Chain {
    const cached = this.chainCache.get(url);
    if (cached) return cached;
    const exchanges: Exchange[] = [];
    const seen = new Set<string>();
    let current = url;
    let hops = 0;
    let final: Exchange | null = null;
    let problem: Chain["problem"] = null;
    for (let i = 0; i < 11; i += 1) {
      if (seen.has(current)) {
        problem = "loop";
        break;
      }
      seen.add(current);
      const exchange = this.primaryExchange(current);
      if (!exchange) {
        problem = "unfetched";
        break;
      }
      exchanges.push(exchange);
      const location = header(exchange, "location");
      const isRedirect = exchange.outcome === "response" && exchange.status !== null && exchange.status >= 300 && exchange.status < 400 && location !== null;
      if (!isRedirect) {
        final = exchange;
        break;
      }
      if (i === 10) {
        problem = "too_many_hops";
        break;
      }
      hops += 1;
      const next = comparisonKey(location!, exchange.request.url);
      if (next === null) {
        problem = "unfetched";
        break;
      }
      current = next;
    }
    const chain: Chain = { requested: url, exchanges, hops, final, finalUrl: current, problem };
    this.chainCache.set(url, chain);
    return chain;
  }

  /** The first response of a URL is a redirect. */
  redirects(url: string): boolean {
    const first = this.primaryExchange(url);
    return first !== null && first.outcome === "response" && first.status !== null && first.status >= 300 && first.status < 400 && header(first, "location") !== null;
  }

  // ------------------------------------------------------------------- robots

  robots(origin: string): RobotsState {
    const cached = this.robotsCache.get(origin);
    if (cached) return cached;
    const url = `${origin}/robots.txt`;
    let state: RobotsState;
    const chain = this.chain(url);
    if (chain.exchanges.length === 0) {
      state = { state: "missing", url };
    } else if (chain.hops > 5 || chain.problem === "loop" || chain.problem === "too_many_hops") {
      // Google follows at least five redirect hops, then treats it as 404.
      state = { state: "not_found", exchange: chain.final, hops: chain.hops, url };
    } else if (chain.problem === "unfetched" || chain.final === null) {
      state = { state: "unavailable", exchange: chain.exchanges[chain.exchanges.length - 1] ?? null, hops: chain.hops, url };
    } else {
      const final = chain.final;
      if (final.outcome !== "response") {
        state = final.outcome === "blocked_by_robots_policy"
          ? { state: "missing", url }
          : { state: "unavailable", exchange: final, hops: chain.hops, url };
      } else if (final.status !== null && final.status >= 200 && final.status < 300) {
        const bytes = this.body(final) ?? new Uint8Array(0);
        state = { state: "parsed", parsed: parseRobotsTxt(bytes), exchange: final, hops: chain.hops, url };
      } else if (final.status !== null && final.status >= 400 && final.status < 500 && final.status !== 429) {
        state = { state: "not_found", exchange: final, hops: chain.hops, url };
      } else {
        state = { state: "unavailable", exchange: final, hops: chain.hops, url };
      }
    }
    this.robotsCache.set(origin, state);
    return state;
  }

  /** Crawl access for a URL with a crawler token chain. */
  access(url: string, chain: readonly string[]): Access {
    const origin = originOf(url);
    const robots = this.robots(origin);
    if (robots.state === "missing") return { kind: "missing" };
    if (robots.state === "unavailable") return { kind: "unavailable" };
    if (robots.state === "not_found") return { kind: "allowed_no_robots" };
    return {
      kind: "decided",
      decision: decideAccess(robots.parsed, chain, pathAndQuery(url)),
      robots: robots.parsed,
      robotsUrl: robots.url,
    };
  }

  isDisallowed(url: string, chain: readonly string[]): boolean {
    const access = this.access(url, chain);
    return access.kind === "decided" && !access.decision.allowed;
  }

  crawlerChain(token: string): readonly string[] {
    return CRAWLER_CHAINS.get(token.toLowerCase()) ?? [token.toLowerCase(), "*"];
  }

  // -------------------------------------------------------------------- pages

  isInScope(url: string): boolean {
    return this.inScopeOrigins.includes(originOf(url));
  }

  /** The parsed page for a URL whose chain ends in 200 HTML, else null. */
  page(url: string): Page | null {
    if (this.pageCache.has(url)) return this.pageCache.get(url)!;
    const chain = this.chain(url);
    const final = chain.final;
    let page: Page | null = null;
    if (final && final.outcome === "response" && final.status === 200 && isHtmlMediaType(header(final, "content-type"))) {
      const bytes = this.body(final);
      if (bytes) page = this.buildPage(url, chain, final, bytes);
    }
    this.pageCache.set(url, page);
    return page;
  }

  private buildPage(key: string, chain: Chain, exchange: Exchange, bytes: Uint8Array): Page {
    const parsed = parseHtml(bytes, header(exchange, "content-type"));
    const base = baseUrl(parsed, chain.finalUrl);
    const metas = elements(parsed.document, "meta").map((meta) => ({
      name: attr(meta, "name") ?? "",
      content: attr(meta, "content") ?? "",
      line: lineOf(meta),
    }));
    const directives = effectiveGoogleDirectives({ metas, xRobotsTag: headers(exchange, "x-robots-tag") }, this.completedAtMs);
    const bingTokens = bingDirectiveTokens({ metas, xRobotsTag: headers(exchange, "x-robots-tag") });

    const canonicals: CanonicalLink[] = [];
    const hreflangs: HreflangLink[] = [];
    for (const link of elements(parsed.document, "link")) {
      const rel = relTokens(link);
      const inHead = isInHead(parsed, link);
      const line = lineOf(link);
      if (rel.includes("canonical")) {
        const rawHref = attr(link, "href");
        canonicals.push({ element: link, rawHref, key: rawHref === null ? null : comparisonKey(rawHref, base), inHead, line });
      }
      const hreflang = attr(link, "hreflang");
      if (rel.includes("alternate") && hreflang !== null) {
        const rawHref = attr(link, "href") ?? "";
        hreflangs.push({
          element: link,
          method: "html",
          hreflang,
          rawHref,
          key: comparisonKey(rawHref, base),
          inHead,
          line,
          hasMedia: attr(link, "media") !== null,
        });
      }
    }
    const headerCanonicals: { raw: string; key: string | null }[] = [];
    for (const value of headers(exchange, "link")) {
      for (const part of splitLinkHeader(value)) {
        if (part.rel.includes("canonical")) headerCanonicals.push({ raw: part.url, key: comparisonKey(part.url, chain.finalUrl) });
        const hreflang = part.params.hreflang;
        if (part.rel.includes("alternate") && hreflang !== undefined) {
          hreflangs.push({ element: null, method: "header", hreflang, rawHref: part.url, key: comparisonKey(part.url, chain.finalUrl), inHead: true, line: 0, hasMedia: part.params.media !== undefined });
        }
      }
    }
    // Sitemap xhtml:link alternates for this URL.
    for (const sitemap of this.sitemaps) {
      if (!sitemap.parsed) continue;
      for (const entry of sitemap.parsed.entries) {
        if (comparisonKey(entry.loc) !== key) continue;
        for (const alt of entry.alternates) {
          hreflangs.push({ element: null, method: "sitemap", hreflang: alt.hreflang, rawHref: alt.href, key: comparisonKey(alt.href, sitemap.url), inHead: true, line: 0, hasMedia: false });
        }
      }
    }

    const links: PageLink[] = [];
    for (const tag of ["a", "area"] as const) {
      for (const anchor of elements(parsed.document, tag)) {
        const rawHref = attr(anchor, "href");
        if (rawHref === null) continue;
        const resolved = comparisonKey(rawHref, base);
        let fragment = "";
        try {
          fragment = new URL(rawHref.trim(), base).hash;
        } catch {
          fragment = "";
        }
        const rel = relTokens(anchor);
        const alts = elements(anchor, "img")
          .map((img) => (attr(img, "alt") ?? "").trim())
          .filter((alt) => alt !== "")
          .join(" ");
        links.push({
          element: anchor,
          rawHref,
          key: resolved,
          internal: resolved !== null && this.isInScope(resolved),
          nofollow: rel.includes("nofollow") || directives.nofollow,
          line: lineOf(anchor),
          anchorText: elementText(anchor),
          imageAlts: alts,
          ariaLabel: attr(anchor, "aria-label"),
          fragment,
        });
      }
    }

    const images: PageImage[] = [];
    // Template contents live in a document fragment, so descendants of <template> are those not reachable without templates.
    const outsideTemplates = new Set(elements(parsed.document, "img", false));
    for (const img of elements(parsed.document, "img", true)) {
      const src = attr(img, "src");
      images.push({
        element: img,
        src,
        key: src === null || src.trim() === "" ? null : comparisonKey(src, base),
        alt: attr(img, "alt"),
        loading: attr(img, "loading"),
        width: attr(img, "width"),
        height: attr(img, "height"),
        line: lineOf(img),
        inTemplate: !outsideTemplates.has(img),
      });
    }

    return {
      key,
      chain,
      exchange,
      bytes,
      parsed,
      base,
      directives,
      bingTokens,
      canonicals,
      headCanonicals: canonicals.filter((c) => c.inHead),
      headerCanonicals,
      links,
      images,
      hreflangs,
    };
  }

  /** The first head canonical's key of a page, or null. */
  headCanonicalOf(url: string): string | null {
    const page = this.page(url);
    const first = page?.headCanonicals[0];
    return first?.key ?? null;
  }

  // ------------------------------------------------------------------ sitemaps

  private loadSitemaps(): SitemapFile[] {
    const files: SitemapFile[] = [];
    const sources = [...this.snapshot.sitemaps].sort((a, b) => compareBytes(a.url, b.url));
    for (const source of sources) {
      const key = comparisonKey(source.url);
      if (key === null) continue;
      const chain = this.chain(key);
      const final = chain.final;
      let parsed: ParsedSitemap | null = null;
      if (final && final.outcome === "response" && final.status === 200) {
        const bytes = this.body(final);
        if (bytes) parsed = parseSitemap(bytes);
      }
      const file: SitemapFile = { url: key, foundBy: source.found_by, parent: source.parent, chain, parsed, validLocs: [], outOfScope: [], notAbsolute: [] };
      if (parsed && (parsed.kind === "urlset" || parsed.kind === "plain")) {
        const dir = directoryOf(chain.finalUrl);
        for (const entry of parsed.entries) {
          if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(entry.loc.trim())) {
            file.notAbsolute.push(entry.loc);
            continue;
          }
          const locKey = comparisonKey(entry.loc);
          if (locKey === null) {
            file.notAbsolute.push(entry.loc);
            continue;
          }
          if (this.locInScope(locKey, dir, key)) file.validLocs.push(locKey);
          else file.outOfScope.push(locKey);
        }
      }
      files.push(file);
    }
    return files;
  }

  /** SEO-SITEMAP-02: same scheme/host/port and under the sitemap's directory, unless cross-submitted. */
  locInScope(locKey: string, sitemapDir: string, sitemapUrl: string): boolean {
    const dirUrl = new URL(sitemapDir);
    const loc = new URL(locKey);
    if (loc.protocol === dirUrl.protocol && loc.host === dirUrl.host && loc.pathname.startsWith(dirUrl.pathname)) return true;
    // Cross-submission: the robots.txt of the loc's host names this sitemap.
    const robots = this.robots(loc.origin);
    if (robots.state === "parsed") {
      for (const line of robots.parsed.sitemaps) {
        if (comparisonKey(line.value, robots.url) === sitemapUrl) return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------- intended set (I)

  private computeFetchedPages(): string[] {
    const out: string[] = [];
    for (const url of this.allRequestedUrls()) {
      if (!this.isInScope(url)) continue;
      const exchange = this.primaryExchange(url);
      if (!exchange || DIAGNOSTIC_PURPOSES.has(exchange.purpose)) continue;
      if (exchange.purpose === "variant_probe" || exchange.purpose === "variant_sample") continue;
      const chain = this.chain(url);
      const final = chain.final;
      if (final && final.outcome === "response" && final.status === 200 && isHtmlMediaType(header(final, "content-type"))) out.push(url);
    }
    return out;
  }

  private computeIntended(): { intended: string[]; inferred: boolean } {
    const set = new Set<string>([this.homePage]);
    this.intentSource.set(this.homePage, "it is the home page");
    const sitemapLocs: { loc: string; sitemap: string }[] = [];
    for (const sitemap of this.sitemaps) {
      for (const loc of sitemap.validLocs) {
        if (this.isInScope(loc)) sitemapLocs.push({ loc, sitemap: sitemap.url });
      }
    }
    for (const { loc, sitemap } of sitemapLocs) {
      if (!set.has(loc)) {
        set.add(loc);
        this.intentSource.set(loc, `it is in ${sitemap}`);
      }
    }
    const discovered = this.discoveredUrls();
    for (const pattern of this.config.include) {
      for (const url of discovered) {
        if (matchesPathGlob(pattern, pathAndQuery(url)) && !set.has(url)) {
          set.add(url);
          this.intentSource.set(url, `it matches include pattern ${pattern}`);
        }
      }
    }
    for (const pattern of this.config.exclude) {
      for (const url of [...set]) {
        if (url !== this.homePage && matchesPathGlob(pattern, pathAndQuery(url))) set.delete(url);
      }
    }
    let inferred = false;
    if (!this.sitemapFound && this.config.include.length === 0) {
      inferred = true;
      for (const url of this.linkDiscoveredUrls()) {
        if (set.has(url)) continue;
        const page = this.page(url);
        if (!page) continue;
        if (page.directives.noindex) continue;
        if (this.disallowedForAnySelectedEngine(url)) continue;
        set.add(url);
        this.intentSource.set(url, "it was discovered by a link");
      }
    }
    return { intended: sortBytes(set), inferred };
  }

  /** In-scope URLs discovered by the crawl or listed in sitemaps. */
  private discoveredUrls(): string[] {
    const set = new Set<string>();
    for (const entry of this.snapshot.crawl) {
      const key = comparisonKey(entry.url);
      if (key && this.isInScope(key)) set.add(key);
    }
    for (const sitemap of this.sitemaps) for (const loc of sitemap.validLocs) if (this.isInScope(loc)) set.add(loc);
    return sortBytes(set);
  }

  linkDiscoveredUrls(): string[] {
    const set = new Set<string>();
    for (const entry of this.snapshot.crawl) {
      const key = comparisonKey(entry.url);
      if (key && this.isInScope(key)) set.add(key);
    }
    return sortBytes(set);
  }

  disallowedForAnySelectedEngine(url: string): boolean {
    if (this.engines.has("google") && this.isDisallowed(url, GOOGLEBOT_CHAIN)) return true;
    if (this.engines.has("bing") && this.isDisallowed(url, BINGBOT_CHAIN)) return true;
    return false;
  }

  // ------------------------------------------------------------ B and P sets

  /** Record the blocked set after the indexing gates ran. */
  setBlocked(blocked: Map<string, string[]>): void {
    this.blockedByGate = blocked;
    this.blockedSet = new Set(blocked.keys());
    this.pageSet = null;
  }

  get blocked(): string[] {
    return sortBytes(this.blockedSet);
  }

  gatesBlocking(url: string): string[] {
    return this.blockedByGate.get(url) ?? [];
  }

  isBlocked(url: string): boolean {
    return this.blockedSet.has(url);
  }

  /** P: members of I not in B whose final response was 200 HTML. */
  get pages(): string[] {
    if (this.pageSet === null) {
      this.pageSet = this.intended.filter((url) => !this.blockedSet.has(url) && this.page(url) !== null);
    }
    return this.pageSet;
  }

  /** Home pages of each in-scope hostname: the origins' home pages. */
  get inScopeHomePages(): string[] {
    return this.inScopeOrigins.map((origin) => homePageOf(origin));
  }

  /** Keys of URLs to a simple string key for a URL instance. */
  keyOf(url: URL): string {
    return keyOfUrl(url);
  }
}

/** Parse an HTTP Link header into its parts. */
export function splitLinkHeader(value: string): { url: string; rel: string[]; params: Record<string, string> }[] {
  const parts: { url: string; rel: string[]; params: Record<string, string> }[] = [];
  const re = /<([^>]*)>\s*((?:;\s*[^,;]+(?:=\s*(?:"[^"]*"|[^,;]*))?\s*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const params: Record<string, string> = {};
    for (const param of match[2]!.split(";")) {
      const eq = param.indexOf("=");
      if (eq < 0) continue;
      const name = param.slice(0, eq).trim().toLowerCase();
      const raw = param.slice(eq + 1).trim().replace(/^"|"$/g, "");
      if (!(name in params)) params[name] = raw;
    }
    parts.push({ url: match[1]!, rel: (params.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean), params });
  }
  return parts;
}
