import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.5 Document head and metadata. */
export const HEAD_RULES: Rule[] = [
  {
    id: "SEO-HEAD-01",
    title: "Each page has exactly one non-empty title",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "STANDARD, DOCUMENTED RECOMMENDATION (Chapter 44)",
    conditions: [
      {
        code: "missing",
        reason:
          "{url} has no <title> in its <head>{body_title_clause}. Google asks that every page have a title specified in the <title> element, and the HTML Standard expects exactly one title element in the head of an ordinary document.",
      },
      {
        code: "empty",
        reason:
          "The <title> of {url} is empty. Google asks that every page have a title specified in the <title> element.",
      },
    ],
    fix: "Render one title per page from a per-page field, with a fallback to the page name.",
    citations: [
      {
        source_id: "G-TITLE",
        section: "Best practices for influencing title links",
        quote:
          "Make sure every page on your site has a title specified in the <title> element",
      },
      {
        source_id: "WHATWG-SEM",
        section: "The head element (content model)",
        quote:
          "One or more elements of metadata content, of which exactly one is a title element and no more than one is a base element.",
      },
    ],
    notes:
      "Length is never checked. Google: \"While there's no limit on how long a <title> element can be, the title link is truncated in Google Search results as needed\" (§6). {body_title_clause} = \"; a <title> appears in <body> at line {line}, outside the head\".",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HEAD-01B",
    title: "No more than one title element",
    class: "C3",
    weight: 2,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "the HTML Standard",
    book: "STANDARD",
    conditions: [
      {
        code: "multiple",
        reason:
          "{url} contains {n} <title> elements. The HTML Standard allows exactly one in the head of an ordinary document.",
      },
    ],
    fix: "Remove duplicate title elements; render the title from one template slot.",
    citations: [
      {
        source_id: "WHATWG-SEM",
        section: "The head element (content model)",
        quote:
          "One or more elements of metadata content, of which exactly one is a title element and no more than one is a base element.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-HEAD-02",
    title: "One UTF-8 character encoding declaration",
    class: "C3",
    weight: 2,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "the HTML Standard",
    book: "STANDARD",
    conditions: [
      {
        code: "multiple_charset_meta",
        reason:
          "{url} has {n} <meta charset> elements. The HTML Standard allows no more than one meta element with a charset attribute per document.",
      },
      {
        code: "not_utf8",
        reason:
          "{url} declares or uses the encoding “{label}”. The HTML Standard notes that the Encoding Standard requires UTF-8.",
      },
      {
        code: "declaration_too_late",
        reason:
          "The character encoding declaration on {url} ends at byte {offset}. The HTML Standard requires it to be serialized completely within the first 1024 bytes.",
      },
    ],
    fix: "Emit <meta charset=\"utf-8\"> as the first child of <head>, once, and serve Content-Type: text/html; charset=utf-8.",
    citations: [
      {
        source_id: "WHATWG-SEM",
        section: "Specifying the document's character encoding",
        quote:
          "There must not be more than one meta element with a charset attribute per document.",
      },
      {
        source_id: "WHATWG-SEM",
        section: "Specifying the document's character encoding",
        quote:
          "The Encoding standard requires use of the UTF-8 character encoding and requires use of the \"utf-8\" encoding label to identify it.",
      },
      {
        source_id: "WHATWG-SEM",
        section: "Specifying the document's character encoding",
        quote:
          "The element containing the character encoding declaration must be serialized completely within the first 1024 bytes of the document.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HEAD-04",
    title: "The html element declares the page language",
    class: "C3",
    weight: 2,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "the HTML Standard",
    book: "STANDARD",
    conditions: [
      {
        code: "missing",
        reason:
          "The <html> element of {url} has no lang attribute. The HTML Standard encourages a lang attribute on the root element. Google does not use it to detect a page's language, so this is a standards and accessibility finding.",
      },
      {
        code: "malformed",
        reason:
          "The lang value “{value}” on {url} is not a well-formed language tag.",
      },
    ],
    fix: "Set lang from the page's locale (en, en-US, de).",
    citations: [
      {
        source_id: "WHATWG-SEM",
        section: "The html element",
        quote:
          "Authors are encouraged to specify a lang attribute on the root html element, giving the document's language.",
      },
      {
        source_id: "G-HREFLANG",
        section: "Methods for indicating your alternate pages",
        quote:
          "Google doesn't use hreflang or the HTML lang attribute to detect the language of a page; instead, we use algorithms to determine the language.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HEAD-05",
    title: "The head is not closed early",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "REQUIRED, SEARCH-ENGINE-SPECIFIC (Deliverable 5); Google's underlying statement is a recommendation",
    conditions: [
      {
        code: "head_closed_early",
        reason:
          "The parser closed <head> early on {url}: {culprit} at line {line} is not allowed in <head>, so the elements written after it ({displaced}) were placed in <body>. Google advises making sure at least the <head> section is valid HTML, and it only accepts rel=\"canonical\" and hreflang links from the <head>.",
      },
    ],
    fix: "Move the culprit into <body>. Tag-manager <iframe> and <noscript> snippets belong immediately after the opening <body> tag; tracking <img> pixels, <div> wrappers and stray text never belong in <head>.",
    citations: [
      {
        source_id: "G-CANON",
        section: "rel=\"canonical\" link element",
        quote: "make sure at least the <head> section is valid HTML",
      },
    ],
    notes:
      "The consequences are scored by SEO-CANON-01 and SEO-I18N-07, which report this rule as related. Robots meta tags displaced into the body still work for Google (§3.7).",
    related: ["SEO-CANON-01", "SEO-I18N-07"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HEAD-06",
    title: "noscript content that closes the head without scripting",
    class: "C4",
    weight: 0,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "none (parser behavior)",
    conditions: [
      {
        code: "noscript_closes_head",
        reason:
          "With scripting disabled, the <noscript> at line {line} on {url} closes <head> and displaces {displaced}. Google's renderer runs scripts, but parsers that do not will read the page this way.",
      },
    ],
    fix: null,
    citations: [],
    notes: "Informational: how Google parses before rendering is not documented.",
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
  {
    id: "SEO-META-01",
    title: "Titles are distinct and descriptive",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "duplicate",
        reason:
          "The title “{title}” is shared by {n} intended pages, including {examples}. Google advises avoiding repeated or boilerplate text in <title> elements and having distinct text that describes each page.",
      },
      {
        code: "vague_home",
        reason:
          "The home page title is “{title}”. Google advises avoiding vague descriptors like 'Home' for your home page.",
      },
    ],
    fix: "Generate titles from page-specific fields; add the site name once, through a template suffix.",
    citations: [
      {
        source_id: "G-TITLE",
        section: "Best practices",
        quote:
          "Avoid repeated or boilerplate text in <title> elements. It's important to have distinct text that describes the content of the page",
      },
      {
        source_id: "G-TITLE",
        section: "Best practices",
        quote:
          "Write descriptive and concise text for your <title> elements. Avoid vague descriptors like \"Home\" for your home page",
      },
    ],
    notes:
      "Never fail on length. Keyword repetition is only a house convention (SEO-META-01-HC).",
    related: ["SEO-META-01-HC"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-META-01-HC",
    title: "Repeated words in titles (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "repeated_words",
        reason:
          "The title of {url} contains the word “{word}” {n} times. Google advises: \"there's no reason to have the same words or phrases appear multiple times\". The threshold of three is a house convention.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-TITLE",
        section: "",
        quote:
          "there's no reason to have the same words or phrases appear multiple times",
      },
    ],
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-META-02A",
    title: "At most one meta description per page",
    class: "C3",
    weight: 2,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    standard: "the HTML Standard",
    book: "STANDARD",
    conditions: [
      {
        code: "multiple",
        reason:
          "{url} has {n} meta description elements. The HTML Standard allows only one per document.",
      },
    ],
    fix: "Emit one description element from one field.",
    citations: [
      {
        source_id: "WHATWG-SEM",
        section: "Standard metadata names",
        quote:
          "There must not be more than one meta element where the name attribute value is an ASCII case-insensitive match for description per document.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-META-02B",
    title: "Meta descriptions are page-specific",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "duplicate",
        reason:
          "The meta description on {url} is identical to the one on {n} other intended pages, including {examples}. Google notes that identical or similar descriptions on every page aren't helpful when individual pages appear in results, and recommends page-level descriptions.",
      },
    ],
    fix: "Write page-specific descriptions, or leave the field empty rather than repeating a sitewide default.",
    citations: [
      {
        source_id: "G-SNIPPET",
        section: "Create unique descriptions for each page on your site",
        quote:
          "Identical or similar descriptions on every page of a site aren't helpful when individual pages appear in search results.",
      },
      {
        source_id: "G-SNIPPET",
        section: "Create unique descriptions for each page on your site",
        quote:
          "create descriptions that accurately describe the specific page. Use site-level descriptions on the main home page or other aggregation pages, and use page-level descriptions everywhere else.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-META-02C",
    title: "Pages carry a meta description",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "absent",
        opportunity: true,
        reason:
          "{url} has no meta description. Google asks that, at the very least, the critical URLs like the home page and popular pages have a description, and that page-level descriptions be used everywhere else. Snippets are primarily created from the page content itself, so nothing breaks without one.",
      },
    ],
    fix: "Write a short description specific to this page that states its most relevant facts; start with the home page and the most visited pages, and never reuse one description across pages.",
    citations: [
      {
        source_id: "G-SNIPPET",
        section: "Create unique descriptions for each page on your site",
        quote:
          "If you don't have time to create a description for every single page, try to prioritize your content; at the very least, create a description for the critical URLs like your home page and popular pages.",
      },
      {
        source_id: "G-SNIPPET",
        section: "Create unique descriptions for each page on your site",
        quote:
          "create descriptions that accurately describe the specific page. Use site-level descriptions on the main home page or other aggregation pages, and use page-level descriptions everywhere else.",
      },
      {
        source_id: "G-SNIPPET",
        section: "How snippets are created",
        quote: "Snippets are primarily created from the page content itself.",
      },
      {
        source_id: "G-STARTER",
        section: "Control your snippets",
        quote: "A good meta description is short, unique to one particular page, and includes the most relevant points of the page.",
      },
    ],
    notes:
      "An opportunity, never a failure: Google builds snippets mainly from page content. Never check description length: \"There's no limit on how long a meta description can be\" (§6).",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-META-05A",
    title: "Favicon eligible for Google Search",
    class: "C1",
    weight: 8,
    gate: { kind: "feature", name: "favicon" },
    category: "head",
    scope: "home page of each in-scope hostname",
    scopeKind: "host",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "home_blocked",
        reason:
          "{resource} is disallowed for {crawler} by {rule}. Google requires that Googlebot-Image can crawl the favicon file and Googlebot can crawl the home page.",
      },
      {
        code: "no_icon_link",
        opportunity: true,
        reason:
          "The home page of {origin} has no favicon link in its <head>. Google reads the favicon from a <link> tag in the header of the home page.",
      },
      {
        code: "icon_not_ok",
        reason: "The favicon {icon_url} returned {outcome}.",
      },
      {
        code: "icon_blocked",
        reason:
          "{resource} is disallowed for {crawler} by {rule}. Google requires that Googlebot-Image can crawl the favicon file and Googlebot can crawl the home page.",
      },
      {
        code: "unsupported_format",
        reason:
          "The favicon {icon_url} is {format}. Google lists BMP, GIF, ICO, PNG, JPEG, PPM and TIFF as supported favicon formats.",
      },
      {
        code: "not_square",
        reason:
          "The favicon {icon_url} is {width}×{height}. Google requires a square (1:1) favicon of at least 8x8px.",
      },
      {
        code: "too_small",
        reason:
          "The favicon {icon_url} is {width}×{height}. Google requires a square (1:1) favicon of at least 8x8px.",
      },
    ],
    fix: "Add <link rel=\"icon\" href=\"/favicon.png\"> (or an ICO) to the home page head, pointing to a stable, crawlable, square raster image, ideally larger than 48×48.",
    citations: [
      {
        source_id: "G-FAVICON",
        section: "Guidelines",
        quote:
          "You must follow these guidelines to be eligible for a favicon in Google Search results.",
      },
      {
        source_id: "G-FAVICON",
        section: "Guidelines",
        quote:
          "Googlebot-Image must be able to crawl the favicon file and Googlebot must be able to crawl the home page; they cannot be blocked for crawling.",
      },
      {
        source_id: "G-FAVICON",
        section: "Guidelines",
        quote: "Your favicon must be a square (1:1 aspect ratio) that's at least 8x8px.",
      },
      {
        source_id: "G-FAVICON",
        section: "Guidelines",
        quote:
          "Google Search supports the following favicon file formats: BMP, GIF, ICO, PNG, JPEG, PPM, and TIFF.",
      },
    ],
    notes:
      "When no candidate passes, emit one finding per (candidate, failed condition), evaluating every check for every candidate rather than stopping at the first failure. Favicon candidates and their robots.txt files are fetched for the home page of every in-scope hostname, whatever origin the icon is served from. Eligibility is not display: \"A favicon isn't guaranteed to appear in Google Search results, even if all guidelines are met.\" Google supports one favicon per hostname; subdirectory home pages are not supported. Google also asks that the favicon URL be stable; a single snapshot cannot test that, so the diff mode reports favicon URL changes between scans.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-META-05B",
    title: "Favicon larger than 48×48",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "home page of each in-scope hostname",
    scopeKind: "host",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "not_larger_than_48",
        reason:
          "The best eligible favicon is {size}×{size}. Google recommends a favicon larger than 48x48px so that it looks good on various surfaces.",
      },
    ],
    fix: "Provide a square favicon larger than 48×48 (for example 96×96 or 192×192) at a stable URL.",
    citations: [
      {
        source_id: "G-FAVICON",
        section: "Guidelines",
        quote:
          "While the minimum size requirement is 8x8px, we recommend using a favicon that's larger than 48x48px so that it looks good on various surfaces.",
      },
    ],
    notes: "applies only when SEO-META-05A passes",
    related: ["SEO-META-05A"],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-META-06",
    title: "No meta refresh redirects",
    class: "C2",
    weight: 4,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "meta_refresh_redirect",
        reason:
          "{url} redirects with <meta http-equiv=\"refresh\" content=\"{content}\">. For redirects, Google recommends a server-side 301 redirect instead.",
      },
    ],
    fix: "Replace with a server-side 301 or 308.",
    citations: [
      {
        source_id: "G-META-TAGS",
        section: "meta tags: refresh",
        quote: "We recommend using a server-side 301 redirect instead.",
      },
      {
        source_id: "G-REDIRECTS",
        section: "Permanent server-side redirects",
        quote: "a permanent server-side redirect whenever possible",
      },
    ],
    notes: "A refresh without a URL (a timed reload) is info, not a failure.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HEAD-03",
    title: "Viewport meta tag",
    class: "C4",
    weight: 0,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "SUPPORTED",
    conditions: [
      {
        code: "absent",
        reason: "{url} has no viewport meta tag.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-META-TAGS",
        section: "viewport",
        quote: "Presence of this tag indicates to Google that the page is mobile friendly.",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-META-03",
    title: "Keywords meta tag present",
    class: "C4",
    weight: 0,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "EXPLICITLY DISMISSED",
    conditions: [
      {
        code: "present",
        reason: "For your information: Google Search doesn't use the keywords meta tag.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-STARTER",
        section: "Things we believe you shouldn't focus on",
        quote: "Google Search doesn't use the keywords meta tag.",
      },
    ],
    notes: "Never a failure, and its absence is never reported.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-META-04",
    title: "Snippet controls in use",
    class: "C4",
    weight: 0,
    gate: null,
    category: "head",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google", "bing"],
    book: "OPTIONAL",
    conditions: [
      {
        code: "snippet_controls",
        reason: "{url} uses {controls}. {effect}",
      },
      {
        code: "data_nosnippet_unsupported_element",
        reason:
          "{url} uses data-nosnippet on <{element}> at line {line}. Google supports it only on span, div and section, while Bing supports it on any element.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-ROBOTS-META",
        section: "Using the data-nosnippet HTML attribute",
        quote: null,
      },
      {
        source_id: "B-NOSNIPPET",
        section: "",
        quote: null,
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
