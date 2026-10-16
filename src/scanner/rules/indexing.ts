import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.4 Indexing controls. */
export const INDEXING_RULES: Rule[] = [
  {
    id: "SEO-IDX-06",
    title: "Intended URLs carry no noindex",
    class: "C1",
    weight: 8,
    gate: { kind: "indexing" },
    category: "indexing",
    scope: "members of I with a final 200",
    scopeKind: "page",
    engines: ["google"],
    book: "SUPPORTED (mechanism), applied to stated intent",
    conditions: [
      {
        code: "noindex",
        reason:
          "{url} is listed as a page you want indexed ({intent_source}), but it carries {directive} via {directive_source}. For Google, noindex means: 'Do not show this page, media, or resource in search results.'",
      },
      {
        code: "noindex_after_render",
        reason:
          "{url} has no noindex in its server HTML, but JavaScript adds {directive} after rendering. If Google renders the page, it will see this rule.",
        requires: "rendered",
      },
      {
        code: "unavailable_after_passed",
        reason:
          "{url} carries unavailable_after: {date}, which has passed. Google does not show the page in search results after that date.",
      },
    ],
    fix: "Remove the directive, or remove the URL from sitemaps and include patterns if it should stay out of search.",
    citations: [
      {
        source_id: "G-ROBOTS-META",
        section: "Valid indexing and serving rules: noindex",
        quote: "Do not show this page, media, or resource in search results.",
      },
      {
        source_id: "G-ROBOTS-META",
        section: "unavailable_after",
        quote: "Do not show this page in search results after the specified date/time.",
      },
    ],
    notes:
      "When intent was inferred (no sitemap, no include patterns), noindexed pages are not in I, so this rule can fail only for the home page. {intent_source} is \"it is in {sitemap}\", \"it matches include pattern {pattern}\" or \"it is the home page\".",
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-IDX-02",
    title: "noindex is not hidden behind a robots.txt disallow",
    class: "C1",
    weight: 8,
    gate: null,
    category: "indexing",
    scope: "fetched URLs with an effective Google noindex",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "noindex_behind_disallow",
        reason:
          "{url} carries noindex ({directive_source}), but robots.txt disallows it for Googlebot ({rule}, line {line}). Google cannot read rules on pages it may not crawl, so this noindex is ignored and the URL can still be indexed from links.",
      },
    ],
    fix: "Remove the disallow for URLs that rely on noindex.",
    citations: [
      {
        source_id: "G-NOINDEX",
        section: "Block Search indexing with noindex",
        quote:
          "For the noindex rule to be effective, the page or resource must not be blocked by a robots.txt file, and it has to be otherwise accessible to the crawler.",
      },
      {
        source_id: "G-ROBOTS-META",
        section: "Combining robots.txt rules with indexing and serving rules",
        quote:
          "If a page is disallowed from crawling through the robots.txt file, then any information about indexing or serving rules will not be found and will therefore be ignored.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-IDX-03",
    title: "noindex is not placed in robots.txt",
    class: "C1",
    weight: 8,
    gate: null,
    category: "indexing",
    scope: "each in-scope origin",
    scopeKind: "origin",
    engines: ["google"],
    book: "EXPLICITLY DISMISSED (as a mechanism), SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "noindex_in_robots_txt",
        reason:
          "robots.txt line {line} reads {text}. Google does not support noindex in robots.txt, so the URLs it targets remain indexable.",
      },
    ],
    fix: "Use a robots meta tag or an X-Robots-Tag: noindex header on crawlable URLs.",
    citations: [
      {
        source_id: "G-NOINDEX",
        section: "Block Search indexing with noindex",
        quote:
          "Specifying the noindex rule in the robots.txt file is not supported by Google.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-IDX-04",
    title: "Server HTML does not carry a noindex that JavaScript removes",
    class: "C1",
    weight: 8,
    gate: null,
    category: "indexing",
    scope: "fetched pages",
    scopeKind: "page",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    requires: ["rendered"],
    conditions: [
      {
        code: "raw_noindex_removed_by_js",
        reason:
          "The server HTML of {url} contains noindex ({directive_source}), and JavaScript removes it after rendering. When Google encounters noindex it may skip rendering and JavaScript execution, so the noindex in the server HTML may be the rule Google applies.",
      },
    ],
    fix: "Decide indexability on the server and ship the final robots meta in the initial HTML.",
    citations: [
      {
        source_id: "G-JS",
        section: "Use meta robots tags carefully",
        quote:
          "When Google encounters the noindex tag, it may skip rendering and JavaScript execution, which means using JavaScript to change or remove the robots meta tag from noindex may not work as expected.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-IDX-01",
    title: "noindex inventory",
    class: "C4",
    weight: 0,
    gate: null,
    category: "indexing",
    scope: "fetched pages",
    scopeKind: "page",
    engines: ["google"],
    book: "SUPPORTED",
    conditions: [
      {
        code: "inventory",
        reason: "{url} carries noindex via {directive_source}{intended_clause}.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-NOINDEX",
        section: "Implementing noindex",
        quote: "with either a <meta> tag or HTTP response header",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-IDX-05",
    title: "How robots directives combine",
    class: "C4",
    weight: 0,
    gate: null,
    category: "indexing",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "combined",
        reason:
          "{url} has more than one robots input ({inputs}); the effective result is {effective}.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-ROBOTS-META",
        section: "",
        quote: "In the case of conflicting robots rules, the more restrictive rule applies.",
      },
      {
        source_id: "G-ROBOTS-META",
        section: "",
        quote: "the search engine will use the sum of the negative rules",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-IDX-07",
    title: "JavaScript changes robots directives",
    class: "C4",
    weight: 0,
    gate: null,
    category: "indexing",
    scope: "fetched pages",
    scopeKind: "page",
    engines: ["google"],
    book: "",
    requires: ["rendered"],
    conditions: [
      {
        code: "directives_changed",
        reason:
          "JavaScript changes the effective robots directives of {url} from {raw_directives} to {rendered_directives}.",
      },
    ],
    fix: null,
    citations: [],
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
];
