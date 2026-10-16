import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.3 robots.txt. */
export const ROBOTS_RULES: Rule[] = [
  {
    id: "SEO-ROBOTS-02",
    title: "robots.txt is UTF-8 text",
    class: "C1",
    weight: 8,
    gate: null,
    category: "robots",
    scope: "each in-scope origin with a 2xx robots.txt",
    scopeKind: "origin",
    engines: ["google"],
    book: "REQUIRED, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "invalid_utf8",
        reason:
          "robots.txt on {origin} is not valid UTF-8 (first invalid byte on line {line}). Google requires a UTF-8 encoded plain text file and ignores invalid lines, so rules on the affected lines may not apply.",
      },
    ],
    fix: "Save and serve robots.txt as UTF-8.",
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "File format",
        quote:
          "The robots.txt file must be a UTF-8 encoded plain text file and the lines must be separated by CR, CR/LF, or LF.",
      },
      {
        source_id: "G-ROBOTS-SPEC",
        section: "File format",
        quote:
          "Google ignores invalid lines in robots.txt files, including the Unicode Byte Order Mark (BOM) at the beginning of the robots.txt file, and use only valid lines.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-03",
    title: "robots.txt is smaller than 500 KiB",
    class: "C1",
    weight: 8,
    gate: null,
    category: "robots",
    scope: "each in-scope origin with a 2xx robots.txt",
    scopeKind: "origin",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC, STANDARD",
    conditions: [
      {
        code: "over_limit",
        reason:
          "robots.txt on {origin} is {bytes} bytes. Google enforces a 500 KiB limit and ignores content after it; {n} rules from line {line} onward fall beyond the limit.",
      },
    ],
    fix: "Consolidate rules with wildcards, or move unneeded rules out.",
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "File format",
        quote:
          "Google enforces a robots.txt file size limit of 500 kibibytes (KiB). Content which is after the maximum file size is ignored.",
      },
      {
        source_id: "RFC9309",
        section: "2.5 Limits",
        quote: "The parsing limit MUST be at least 500 kibibytes [KiB].",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-03-HC",
    title: "robots.txt larger than 100 KiB (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "robots",
    scope: "each in-scope origin with a 2xx robots.txt",
    scopeKind: "origin",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "over_100kib",
        reason:
          "robots.txt on {origin} is {bytes} bytes. Google's documented limit is 500 KiB; the 102,400-byte warning is a house convention.",
      },
    ],
    fix: null,
    citations: [],
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-04",
    title: "robots.txt is reachable",
    class: "C1",
    weight: 8,
    gate: null,
    category: "robots",
    scope: "each in-scope origin",
    scopeKind: "origin",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC, STANDARD",
    conditions: [
      {
        code: "server_error",
        reason:
          "robots.txt on {origin} returned {outcome}. For the first 12 hours, Google stops crawling the site but keeps trying to fetch robots.txt; after that it uses the last good version for up to 30 days. RFC 9309 tells crawlers to assume complete disallow when robots.txt is unreachable.",
      },
      {
        code: "unreachable",
        reason:
          "robots.txt on {origin} returned {outcome}. For the first 12 hours, Google stops crawling the site but keeps trying to fetch robots.txt; after that it uses the last good version for up to 30 days. RFC 9309 tells crawlers to assume complete disallow when robots.txt is unreachable.",
      },
    ],
    fix: "Serve robots.txt from static storage or the edge so it answers 200 (or a deliberate 404) even during maintenance or overload.",
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "Handling of errors and HTTP status codes",
        quote:
          "For the first 12 hours, Google stops crawling the site but keeps trying to fetch the robots.txt file. If Google can't fetch a new version, for the next 30 days Google will use the last good version, while still trying to fetch a new version.",
      },
      {
        source_id: "RFC9309",
        section: "2.3.1.4 Unreachable Status",
        quote:
          "If the robots.txt file is unreachable due to server or network errors, this means the robots.txt file is undefined and the crawler MUST assume complete disallow.",
      },
    ],
    notes:
      "A single scan observes one moment, but the documented consequence applies whenever the condition occurs, so it is scored. A 404 is not a failure: Google treats it \"as if a valid robots.txt file didn't exist.\"",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-05A",
    title: "Search crawlers may fetch every intended URL",
    class: "C1",
    weight: 8,
    gate: { kind: "indexing" },
    category: "robots",
    scope: "each member of I",
    scopeKind: "intended",
    engines: ["google", "bing"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "disallowed_googlebot",
        reason:
          "{url} is disallowed for Googlebot by {rule} (robots.txt line {line}, group {group}). That Googlebot isn't blocked is one of Google's technical requirements for indexing. Google may still index the URL from links elsewhere, but without reading the page, and the result won't have a description.",
      },
      {
        code: "disallowed_bingbot",
        reason:
          "{url} is disallowed for bingbot by {rule} (robots.txt line {line}, group {group}). Under the Robots Exclusion Protocol, bingbot should not crawl it.",
      },
    ],
    fix: "Remove or narrow the rule. If the URL should not be in search results, take it out of sitemaps and use noindex on a crawlable URL instead, because robots.txt does not keep pages out of Google.",
    citations: [
      {
        source_id: "G-TECH",
        section: "Googlebot isn't blocked",
        quote: null,
        conditions: ["disallowed_googlebot"],
      },
      {
        source_id: "G-ROBOTS-INTRO",
        section: "Understand the limitations of a robots.txt file",
        quote: "can still be indexed if linked to from other sites",
        conditions: ["disallowed_googlebot"],
      },
      {
        source_id: "G-ROBOTS-INTRO",
        section: "What is a robots.txt file used for?",
        quote: "the search result won't have a description",
        conditions: ["disallowed_googlebot"],
      },
      {
        source_id: "RFC9309",
        section: "2.2.2 The \"Allow\" and \"Disallow\" Lines",
        quote:
          "These lines indicate whether accessing a URI that matches the corresponding path is allowed or disallowed.",
        conditions: ["disallowed_bingbot"],
      },
      {
        source_id: "B-ROBOTS-2012",
        section: "robots.txt",
        quote: "BingBot will ignore all the other directives",
        conditions: ["disallowed_bingbot"],
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-05B",
    title: "Resources needed for rendering are crawlable",
    class: "C2",
    weight: 4,
    gate: null,
    category: "robots",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "resources_disallowed",
        reason:
          "{n} resources used to render {url} are disallowed for Googlebot, for example {example} by {rule}. Google recommends letting it crawl the resources needed to render a page, and says not to block them if their absence makes the page harder to understand.",
      },
    ],
    fix: "Allow the CSS, JavaScript and image paths that templates load.",
    citations: [
      {
        source_id: "G-MOBILE",
        section: "Make sure that Google can access and render your content",
        quote: "Let Google crawl your resources.",
      },
      {
        source_id: "G-ROBOTS-INTRO",
        section: "What is a robots.txt file used for?",
        quote: "don't block them",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-08",
    title: "Sitemap lines are fully qualified URLs",
    class: "C1",
    weight: 8,
    gate: null,
    category: "robots",
    scope: "each in-scope origin with Sitemap lines",
    scopeKind: "origin",
    engines: ["google"],
    book: "OPTIONAL (field), with a documented format requirement",
    conditions: [
      {
        code: "not_fully_qualified",
        reason:
          "robots.txt line {line} declares Sitemap: {value}. Google requires this field to be a fully qualified URL, including the protocol and host, so the line cannot be used.",
      },
    ],
    fix: "Write the absolute URL, for example Sitemap: https://www.example.com/sitemap.xml.",
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "sitemap",
        quote:
          "It must be a fully qualified URL, including the protocol and host, and doesn't have to be URL-encoded.",
      },
    ],
    notes:
      "Declaring a sitemap in robots.txt is optional. Sitemaps that cannot be retrieved are judged by SEO-SITEMAP-07.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-09",
    title: "Staging hosts require authentication",
    class: "C2",
    weight: 4,
    gate: null,
    category: "robots",
    scope: "each configured staging host",
    scopeKind: "host",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION",
    requires: ["config"],
    conditions: [
      {
        code: "staging_public",
        reason:
          "{host} answered {status} without credentials. robots.txt is not a mechanism for keeping pages out of Google; Google's guidance is to block indexing with noindex or to password-protect the page.",
      },
    ],
    fix: "Put HTTP authentication or SSO in front of every non-production environment.",
    citations: [
      {
        source_id: "G-ROBOTS-INTRO",
        section: "Introduction to robots.txt",
        quote: "is not a mechanism for keeping a web page out of Google",
      },
      {
        source_id: "G-ROBOTS-INTRO",
        section: "Introduction to robots.txt",
        quote:
          "To keep a web page out of Google, block indexing with noindex or password-protect the page.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-01",
    title: "robots.txt summary",
    class: "C4",
    weight: 0,
    gate: null,
    category: "robots",
    scope: "each in-scope and variant origin",
    scopeKind: "origin",
    engines: [],
    book: "REQUIRED, STANDARD (location)",
    conditions: [
      {
        code: "summary",
        reason:
          "robots.txt on {origin} returned {outcome} ({bytes} bytes, {hops} redirect hops, {groups} groups at lines {group_lines}, {sitemaps} Sitemap lines).{interpretation_clause}",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "File location and range of validity",
        quote: null,
      },
      {
        source_id: "G-ROBOTS-SPEC",
        section: "Handling of errors and HTTP status codes",
        quote: null,
      },
      {
        source_id: "RFC9309",
        section: "2.3 Access Method",
        quote: null,
      },
    ],
    notes:
      "{interpretation_clause} is Google's interpretation of the status: for a 4xx other than 429 it is \" Google's crawlers treat all 4xx errors, except 429, as if a valid robots.txt file didn't exist\"; otherwise it is empty. The location requirement is satisfied by construction because the scanner only reads /robots.txt.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-07",
    title: "Named crawler groups replace the * group",
    class: "C4",
    weight: 0,
    gate: null,
    category: "robots",
    scope: "each in-scope origin",
    scopeKind: "origin",
    engines: ["google", "bing"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "shadowed_rules",
        reason:
          "robots.txt has a group for {token} (line {line}). {crawler} follows only that group, so these rules from the * group do not apply to it: {rules}. If they should, repeat them in the {token} group.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "Order of precedence for user agents",
        quote: "the group with the most specific user agent that matches",
      },
      {
        source_id: "B-ROBOTS-2012",
        section: "robots.txt",
        quote: "BingBot will ignore all the other directives",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-ROBOTS-10",
    title: "Lines Google ignores",
    class: "C4",
    weight: 0,
    gate: null,
    category: "robots",
    scope: "each in-scope origin",
    scopeKind: "origin",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "ignored_lines",
        reason:
          "Google ignores {n} lines in robots.txt on {origin}: {lines}.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-ROBOTS-SPEC",
        section: "Syntax",
        quote: "other fields such as crawl-delay aren't supported",
      },
      {
        source_id: "G-ROBOTS-SPEC",
        section: "File format",
        quote:
          "Google ignores invalid lines in robots.txt files, including the Unicode Byte Order Mark (BOM) at the beginning of the robots.txt file, and use only valid lines.",
      },
    ],
    notes:
      "Bing said in 2012 that bingbot honors crawl-delay (B-ROBOTS-2012), so the info text names the engine. noindex lines are reported by SEO-IDX-03.",
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
];
