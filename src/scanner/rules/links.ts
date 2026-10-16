import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.8 Links and headings. */
export const LINK_RULES: Rule[] = [
  {
    id: "SEO-LINK-02",
    title: "Every intended page is linked from another page",
    class: "C2",
    weight: 4,
    gate: null,
    category: "links",
    scope: "members of I other than home pages",
    scopeKind: "intended",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    requires: ["complete-crawl"],
    conditions: [
      {
        code: "orphan",
        reason:
          "{url} is in {intent_source} but no crawled page links to it with a crawlable <a href>. Google recommends that every page you care about have a link from at least one other page on your site.",
      },
      {
        code: "only_nofollow",
        reason:
          "Every internal link to {url} carries nofollow ({n} links). Google says such links will generally not be followed, so these links may not help it discover the page.",
      },
    ],
    fix: "Link the page from a hub, category or related-content block; keep internal links followed.",
    citations: [
      {
        source_id: "G-LINKS",
        section: "Internal links",
        quote:
          "Every page you care about should have a link from at least one other page on your site.",
      },
      {
        source_id: "G-QUALIFY",
        section: "Multiple values",
        quote: "will generally not be followed",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-LINK-03",
    title: "Anchor text is descriptive",
    class: "C2",
    weight: 4,
    gate: null,
    category: "links",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "generic_text",
        reason:
          "{n} links on {url} use generic anchor text such as “{text}” (pointing to {target}). Google lists text like this as a bad example and recommends anchor text that is descriptive, reasonably concise, and relevant to both pages.",
      },
      {
        code: "empty_text",
        reason:
          "{n} links on {url} have neither text nor image alt text, for example the link to {target}. Google notes that alt text is useful as anchor text when an image is used as a link.",
      },
      {
        code: "aria_label_only",
        info: true,
        reason:
          "{n} links on {url} are named only through aria-label, for example the link to {target}. Google's documentation does not say whether it reads aria-label as anchor text.",
      },
    ],
    fix: "Describe the destination in the link text; give linked images descriptive alt text.",
    citations: [
      {
        source_id: "G-LINKS",
        section: "Anchor text placement",
        quote:
          "Good anchor text is descriptive, reasonably concise, and relevant to the page that it's on and to the page it links to.",
      },
      {
        source_id: "G-IMAGES",
        section: "Use descriptive alt text",
        quote:
          "Also, alt text in images is useful as anchor text if you decide to use an image as a link.",
      },
    ],
    notes:
      "Links named only through aria-label are reported as info (aria_label_only): Google's documentation does not say whether it reads them as anchor text.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HDG-02",
    title: "Heading levels do not skip",
    class: "C3",
    weight: 2,
    gate: null,
    category: "links",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "the HTML Standard",
    book: "STANDARD",
    conditions: [
      {
        code: "skipped_level",
        reason:
          "On {url}, an <h{a}> (“{text_a}”, line {line_a}) is followed by an <h{b}> (“{text_b}”, line {line_b}), skipping a level. The HTML Standard requires each heading to be at most one level deeper than the heading before it. Google says heading order does not matter for Search, so this is a standards and accessibility finding.",
      },
    ],
    fix: "Choose heading levels by structure, not by visual size.",
    citations: [
      {
        source_id: "WHATWG-SECTIONS",
        section: "Headings and outlines",
        quote:
          "must have a heading level that is less than, equal to, or 1 greater than",
      },
      {
        source_id: "W3C-HEADINGS",
        section: "Heading ranks",
        quote: "should be avoided where possible",
      },
      {
        source_id: "G-STARTER",
        section: "Things we believe you shouldn't focus on",
        quote:
          "from Google Search perspective, it doesn't matter if you're using them out of order.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HDG-01",
    title: "Heading inventory",
    class: "C4",
    weight: 0,
    gate: null,
    category: "links",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "SUPPORTED",
    conditions: [
      {
        code: "inventory",
        reason:
          "{url} has {n} h1 elements; the first reads “{text}”. Google lists heading elements among title-link sources and notes that with several large, prominent headings it \"may use the first heading as the text for the title link.\"",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-TITLE",
        section: "How title links in Google Search are created",
        quote: null,
      },
      {
        source_id: "G-TITLE",
        section: "Common issues and how Google manages them (No clear main title)",
        quote: "may use the first heading as the text for the title link.",
      },
    ],
    notes: "Never fails for zero or several h1 elements (§6).",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-LINK-01",
    title: "Links Google cannot crawl",
    class: "C4",
    weight: 0,
    gate: null,
    category: "links",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED (for that link to be crawled)",
    conditions: [
      {
        code: "uncrawlable",
        reason:
          "{n} links on {url} cannot be crawled by Google ({kinds}), for example {example}. \"Google can only crawl your link if it's an <a> HTML element (also known as anchor element) with an href attribute.\"",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-LINKS",
        section: "Make your links crawlable",
        quote:
          "Google can only crawl your link if it's an <a> HTML element (also known as anchor element) with an href attribute.",
      },
    ],
    notes:
      "{kinds} lists the observed kinds among: anchors without href, javascript: URLs, href on non-anchor elements, routerLink attributes. Informational because the scanner cannot tell navigation from in-page controls; the consequence for discovery is scored by SEO-LINK-02.",
    related: ["SEO-LINK-02"],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-LINK-06",
    title: "Internal links to error URLs",
    class: "C4",
    weight: 0,
    gate: null,
    category: "links",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "",
    conditions: [
      {
        code: "error_targets",
        reason:
          "{n} internal links on {url} point to URLs that returned 4xx or 5xx, for example the link to {target} ({status}). No primary source assigns this a search-specific weight; it is listed because it wastes crawling and frustrates users.",
      },
    ],
    fix: null,
    citations: [],
    notes:
      "No primary source assigns this a search-specific weight; it is listed because it wastes crawling and frustrates users.",
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
];
