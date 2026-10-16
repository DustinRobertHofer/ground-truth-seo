import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.6 Canonicalization. */
export const CANONICAL_RULES: Rule[] = [
  {
    id: "SEO-CANON-01",
    title: "The canonical link is inside the head",
    class: "C1",
    weight: 8,
    gate: null,
    category: "canonical",
    scope: "pages in P with at least one link[rel~=canonical]",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "outside_head",
        reason:
          "Google accepts rel=\"canonical\" only in the <head>. On {url} the canonical element (line {line}) is in <body>{culprit_clause}, so Google will not accept it.",
      },
    ],
    fix: "Emit the canonical in the server-rendered head, before any third-party snippet, and fix the culprit reported by SEO-HEAD-05.",
    citations: [
      {
        source_id: "G-CANON",
        section: "rel=\"canonical\" link element",
        quote:
          "The rel=\"canonical\" link element is only accepted if it appears in the <head> section of the HTML",
      },
    ],
    notes:
      "{culprit_clause} = \" because the parser closed <head> at line {head_closed_line}, where it met {culprit}\" when SEO-HEAD-05 found a culprit.",
    related: ["SEO-HEAD-05"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-CANON-02",
    title: "Canonical URLs are absolute",
    class: "C2",
    weight: 4,
    gate: null,
    category: "canonical",
    scope: "pages in P with a head canonical",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "relative",
        reason:
          "The canonical on {url} is “{href}”, a relative reference. Google recommends absolute URLs in rel=\"canonical\". (RFC 6596 allows relative references; Google's guidance is stricter.)",
      },
      {
        code: "empty_href",
        reason: "The canonical element on {url} has no URL.",
      },
    ],
    fix: "Build canonical URLs from the configured base URL, never from the request's Host header.",
    citations: [
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "Use absolute paths rather than relative paths with the rel=\"canonical\" link element.",
      },
      {
        source_id: "RFC6596",
        section: "3. The Canonical Link Relation",
        quote: "Specify a relative IRI (see [RFC3986], Section 4.2).",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-CANON-08",
    title: "One canonical URL per page",
    class: "C2",
    weight: 4,
    gate: null,
    category: "canonical",
    scope: "pages in P with any canonical",
    scopeKind: "page",
    engines: ["google"],
    book: "STANDARD, DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "conflicting_canonicals",
        reason:
          "{url} declares {n} different canonical URLs ({list}). Google advises against specifying different URLs as canonical for the same page using different techniques, and RFC 6596 says to specify only one canonical link relation for a resource.",
      },
    ],
    fix: "Emit one canonical, from one function, in one place.",
    citations: [
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "Don't specify different URLs as canonical for the same page using different canonicalization techniques",
      },
      {
        source_id: "RFC6596",
        section: "3. The Canonical Link Relation",
        quote: "Specify only one canonical link relation for a resource.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-CANON-04",
    title: "The canonical target is a usable target",
    class: "C3",
    weight: 2,
    gate: null,
    category: "canonical",
    scope: "pages in P whose head canonical differs from their own URL",
    scopeKind: "page",
    engines: [],
    standard: "RFC 6596",
    book: "REQUIRED, STANDARD (Deliverable 5 frames the duplicate-or-superset MUST; the conditions below are the RFC's avoid list)",
    conditions: [
      {
        code: "target_error",
        reason:
          "{url} names {target} as canonical, but it returned {outcome}. RFC 6596 recommends avoiding a canonical target that returns an error code.",
      },
      {
        code: "target_permanent_redirect",
        reason:
          "{url} names {target} as canonical, but {target} permanently redirects to {final}. RFC 6596 recommends avoiding the source of a permanent redirect as the canonical target.",
      },
      {
        code: "target_canonical_chain",
        reason:
          "{url} names {target} as canonical, and {target} names {third} as its own canonical. RFC 6596 recommends avoiding a target that specifies a canonical other than itself.",
      },
    ],
    fix: "Point the canonical straight at the final, 200, self-canonical URL.",
    citations: [
      {
        source_id: "RFC6596",
        section: "3. The Canonical Link Relation",
        quote: "Avoid designating the target (canonical) as:",
      },
      {
        source_id: "RFC6596",
        section: "3. The Canonical Link Relation",
        quote:
          "The source IRI of a permanent redirect (for HTTP, this refers to 300 and 301 response codes, defined in Sections 10.3.1 and 10.3.2 of [RFC2616]).",
        conditions: ["target_permanent_redirect"],
      },
      {
        source_id: "RFC6596",
        section: "3. The Canonical Link Relation",
        quote:
          "An IRI that also specifies a canonical link relation to an IRI other than itself.",
        conditions: ["target_canonical_chain"],
      },
      {
        source_id: "RFC6596",
        section: "3. The Canonical Link Relation",
        quote:
          "An IRI that returns an error code, such as a 4xx response in HTTP (Section 10.4 of [RFC2616]).",
        conditions: ["target_error"],
      },
    ],
    notes:
      "308 did not exist when RFC 6596 was published; the scanner treats it like 301 by analogy, and the reason says \"permanently redirects\". The RFC explicitly allows a temporary-redirect source as a target, so 302, 303 and 307 never fail here. Whether the target is truly a duplicate or superset is a manual check (§5).",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-CANON-05",
    title: "Internal links and hreflang point to canonical URLs",
    class: "C2",
    weight: 4,
    gate: null,
    category: "canonical",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "links_to_redirects",
        reason:
          "{url} links to {n} URLs that redirect, for example {example} (redirects to {final}). Google recommends linking within your site to the canonical URL rather than a duplicate.",
      },
      {
        code: "links_to_non_canonical",
        reason:
          "{url} links to {n} URLs that name another URL as canonical, for example {example} (canonical: {canonical}). Google recommends linking within your site to the canonical URL rather than a duplicate.",
      },
      {
        code: "hreflang_to_non_canonical",
        reason:
          "{url} lists {n} hreflang alternates that are not canonical, for example {example} ({target_problem}). Google advises against specifying different URLs as canonical for the same page using different techniques.",
      },
    ],
    fix: "Generate internal links and hreflang URLs from the same canonical-URL function the canonical tag uses.",
    citations: [
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "When linking within your site, link to the canonical URL rather than a duplicate URL.",
        conditions: ["links_to_redirects", "links_to_non_canonical"],
      },
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "Don't specify different URLs as canonical for the same page using different canonicalization techniques",
        conditions: ["hreflang_to_non_canonical"],
      },
    ],
    notes:
      "{target_problem} is \"redirects to {final}\" or \"names {canonical} as canonical\".",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-CANON-07",
    title: "noindex and robots.txt are not used to choose canonicals",
    class: "C2",
    weight: 4,
    gate: null,
    category: "canonical",
    scope: "fetched pages with a head canonical that differs from their own URL",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "noindex_with_cross_canonical",
        reason:
          "{url} carries noindex and also names {target} as canonical. Google advises against using noindex to choose a canonical, because it will completely block the page from Search.",
      },
      {
        code: "target_noindex",
        reason:
          "{url} names {target} as canonical, but {target} carries noindex. Google advises against using noindex for canonicalization, because it will completely block the page from Search.",
      },
      {
        code: "target_disallowed",
        reason:
          "{url} names {target} as canonical, but robots.txt disallows {target} for Googlebot ({rule}). Google advises against using robots.txt for canonicalization.",
      },
    ],
    fix: "Consolidate duplicates with a 301 or a canonical to a crawlable, indexable URL.",
    citations: [
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote: "Don't use the robots.txt file for canonicalization purposes",
        conditions: ["target_disallowed"],
      },
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote: "it will completely block the page from Search.",
        conditions: ["noindex_with_cross_canonical", "target_noindex"],
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-CANON-03",
    title: "Canonical inventory",
    class: "C4",
    weight: 0,
    gate: null,
    category: "canonical",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "SUPPORTED, OPTIONAL",
    conditions: [
      {
        code: "self_referencing",
        reason: "{url} names itself as canonical.",
      },
      {
        code: "cross_page",
        reason: "{url} names {target} as canonical.",
      },
      {
        code: "absent",
        reason:
          "{url} has no canonical. Google says of canonicalization methods that \"none of them are required.\"",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-CANON",
        section: "Methods",
        quote: null,
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-CANON-06",
    title: "Canonical headers on non-HTML files",
    class: "C4",
    weight: 0,
    gate: null,
    category: "canonical",
    scope: "fetched non-HTML URLs",
    scopeKind: "page",
    engines: [],
    book: "SUPPORTED",
    conditions: [
      {
        code: "canonical_header",
        reason:
          "{url} sends a Link: rel=\"canonical\" header naming {target}, which is {absoluteness}.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-CANON",
        section: "rel=\"canonical\" HTTP header",
        quote: null,
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
