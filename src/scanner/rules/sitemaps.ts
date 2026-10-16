import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.7 Sitemaps. */
export const SITEMAP_RULES: Rule[] = [
  {
    id: "SEO-SITEMAP-07",
    title: "Declared sitemaps can be retrieved and read",
    class: "C1",
    weight: 8,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file found",
    scopeKind: "sitemap",
    engines: ["google", "bing"],
    book: "STANDARD (the Sitemaps protocol defines the mechanism, §2.1)",
    conditions: [
      {
        code: "not_ok",
        reason:
          "The sitemap {sitemap} returned {outcome}, so the URLs it lists cannot be read from it.",
      },
      {
        code: "not_well_formed",
        reason:
          "The sitemap {sitemap} is not well-formed XML ({error} at line {line}, column {column}). The Sitemaps protocol requires a UTF-8 XML file with every data value entity-escaped.",
      },
      {
        code: "wrong_root",
        reason:
          "The sitemap {sitemap} has the root element <{root}>. The Sitemaps protocol requires <urlset> (or <sitemapindex> for an index) in the sitemap namespace.",
      },
    ],
    fix: "Generate sitemaps with an XML serializer, not string concatenation, and serve them with a 200.",
    citations: [
      {
        source_id: "SITEMAPS-ORG",
        section: "Sitemaps XML format",
        quote:
          "All data values in a Sitemap must be entity-escaped. The file itself must be UTF-8 encoded.",
      },
      {
        source_id: "SITEMAPS-ORG",
        section: "Sitemaps XML format",
        quote:
          "Begin with an opening <urlset> tag and end with a closing </urlset> tag.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-SITEMAP-01",
    title: "Sitemap files stay within protocol limits",
    class: "C1",
    weight: 8,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file",
    scopeKind: "sitemap",
    engines: ["google", "bing"],
    book: "REQUIRED, STANDARD",
    conditions: [
      {
        code: "too_many_urls",
        reason:
          "The sitemap {sitemap} has {count} {entry_kind} and is {bytes} bytes uncompressed. The Sitemaps protocol limits each file to 50,000 entries and 50MB (52,428,800 bytes), and Google applies the same limits.",
      },
      {
        code: "too_large",
        reason:
          "The sitemap {sitemap} has {count} {entry_kind} and is {bytes} bytes uncompressed. The Sitemaps protocol limits each file to 50,000 entries and 50MB (52,428,800 bytes), and Google applies the same limits.",
      },
      {
        code: "index_too_many",
        reason:
          "The sitemap {sitemap} has {count} {entry_kind} and is {bytes} bytes uncompressed. The Sitemaps protocol limits each file to 50,000 entries and 50MB (52,428,800 bytes), and Google applies the same limits.",
      },
      {
        code: "index_too_large",
        reason:
          "The sitemap {sitemap} has {count} {entry_kind} and is {bytes} bytes uncompressed. The Sitemaps protocol limits each file to 50,000 entries and 50MB (52,428,800 bytes), and Google applies the same limits.",
      },
    ],
    fix: "Split into several files and list them in a sitemap index.",
    citations: [
      {
        source_id: "SITEMAPS-ORG",
        section: "Using Sitemap index files",
        quote:
          "each Sitemap file that you provide must have no more than 50,000 URLs and must be no larger than 50MB (52,428,800 bytes).",
      },
      {
        source_id: "SITEMAPS-ORG",
        section: "Using Sitemap index files",
        quote:
          "Sitemap index files may not list more than 50,000 Sitemaps and must be no larger than 50MB (52,428,800 bytes)",
      },
      {
        source_id: "G-SITEMAP-BUILD",
        section: "Sitemap best practices",
        quote:
          "All formats limit a single sitemap to 50MB (uncompressed) or 50,000 URLs.",
      },
    ],
    notes: "{entry_kind} is \"URLs\" for a sitemap and \"sitemaps\" for an index.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-02",
    title: "Sitemap URLs are within the sitemap's scope",
    class: "C1",
    weight: 8,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file",
    scopeKind: "sitemap",
    engines: ["google", "bing"],
    book: "REQUIRED, STANDARD",
    conditions: [
      {
        code: "loc_out_of_scope",
        reason:
          "{n} URLs in {sitemap} are outside its scope, for example {example}. A sitemap at {sitemap_dir} may only list URLs on the same protocol and host under that directory, and the protocol says URLs that are not considered valid are dropped from further consideration.",
      },
    ],
    fix: "Host each sitemap at the root of the host whose URLs it lists, or declare it in that host's robots.txt.",
    citations: [
      {
        source_id: "SITEMAPS-ORG",
        section: "Sitemap file location",
        quote:
          "all URLs listed in the Sitemap must use the same protocol (http, in this example) and reside on the same host as the Sitemap.",
      },
      {
        source_id: "SITEMAPS-ORG",
        section: "Sitemap file location",
        quote: "URLs that are not considered valid are dropped from further consideration.",
      },
      {
        source_id: "G-HREFLANG",
        section: "Sitemap",
        quote:
          "a sitemap can only contain descendant URLs of the directory where the sitemap is hosted from.",
      },
    ],
    notes:
      "Sitemaps submitted directly in Search Console or Bing Webmaster Tools may be accepted for a verified property beyond these rules; the scanner cannot see submissions, so it applies the protocol. Out-of-scope URLs are not added to I.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-02B",
    title: "Sitemap URLs are absolute",
    class: "C2",
    weight: 4,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file",
    scopeKind: "sitemap",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "loc_not_absolute",
        reason:
          "{n} entries in {sitemap} are not absolute URLs, for example “{example}”. Google asks for fully-qualified, absolute URLs in sitemaps.",
      },
    ],
    fix: "Generate loc values from the canonical base URL.",
    citations: [
      {
        source_id: "G-SITEMAP-BUILD",
        section: "Sitemap best practices",
        quote: "Use fully-qualified, absolute URLs in your sitemaps.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-SITEMAP-02C",
    title: "Sitemap encoding, URL length and index scope",
    class: "C3",
    weight: 2,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file",
    scopeKind: "sitemap",
    engines: [],
    standard: "the Sitemaps protocol",
    book: "STANDARD",
    conditions: [
      {
        code: "not_utf8",
        reason:
          "The sitemap {sitemap} is not valid UTF-8 (first invalid byte at line {line}). The Sitemaps protocol requires UTF-8.",
      },
      {
        code: "loc_too_long",
        reason:
          "{n} URLs in {sitemap} are 2,048 characters or longer. The Sitemaps protocol requires loc values shorter than 2,048 characters.",
      },
      {
        code: "index_child_out_of_scope",
        reason:
          "The sitemap index {sitemap} lists {child}, which is on a different site. The Sitemaps protocol allows an index to list only sitemaps on its own site.",
      },
    ],
    fix: "Serve UTF-8; shorten or restructure very long URLs; host every listed sitemap on the index's own site.",
    citations: [
      {
        source_id: "SITEMAPS-ORG",
        section: "Sitemaps XML format",
        quote: "The file itself must be UTF-8 encoded.",
        conditions: ["not_utf8"],
      },
      {
        source_id: "SITEMAPS-ORG",
        section: "XML tag definitions (loc)",
        quote: "This value must be less than 2,048 characters.",
        conditions: ["loc_too_long"],
      },
      {
        source_id: "SITEMAPS-ORG",
        section: "Using Sitemap index files",
        quote:
          "A Sitemap index file can only specify Sitemaps that are found on the same site as the Sitemap index file.",
        conditions: ["index_child_out_of_scope"],
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-SITEMAP-03",
    title: "Sitemaps list canonical, non-redirecting URLs",
    class: "C2",
    weight: 4,
    gate: null,
    category: "sitemaps",
    scope: "each valid, fetched loc",
    scopeKind: "resource",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "redirects",
        reason:
          "{loc} is listed in {sitemap} but redirects to {final}. Google treats every URL in a sitemap as a suggested canonical, so the sitemap and the redirect send conflicting signals.",
      },
      {
        code: "not_self_canonical",
        reason:
          "{loc} is listed in {sitemap} but declares {canonical} as canonical. Google treats every URL in a sitemap as a suggested canonical, so the two signals conflict.",
      },
    ],
    fix: "List only final, self-canonical URLs; generate the sitemap from the same canonical function as the templates.",
    citations: [
      {
        source_id: "G-CANON",
        section: "Sitemap",
        quote: "All pages listed in a sitemap are suggested as canonicals",
      },
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "Don't specify different URLs as canonical for the same page using different canonicalization techniques",
      },
    ],
    notes:
      "Listed URLs that are not 200, carry noindex, or are disallowed are judged by the indexing gates (SEO-HTTP-01, SEO-IDX-06, SEO-ROBOTS-05A) and cross-referenced here, never scored twice.",
    related: ["SEO-HTTP-01", "SEO-IDX-06", "SEO-ROBOTS-05A"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-04A",
    title: "lastmod uses W3C Datetime",
    class: "C3",
    weight: 2,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file with lastmod values",
    scopeKind: "sitemap",
    engines: [],
    standard: "the Sitemaps protocol",
    book: "STANDARD",
    conditions: [
      {
        code: "invalid_lastmod",
        reason:
          "{n} lastmod values in {sitemap} are not in W3C Datetime format, for example “{example}”. The Sitemaps protocol specifies that format.",
      },
    ],
    fix: "Serialize lastmod as an ISO 8601 date-time with a time zone, for example 2026-09-18T09:30:00+00:00.",
    citations: [
      {
        source_id: "SITEMAPS-ORG",
        section: "XML tag definitions (lastmod)",
        quote: "This date should be in W3C Datetime format.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-04B",
    title: "lastmod is not in the future",
    class: "C2",
    weight: 4,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file with lastmod values",
    scopeKind: "sitemap",
    engines: ["google", "bing"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "future_lastmod",
        reason:
          "{n} lastmod values in {sitemap} are later than the scan time, for example {example}. Google uses lastmod if it is consistently and verifiably accurate, and Bing uses it to prioritize recrawling.",
      },
    ],
    fix: "Set lastmod from a stored \"content last modified\" timestamp, never from generation time or a scheduled date.",
    citations: [
      {
        source_id: "G-SITEMAP-BUILD",
        section: "XML sitemap",
        quote:
          "if it's consistently and verifiably (for example by comparing to the last modification of the page) accurate.",
      },
      {
        source_id: "B-SITEMAP-2025",
        section: "Why lastmod Still Matters for AI Powered Indexing",
        quote:
          "The lastmod field in your sitemap remains a key signal, helping Bing prioritize URLs for recrawling and reindexing, or skip them entirely if the content hasn't changed since the last crawl.",
      },
      {
        source_id: "SITEMAPS-ORG",
        section: "XML tag definitions (lastmod)",
        quote:
          "the date must be set to the date the linked page was last modified, not when the sitemap is generated.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-04C",
    title: "lastmod includes a time for Bing",
    class: "C2",
    weight: 4,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file with lastmod values",
    scopeKind: "sitemap",
    engines: ["bing"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "date_only_lastmod",
        reason:
          "{n} lastmod values in {sitemap} contain a date but no time. Bing recommends ISO 8601 lastmod values including both the date and time.",
      },
    ],
    fix: "Include the time and time zone in every lastmod value.",
    citations: [
      {
        source_id: "B-SITEMAP-2025",
        section: "Why lastmod Still Matters for AI Powered Indexing",
        quote:
          "use standard ISO 8601 date formatting for lastmod values, including both the date and time",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-SITEMAP-04-HC",
    title: "Uniform lastmod values (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file",
    scopeKind: "sitemap",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "uniform_lastmod",
        reason:
          "Every lastmod in {sitemap} ({n} entries) is {value}, which often means the value records generation time rather than content changes.",
      },
    ],
    fix: null,
    citations: [],
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-06",
    title: "IndexNow key file",
    class: "C4",
    weight: 0,
    gate: null,
    category: "sitemaps",
    scope: "preferred origin",
    scopeKind: "origin",
    engines: ["bing"],
    book: "SUPPORTED, SEARCH-ENGINE-SPECIFIC",
    requires: ["config"],
    conditions: [
      {
        code: "key_file",
        reason:
          "The IndexNow key file {key_url} returned {outcome}; its trimmed body {body_match} the configured key.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "INDEXNOW-DOC",
        section: "Host your key",
        quote: null,
      },
    ],
    notes:
      "IndexNow notifies Bing and other participating engines; Google is not listed as a participant (INDEXNOW-FAQ).",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-05",
    title: "priority and changefreq present",
    class: "C4",
    weight: 0,
    gate: null,
    category: "sitemaps",
    scope: "each sitemap file",
    scopeKind: "sitemap",
    engines: ["google", "bing"],
    book: "EXPLICITLY DISMISSED",
    conditions: [
      {
        code: "present",
        reason:
          "For your information: Google ignores <priority> and <changefreq>, and Bing says they do not influence how content is crawled or ranked.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-SITEMAP-BUILD",
        section: "XML sitemap",
        quote: "Google ignores <priority> and <changefreq> values.",
      },
      {
        source_id: "B-SITEMAP-2025",
        section: "Why lastmod Still Matters for AI Powered Indexing",
        quote:
          "are ignored by Bing and do not influence how your content is crawled or ranked",
      },
    ],
    notes: "Never a failure, never a recommendation to add them.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-SITEMAP-08",
    title: "A sitemap is published",
    class: "C2",
    weight: 4,
    gate: null,
    category: "sitemaps",
    scope: "site",
    scopeKind: "site",
    engines: ["bing"],
    book: "OPTIONAL (Google); DOCUMENTED SIGNAL, SEARCH-ENGINE-SPECIFIC (Bing, lastmod)",
    conditions: [
      {
        code: "none_found",
        opportunity: true,
        reason:
          "No sitemap was declared in robots.txt, configured, or found at /sitemap.xml. Bing describes the lastmod field in your sitemap as a key signal that helps it prioritize URLs for recrawling and reindexing, and a site without a sitemap sends that signal for none of its pages. Google says a sitemap isn't required. Without one, the scanner inferred which pages you intend to have indexed (PRODUCT.md §7.4).",
      },
    ],
    fix: "Publish an XML sitemap that lists every URL you want indexed, with an accurate lastmod including the time, and declare it with a Sitemap: line in robots.txt.",
    citations: [
      {
        source_id: "B-SITEMAP-2025",
        section: "Why lastmod Still Matters for AI Powered Indexing",
        quote:
          "The lastmod field in your sitemap remains a key signal, helping Bing prioritize URLs for recrawling and reindexing, or skip them entirely if the content hasn't changed since the last crawl.",
      },
      {
        source_id: "G-STARTER",
        section: "Help Google find your content",
        quote: "this isn't required",
      },
      {
        source_id: "G-SITEMAP-OVERVIEW",
        section: "Do I need a sitemap?",
        quote: null,
      },
    ],
    notes:
      "An opportunity, never a failure. Scored for Bing only: the registry holds no verbatim Google recommendation to publish a sitemap, and G-STARTER says one isn't required. A sitemap never improves rankings (§6).",
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
];
