import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.2 Hosts and URLs. */
export const URL_RULES: Rule[] = [
  {
    id: "SEO-URL-01",
    title: "Host and protocol variants redirect to the preferred origin",
    class: "C2",
    weight: 4,
    gate: null,
    category: "urls",
    scope: "site",
    scopeKind: "site",
    engines: ["google", "bing"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "variant_serves_content",
        reason:
          "{variant_url} returns 200 instead of redirecting to {expected}, so the same content is available at two addresses. Google treats a redirect as a strong signal that its target should become canonical, and Bing recommends 301 redirects to consolidate variants into a single preferred URL.",
      },
      {
        code: "variant_temporary_redirect",
        reason:
          "{variant_url} redirects to {target} with {status}, a temporary redirect. Variants should consolidate to the preferred URL with a permanent 301 or 308.",
      },
      {
        code: "variant_wrong_target",
        reason:
          "{variant_url} redirects to {target}, not to {expected}. The path and query should be preserved so each variant lands on its exact preferred equivalent.",
      },
      {
        code: "variant_multi_hop",
        reason:
          "{variant_url} reaches {expected} only after {hops} redirects ({chain}). Google advises redirecting to the final destination directly.",
      },
    ],
    fix: "Configure one edge rule that sends every variant (scheme and host) to the preferred origin in a single 301 or 308, preserving path and query.",
    citations: [
      {
        source_id: "G-CANON",
        section: "Methods",
        quote:
          "A strong signal that the target of the redirect should become canonical.",
      },
      {
        source_id: "B-DUP",
        section: "How to fix it",
        quote:
          "Use 301 redirects to consolidate variants into a single preferred URL.",
      },
      {
        source_id: "G-SITEMOVE",
        section: "Avoid chaining redirects",
        quote:
          "While Googlebot can follow up to 10 hops in a \"chain\" of multiple redirects (for example, Page 1 > Page 2 > Page 3), we advise redirecting to the final destination directly.",
      },
    ],
    notes:
      "Variants that do not resolve in DNS are not_applicable. Certificate failures on variants belong to SEO-HTTP-07. Variant probes are excluded from SEO-REDIR-03 so the same chain is not scored twice.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-URL-02",
    title: "URLs contain only characters allowed in a URI",
    class: "C3",
    weight: 2,
    gate: null,
    category: "urls",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "RFC 3986",
    book: "REQUIRED, STANDARD (reclassified, §1.4)",
    conditions: [
      {
        code: "invalid_characters",
        reason:
          "{n} URLs on {url} contain characters that RFC 3986 (IETF STD 66) does not allow unencoded, for example “{example}” (character {char}). Google supports URLs as defined by IETF STD 66.",
      },
      {
        code: "bad_percent_encoding",
        reason:
          "{n} URLs on {url} contain malformed percent-encoding, for example “{example}”. RFC 3986 percent-encoding is a % followed by two hexadecimal digits.",
      },
    ],
    fix: "Generate every URL with a standards-compliant encoder (encode path segments and query values separately).",
    citations: [
      {
        source_id: "RFC3986",
        section: "2. Characters",
        quote:
          "A URI is composed from a limited set of characters consisting of digits, letters, and a few graphic symbols.",
      },
      {
        source_id: "RFC3986",
        section: "2.2 Reserved Characters",
        quote:
          "If data for a URI component would conflict with a reserved character's purpose as a delimiter, then the conflicting data must be percent-encoded before the URI is formed.",
      },
      {
        source_id: "G-URL",
        section: "Follow IETF STD 66",
        quote: "URLs as defined by IETF STD 66",
      },
    ],
    notes:
      "Non-ASCII characters are counted in observed.non_ascii_count and are not failures: they are valid in IRIs, and browsers encode them. No engine documents a consequence for these characters, so the rule is a standards finding.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-URL-03",
    title: "Words in URL paths are separated by hyphens",
    class: "C2",
    weight: 4,
    gate: null,
    category: "urls",
    scope: "each member of I",
    scopeKind: "intended",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "underscore_in_path",
        reason:
          "The path of {url} separates words with underscores. Google recommends hyphens instead of underscores to separate words in URLs.",
      },
    ],
    fix: "Use hyphens in slugs for new URLs. For existing URLs, weigh the change carefully and, if you make it, add a permanent redirect from every old URL.",
    citations: [
      {
        source_id: "G-URL",
        section: "Use hyphens to separate words",
        quote:
          "we recommend using hyphens (-) instead of underscores (_) to separate words in your URLs",
      },
      {
        source_id: "G-STARTER",
        section: "Things we believe you shouldn't focus on",
        quote: "alone have hardly any effect beyond appearing in breadcrumbs",
      },
    ],
    notes:
      "The reason must not claim a ranking effect. The second citation is included so readers can weigh the cost of changing existing URLs.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-URL-03-HC",
    title: "Lowercase paths (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "urls",
    scope: "each member of I",
    scopeKind: "intended",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "uppercase_in_path",
        reason:
          "Lowercase paths are a house convention; Google treats URLs as case sensitive, so mixed case risks duplicates (see SEO-URL-05).",
      },
    ],
    fix: null,
    citations: [],
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-URL-04",
    title: "Content is not routed through URL fragments",
    class: "C2",
    weight: 4,
    gate: null,
    category: "urls",
    scope: "site",
    scopeKind: "site",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "fragment_routes",
        reason:
          "{n} internal links use fragment-based routes, for example {example}. Google Search generally doesn't support URL fragments and recommends the History API for routing between views of a web app.",
      },
    ],
    fix: "Give each view a real path or query URL and route with the History API.",
    citations: [
      {
        source_id: "G-URL",
        section: "Don't use URL fragments to change content",
        quote: "Google Search generally doesn't support URL fragments.",
      },
      {
        source_id: "G-JS",
        section: "Use the History API instead of fragments",
        quote:
          "use the History API to implement routing between different views of your web app.",
      },
    ],
    notes:
      "Ordinary in-page anchors (#reviews) are not fragment routes and never fail this rule.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-URL-05",
    title: "One URL per resource regardless of letter case",
    class: "C2",
    weight: 4,
    gate: null,
    category: "urls",
    scope: "site",
    scopeKind: "site",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "case_duplicates",
        reason:
          "{urls} differ only in letter case, each returns 200, and they do not agree on one canonical. Google's URL handling is case sensitive, so it treats them as different URLs. Google recommends linking within your site to the canonical URL rather than a duplicate.",
      },
    ],
    fix: "Redirect case variants to one form, or have all variants declare the same canonical; generate internal links in a single case.",
    citations: [
      {
        source_id: "G-URL",
        section: "Be aware that URLs are case sensitive",
        quote: "is case sensitive",
      },
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "When linking within your site, link to the canonical URL rather than a duplicate URL.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-URL-06",
    title: "Query parameters use & separators",
    class: "C4",
    weight: 0,
    gate: null,
    category: "urls",
    scope: "site",
    scopeKind: "site",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION (detection cannot confirm intent)",
    conditions: [
      {
        code: "separator_characters",
        reason:
          "{n} internal URLs contain characters Google says are hard for crawlers to recognize as parameter separators, for example {example}. Review whether they are used as separators.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-FACET",
        section: "Ensure the faceted navigation URLs are optimal for the web",
        quote: null,
      },
    ],
    notes:
      "Informational because the scanner cannot tell a separator from a value.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
