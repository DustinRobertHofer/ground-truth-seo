/**
 * The focused checkers (PRODUCT.md §19): one page per question, each running
 * the full scanner's acquisition and evaluation on a small crawl and showing
 * only the rules that answer that question. Nothing here defines what counts
 * as a problem; that stays in the ruleset. This file only picks rule IDs,
 * crawl bounds and page copy.
 *
 * Safe to import from client components: it holds strings and numbers only.
 */

import type { AcquireFocus } from "../scanner/acquire/crawl.js";

export const CHECKER_SLUGS = [
  "robots-txt-checker",
  "sitemap-checker",
  "noindex-checker",
  "canonical-checker",
  "redirect-checker",
  "title-tag-checker",
  "meta-description-checker",
  "hreflang-checker",
  "llms-txt-checker",
  "ai-crawler-checker",
] as const;

export type CheckerSlug = (typeof CHECKER_SLUGS)[number];

/** Crawl bounds for one check; everything else uses the scanner's defaults. */
export interface CheckerLimits {
  max_pages: number;
  max_depth: number;
  max_extra_fetches: number;
}

export interface CheckerConfig {
  slug: CheckerSlug;
  path: `/${CheckerSlug}`;
  /** The name in running text ("Starting the robots.txt checker"). */
  name: string;
  /** The name as a label: breadcrumbs, link text, card titles. */
  label: string;
  /** The page title, before the site-name template. */
  title: string;
  /** The meta description, also printed under the H1 and used as the WebApplication description. */
  description: string;
  h1: string;
  eyebrow: string;
  /** The submit button. */
  cta: string;
  /** The button while the check runs. */
  pending: string;
  /** One sentence for related-tool cards on other pages. */
  blurb: string;
  /** What the check fetches, printed beside the form so the reader knows its reach. */
  reach: string;
  /** Existing ruleset IDs whose findings this check shows, in display order. */
  ruleIds: readonly string[];
  focus: AcquireFocus;
  limits: CheckerLimits;
  /** Two to four related checkers, most related first. */
  related: readonly CheckerSlug[];
}

