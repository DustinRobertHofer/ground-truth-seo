import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.11 Localization (hreflang). */
export const I18N_RULES: Rule[] = [
  {
    id: "SEO-I18N-07",
    title: "hreflang links are inside the head",
    class: "C1",
    weight: 8,
    gate: null,
    category: "i18n",
    scope: "pages in P with hreflang link elements",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED (via SEO-HEAD-05)",
    conditions: [
      {
        code: "outside_head",
        reason:
          "{n} hreflang links on {url} are in <body>{culprit_clause}. Google requires these <link> tags to be inside a well-formed <head> section.",
      },
    ],
    fix: "Emit hreflang links in the server-rendered head and fix any SEO-HEAD-05 culprit.",
    citations: [
      {
        source_id: "G-HREFLANG",
        section: "HTML tags",
        quote:
          "The <link> tags must be inside a well-formed <head> section of the HTML.",
      },
    ],
    notes: "{culprit_clause} as in SEO-CANON-01.",
    related: ["SEO-HEAD-05"],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-I18N-02",
    title: "hreflang includes the page itself and is reciprocated",
    class: "C1",
    weight: 8,
    gate: null,
    category: "i18n",
    scope: "pages in P with annotations",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "missing_self",
        reason:
          "The hreflang annotations for {url} do not include the page itself. Google requires each language version to list itself as well as all other language versions.",
      },
      {
        code: "not_reciprocated",
        reason:
          "{url} names {target} as its {code} version, but {target} does not point back. Google ignores hreflang annotations when two pages don't both point to each other.",
      },
    ],
    fix: "Generate every member's annotations from one translation-group record so all members carry the identical, complete set.",
    citations: [
      {
        source_id: "G-HREFLANG",
        section: "Guidelines for all methods",
        quote:
          "Each language version must list itself as well as all other language versions.",
      },
      {
        source_id: "G-HREFLANG",
        section: "Guidelines for all methods",
        quote:
          "If two pages don't both point to each other, the tags will be ignored.",
      },
    ],
    notes:
      "Google allows omitting some languages on some pages and still processes the pairs that point to each other, so reciprocity is judged pair by pair; the finding lists only the broken pairs. Targets that do not return 200 are reported by SEO-I18N-09.",
    related: ["SEO-I18N-09"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-I18N-03",
    title: "hreflang URLs are fully qualified",
    class: "C1",
    weight: 8,
    gate: null,
    category: "i18n",
    scope: "pages in P with annotations",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "not_fully_qualified",
        reason:
          "The hreflang URL “{href}” on {url} is not fully qualified. Google requires alternate URLs to include the transport method (http/https).",
      },
    ],
    fix: "Build alternate URLs from the configured base URL.",
    citations: [
      {
        source_id: "G-HREFLANG",
        section: "Guidelines for all methods",
        quote:
          "Alternate URLs must be fully-qualified, including the transport method (http/https)",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-I18N-04",
    title: "hreflang values are supported codes",
    class: "C1",
    weight: 8,
    gate: null,
    category: "i18n",
    scope: "pages in P with annotations",
    scopeKind: "page",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "malformed",
        reason:
          "hreflang=\"{code}\" on {url} is not a supported value ({condition_label}). Google supports ISO 639-1 language codes, optionally with an ISO 15924 script and an ISO 3166-1 Alpha 2 region, plus x-default, and ignores other codes.",
      },
      {
        code: "region_only",
        reason:
          "hreflang=\"{code}\" on {url} is not a supported value ({condition_label}). Google supports ISO 639-1 language codes, optionally with an ISO 15924 script and an ISO 3166-1 Alpha 2 region, plus x-default, and ignores other codes.",
      },
      {
        code: "unsupported_code",
        reason:
          "hreflang=\"{code}\" on {url} is not a supported value ({condition_label}). Google supports ISO 639-1 language codes, optionally with an ISO 15924 script and an ISO 3166-1 Alpha 2 region, plus x-default, and ignores other codes.",
      },
    ],
    fix: "Use, for example, en, en-GB (not en-UK), es or es-MX (not es-419), zh-Hant.",
    citations: [
      {
        source_id: "G-HREFLANG",
        section: "Supported language and region codes",
        quote:
          "Only language codes listed in ISO 639-1 and region codes listed in ISO 3166-1 Alpha 2 are supported; other codes that aren't listed in those standards, such as es-419, aren't supported.",
      },
      {
        source_id: "G-HREFLANG",
        section: "Supported language and region codes",
        quote: "You can't specify the country code by itself.",
      },
      {
        source_id: "G-HREFLANG",
        section: "Common mistakes",
        quote: "doesn't have an effect on Google Search",
      },
    ],
    notes:
      "{condition_label} is \"not a valid code format\", \"a region code without a language\", or \"a code outside ISO 639-1, ISO 15924 or ISO 3166-1 Alpha 2\". The order of checks is fixed in §3.9.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-I18N-06",
    title: "Localized pages canonicalize within their language",
    class: "C2",
    weight: 4,
    gate: null,
    category: "i18n",
    scope: "pages in P with annotations and a head canonical",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "cross_language_canonical",
        reason:
          "{url} ({lang}) declares {canonical} ({other_lang}) as canonical. Google recommends specifying a canonical page in the same language, or the best possible substitute language.",
      },
    ],
    fix: "Make each localized page self-canonical.",
    citations: [
      {
        source_id: "G-CANON",
        section: "General canonicalization best practices",
        quote:
          "specify a canonical page in the same language, or the best possible substitute language",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-I18N-08",
    title: "hreflang is not combined with media",
    class: "C2",
    weight: 4,
    gate: null,
    category: "i18n",
    scope: "pages in P with hreflang link elements",
    scopeKind: "page",
    engines: ["google"],
    book: "none (scanner; Google HTML tags guideline)",
    conditions: [
      {
        code: "combined_attributes",
        reason:
          "A link on {url} combines hreflang with media. Google advises against combining hreflang annotations with other attributes such as media in a single <link> tag.",
      },
    ],
    fix: "Emit hreflang annotations in their own link elements.",
    citations: [
      {
        source_id: "G-HREFLANG",
        section: "HTML tags",
        quote:
          "don't combine hreflang annotations with other attributes such as media in a single <link> tag.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-I18N-09",
    title: "hreflang targets that do not load",
    class: "C4",
    weight: 0,
    gate: null,
    category: "i18n",
    scope: "pages in P with annotations",
    scopeKind: "page",
    engines: [],
    book: "",
    conditions: [
      {
        code: "target_not_200",
        reason: "{url} names {target} ({code}), which returned {outcome}.",
      },
    ],
    fix: null,
    citations: [],
    notes:
      "No source assigns a separate consequence; Google ignores annotations that are not reciprocated (SEO-I18N-02).",
    related: ["SEO-I18N-02"],
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
  {
    id: "SEO-I18N-05",
    title: "One annotation method per URL set",
    class: "C4",
    weight: 0,
    gate: null,
    category: "i18n",
    scope: "pages in P with annotations",
    scopeKind: "page",
    engines: [],
    book: "",
    conditions: [
      {
        code: "multiple_methods",
        reason:
          "{url} declares hreflang through {methods}. Google says the methods are equivalent, and using all three brings \"no benefit in Search\".",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-HREFLANG",
        section: "Methods for indicating your alternate pages",
        quote: "no benefit in Search",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