export const CHECKERS: readonly CheckerConfig[] = [
  {
    slug: "robots-txt-checker",
    path: "/robots-txt-checker",
    name: "robots.txt checker",
    label: "robots.txt checker",
    title: "robots.txt Checker: Test and Validate Crawl Rules",
    description:
      "Fetch a site's robots.txt, parse it the way Google documents, and see which URLs Googlebot and bingbot may crawl, which lines are ignored and which sitemaps it declares.",
    h1: "robots.txt checker and validator",
    eyebrow: "Free check · robots.txt",
    cta: "Check robots.txt",
    pending: "Checking robots.txt",
    blurb: "Parses robots.txt with Google's documented matching rules and tests your sitemap URLs against it.",
    reach:
      "Reads /robots.txt, the sitemaps it declares (or /sitemap.xml) and the home page. Sitemap URLs are tested against the rules without being fetched.",
    ruleIds: [
      "SEO-ROBOTS-04",
      "SEO-ROBOTS-02",
      "SEO-ROBOTS-03",
      "SEO-ROBOTS-05A",
      "SEO-ROBOTS-05B",
      "SEO-ROBOTS-08",
      "SEO-IDX-03",
      "SEO-IDX-02",
      "SEO-ROBOTS-01",
      "SEO-ROBOTS-07",
      "SEO-ROBOTS-10",
    ],
    focus: { phases: ["sitemaps", "crawl"] },
    limits: { max_pages: 1, max_depth: 0, max_extra_fetches: 0 },
    related: ["sitemap-checker", "noindex-checker", "ai-crawler-checker", "llms-txt-checker"],
  },
  {
    slug: "sitemap-checker",
    path: "/sitemap-checker",
    name: "XML sitemap checker",
    label: "XML sitemap checker",
    title: "XML Sitemap Checker: Validate Sitemaps and Listed URLs",
    description:
      "Find a site's sitemaps through robots.txt or /sitemap.xml, confirm each returns 200 and parses as a sitemap, count the URLs it lists and test a sample of them.",
    h1: "XML sitemap checker and validator",
    eyebrow: "Free check · Sitemaps",
    cta: "Check sitemap",
    pending: "Checking sitemaps",
    blurb: "Finds every sitemap, checks the protocol's limits and scope, and loads a sample of the URLs it lists.",
    reach:
      "Reads robots.txt, every declared sitemap and the index files it names (or /sitemap.xml), then loads the home page and up to 25 listed URLs.",
    ruleIds: [
      "SEO-SITEMAP-07",
      "SEO-SITEMAP-01",
      "SEO-SITEMAP-02",
      "SEO-SITEMAP-02B",
      "SEO-SITEMAP-02C",
      "SEO-SITEMAP-03",
      "SEO-SITEMAP-04A",
      "SEO-SITEMAP-04B",
      "SEO-SITEMAP-04C",
      "SEO-ROBOTS-08",
      "SEO-HTTP-01",
      "SEO-HTTP-02",
      "SEO-IDX-06",
      "SEO-ROBOTS-05A",
      "SEO-SITEMAP-05",
      "SEO-SITEMAP-08",
    ],
    focus: { phases: ["sitemaps", "crawl", "sitemap_urls"] },
    limits: { max_pages: 26, max_depth: 0, max_extra_fetches: 0 },
    related: ["robots-txt-checker", "noindex-checker", "canonical-checker"],
  },
  {
    slug: "noindex-checker",
    path: "/noindex-checker",
    name: "noindex checker",
    label: "Noindex checker",
    title: "Noindex Checker: Can Google Index This Page?",
    description:
      "Check what decides whether a page can be indexed: its status code, whether robots.txt lets Googlebot and bingbot fetch it, every noindex in its robots meta tags and X-Robots-Tag header, and noindex rules Google can never read.",
    h1: "Noindex and indexability checker",
    eyebrow: "Free check · Indexing",
    cta: "Check indexability",
    pending: "Checking indexability",
    blurb: "Shows the status code, the robots.txt verdict and every robots meta tag and X-Robots-Tag header that decide whether a page can be indexed.",
    reach:
      "Reads robots.txt and the sitemaps it declares, then loads the URL you enter, the home page and the pages they link to, up to 12 pages, and up to 6 canonical targets they name. Sitemap URLs are tested against robots.txt without being fetched.",
    ruleIds: [
      "SEO-HTTP-01",
      "SEO-HTTP-02",
      "SEO-ROBOTS-05A",
      "SEO-IDX-06",
      "SEO-IDX-02",
      "SEO-IDX-03",
      "SEO-CANON-07",
      "SEO-IDX-01",
      "SEO-IDX-05",
    ],
    focus: { phases: ["sitemaps", "crawl", "targets"], seedStartUrl: true },
    limits: { max_pages: 12, max_depth: 1, max_extra_fetches: 6 },
    related: ["robots-txt-checker", "canonical-checker", "sitemap-checker"],
  },
  {
    slug: "canonical-checker",
    path: "/canonical-checker",
    name: "canonical tag checker",
    label: "Canonical tag checker",
    title: "Canonical Tag Checker: Check rel=canonical URLs",
    description:
      "Read the rel=canonical tags on a page and the pages it links to, then check placement, absolute URLs, conflicting canonicals and whether each target loads without a redirect.",
    h1: "Canonical tag checker",
    eyebrow: "Free check · Canonicalization",
    cta: "Check canonical tags",
    pending: "Checking canonical tags",
    blurb: "Checks where each rel=canonical sits, what it points to and whether that target answers 200 without redirecting.",
    reach:
      "Loads the URL you enter and the home page, then pages they link to, up to 12 pages in all. It also requests the canonical targets they name and the http/https and www variants of the host.",
    ruleIds: [
      "SEO-CANON-01",
      "SEO-CANON-02",
      "SEO-CANON-08",
      "SEO-CANON-04",
      "SEO-CANON-05",
      "SEO-CANON-07",
      "SEO-HEAD-05",
      "SEO-HTTP-07",
      "SEO-URL-01",
      "SEO-CANON-03",
      "SEO-CANON-06",
    ],
    focus: { phases: ["variants", "crawl", "targets"], seedStartUrl: true },
    limits: { max_pages: 12, max_depth: 1, max_extra_fetches: 12 },
    related: ["redirect-checker", "noindex-checker", "hreflang-checker", "meta-description-checker"],
  },
  {
    slug: "redirect-checker",
    path: "/redirect-checker",
    name: "redirect checker",
    label: "Redirect checker",
    title: "Redirect Checker: Trace Redirect Chains and Status Codes",
    description:
      "Follow a URL through every redirect, hop by hop, with the status code of each response. Check that the http, https, www and non-www versions of a site reach one address in a single permanent redirect, and find chains, loops and meta refresh redirects.",
    h1: "Redirect checker",
    eyebrow: "Free check · Redirects",
    cta: "Check redirects",
    pending: "Checking redirects",
    blurb: "Traces each redirect hop by hop with its status code and checks that every host and protocol variant lands on one address.",
    reach:
      "Follows the URL you enter through every redirect, probes the http, https, www and non-www versions of the host, then loads the home page and the pages they link to, up to 12 pages, and up to 12 redirect and canonical targets they name.",
    ruleIds: [
      "SEO-URL-01",
      "SEO-REDIR-07",
      "SEO-REDIR-03",
      "SEO-HTTP-07",
      "SEO-META-06",
      "SEO-HTTP-01",
      "SEO-REDIR-01",
      "SEO-REDIR-06",
    ],
    focus: { phases: ["variants", "crawl", "targets"], seedStartUrl: true },
    limits: { max_pages: 12, max_depth: 1, max_extra_fetches: 12 },
    related: ["canonical-checker", "noindex-checker", "sitemap-checker"],
  },
  {
    slug: "title-tag-checker",
    path: "/title-tag-checker",
    name: "title tag checker",
    label: "Title tag checker",
    title: "Title Tag Checker: Find Missing and Duplicate Page Titles",
    description:
      "Read the title element on a page and the pages it links to. Find missing, empty, duplicated and repeated titles, see each page's main heading beside its title, and see each title's length without an invented limit.",
    h1: "Title tag checker",
    eyebrow: "Free check · Titles",
    cta: "Check titles",
    pending: "Checking titles",
    blurb: "Lists every page's title beside its main heading, flags missing, empty, duplicated and repeated titles, and shows length as information only.",
    reach: "Loads the URL you enter and the home page, then pages they link to, up to 15 pages in all.",
    ruleIds: ["SEO-HEAD-01", "SEO-HEAD-01B", "SEO-META-01", "SEO-HDG-01"],
    focus: { phases: ["crawl"], seedStartUrl: true },
    limits: { max_pages: 15, max_depth: 1, max_extra_fetches: 0 },
    related: ["meta-description-checker", "canonical-checker", "hreflang-checker"],
  },
  {
    slug: "meta-description-checker",
    path: "/meta-description-checker",
    name: "meta description checker",
    label: "Meta description checker",
    title: "Meta Description Checker: Missing, Duplicate and Multiple Tags",
    description:
      "Read the meta descriptions on a page and the pages it links to. Find missing, empty, duplicated and repeated description tags, and see each one's length without an invented limit.",
    h1: "Meta description checker",
    eyebrow: "Free check · Meta descriptions",
    cta: "Check meta descriptions",
    pending: "Checking meta descriptions",
    blurb: "Lists every page's meta description, flags duplicates and repeated tags, and shows length as information only.",
    reach: "Loads the URL you enter and the home page, then pages they link to, up to 15 pages in all.",
    ruleIds: ["SEO-META-02A", "SEO-META-02B", "SEO-META-02C", "SEO-META-04"],
    focus: { phases: ["crawl"], seedStartUrl: true },
    limits: { max_pages: 15, max_depth: 1, max_extra_fetches: 0 },
    related: ["title-tag-checker", "canonical-checker", "robots-txt-checker"],
  },
  {
    slug: "hreflang-checker",
    path: "/hreflang-checker",
    name: "hreflang checker",
    label: "Hreflang checker",
    title: "Hreflang Checker: Validate Language and Region Annotations",
    description:
      "Read the hreflang annotations on a page and the pages it links to, then check language and region codes, absolute URLs, self-references and placement, and load each alternate version to see whether it links back.",
    h1: "Hreflang tag checker",
    eyebrow: "Free check · hreflang",
    cta: "Check hreflang",
    pending: "Checking hreflang",
    blurb: "Checks hreflang codes and URLs, confirms each page lists itself, and loads every alternate to see whether it links back.",
    reach:
      "Loads the URL you enter and the home page, then pages they link to, up to 12 pages, and up to 12 alternate and canonical URLs they name. It reads link elements and Link headers; hreflang in sitemaps is read by the full audit.",
    ruleIds: [
      "SEO-I18N-07",
      "SEO-I18N-02",
      "SEO-I18N-03",
      "SEO-I18N-04",
      "SEO-I18N-06",
      "SEO-I18N-08",
      "SEO-HEAD-05",
      "SEO-I18N-09",
      "SEO-I18N-05",
    ],
    focus: { phases: ["crawl", "targets"], seedStartUrl: true },
    limits: { max_pages: 12, max_depth: 1, max_extra_fetches: 12 },
    related: ["canonical-checker", "redirect-checker", "title-tag-checker"],
  },
  {
    slug: "llms-txt-checker",
    path: "/llms-txt-checker",
    name: "llms.txt checker",
    label: "llms.txt checker",
    title: "llms.txt Checker: Validate an llms.txt File",
    description:
      "Check whether a site serves /llms.txt, what the server returns, and whether the file follows the proposal's format. Google says Search ignores llms.txt, and this tool says so too.",
    h1: "llms.txt checker",
    eyebrow: "Free check · llms.txt",
    cta: "Check llms.txt",
    pending: "Checking llms.txt",
    blurb: "Reads /llms.txt and compares its structure with the proposal. Google Search ignores the file, and so does the score.",
    reach: "Reads robots.txt and /llms.txt on the site's preferred origin. No pages are crawled.",
    ruleIds: ["SEO-AI-05"],
    focus: { phases: ["llms"] },
    limits: { max_pages: 1, max_depth: 0, max_extra_fetches: 0 },
    related: ["ai-crawler-checker", "robots-txt-checker"],
  },
  {
    slug: "ai-crawler-checker",
    path: "/ai-crawler-checker",
    name: "AI crawler checker",
    label: "AI crawler checker",
    title: "AI Crawler Checker: Which AI Bots Does robots.txt Block?",
    description:
      "See whether a site's robots.txt allows or blocks GPTBot, ClaudeBot, PerplexityBot, Google-Extended and other AI crawlers, with each operator's own account of what its token controls.",
    h1: "AI crawler checker",
    eyebrow: "Free check · AI crawlers",
    cta: "Check AI crawlers",
    pending: "Checking AI crawlers",
    blurb: "Shows which search, training and user-triggered AI crawlers robots.txt admits, in each operator's own words.",
    reach:
      "Reads /robots.txt, the sitemaps it declares (for a sample of URLs) and the home page, then applies each crawler's documented token chain.",
    ruleIds: ["SEO-ROBOTS-04", "SEO-ROBOTS-05A", "SEO-AI-02", "SEO-AI-01", "SEO-AI-04"],
    focus: { phases: ["sitemaps", "crawl"] },
    limits: { max_pages: 1, max_depth: 0, max_extra_fetches: 0 },
    related: ["robots-txt-checker", "llms-txt-checker"],
  },
];

const BY_SLUG = new Map(CHECKERS.map((c) => [c.slug, c]));

export function isCheckerSlug(value: unknown): value is CheckerSlug {
  return typeof value === "string" && BY_SLUG.has(value as CheckerSlug);
}

export function checkerBySlug(slug: CheckerSlug): CheckerConfig {
  return BY_SLUG.get(slug)!;
}
