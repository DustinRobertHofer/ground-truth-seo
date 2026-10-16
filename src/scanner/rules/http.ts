import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.1 HTTP and hosting. */
export const HTTP_RULES: Rule[] = [
  {
    id: "SEO-HTTP-01",
    title: "Intended URLs return HTTP 200",
    class: "C1",
    weight: 8,
    gate: { kind: "indexing" },
    category: "http",
    scope: "each member of I",
    scopeKind: "intended",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "client_error",
        reason:
          "{url}{via_clause} returned {status}. Google only indexes pages served with HTTP 200, does not index URLs that return a 4xx status code, and removes already indexed URLs that start returning one.",
      },
      {
        code: "server_error",
        reason:
          "{url}{via_clause} returned {status}. Google treats 5xx and 429 responses as server errors: its crawlers slow down, and already indexed URLs are preserved for a time but eventually dropped.",
      },
      {
        code: "no_response",
        reason:
          "{url} could not be fetched ({error}). Google only indexes pages served with HTTP 200.",
      },
      {
        code: "unresolved_redirect",
        reason:
          "{url} never reaches a final response ({chain_problem}). Google's crawlers follow up to 10 redirect hops, and Google only indexes pages served with HTTP 200.",
      },
    ],
    fix: "Serve every URL you want indexed with a 200 at its final address. If the URL is gone on purpose, remove it from sitemaps and internal links; if it moved, redirect it permanently and list the destination instead.",
    citations: [
      {
        source_id: "G-TECH",
        section: "The page works",
        quote:
          "Google only indexes pages that are served with an HTTP 200 (success) status code.",
      },
      {
        source_id: "G-HTTP",
        section: "4xx (client errors)",
        quote:
          "Google doesn't index URLs that return a 4xx status code, and URLs that are already indexed and return a 4xx status code are removed from the index.",
        conditions: ["client_error"],
      },
      {
        source_id: "G-HTTP",
        section: "5xx (server errors)",
        quote:
          "5xx and 429 server errors prompt Google's crawlers to temporarily slow down with crawling. For Google Search, already indexed URLs are preserved in the index, but eventually dropped.",
        conditions: ["server_error"],
      },
      {
        source_id: "G-HTTP",
        section: "3xx (redirection)",
        quote: "By default, Google's crawlers follow up to 10 redirect hops.",
        conditions: ["unresolved_redirect"],
      },
    ],
    notes:
      "Hops and loops follow §3.12. {via_clause} is empty for a direct response, or \" (reached via {hops} redirects from {original})\". {chain_problem} is \"the redirect chain loops\" or \"the redirect chain exceeds 10 hops\".",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-02",
    title: "Intended URLs are publicly accessible",
    class: "C1",
    weight: 8,
    gate: { kind: "indexing" },
    category: "http",
    scope: "each member of I",
    scopeKind: "intended",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "auth_required",
        reason:
          "{url} returned {status} to a request without credentials. Google states that if a page is made private, such as by requiring a log-in, Googlebot will not crawl it.{waf_clause}",
      },
    ],
    fix: "Serve pages meant for Search without login. If a firewall or bot-protection layer produced this response, make sure it admits verified search crawlers (manual check SEO-HTTP-08).",
    citations: [
      {
        source_id: "G-TECH",
        section: "Googlebot isn't blocked",
        quote:
          "If a page is made private, such as requiring a log-in to view it, Googlebot will not crawl it.",
      },
      {
        source_id: "G-PIR",
        section: "Reasons",
        quote: null,
      },
      {
        source_id: "G-JS",
        section: "Use meaningful HTTP status codes",
        quote:
          "To tell Googlebot if a page can't be crawled or indexed, use a meaningful status code, like a 404 for a page that could not be found or a 401 code for pages behind a login.",
      },
    ],
    notes:
      "{waf_clause} is added when response headers or body match a recorded bot-challenge signature: \" The response looks like a bot challenge; it may differ for verified crawlers, which this scanner cannot impersonate.\"",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-03",
    title: "Missing URLs return 404 or 410",
    class: "C2",
    weight: 4,
    gate: null,
    category: "http",
    scope: "preferred origin",
    scopeKind: "origin",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "probe_200",
        reason:
          "A request for a page that does not exist ({probe_url}) returned 200{same_as_home_clause}{via_clause}. Google recommends a meaningful status code, like a 404 for a page that could not be found, and reports pages that return 200 with error-like or empty content as soft 404 errors in Search Console.",
      },
      {
        code: "probe_other",
        reason:
          "A request for a page that does not exist ({probe_url}) returned {outcome}{via_clause}. Google recommends a meaningful status code, like a 404 for a page that could not be found.",
      },
    ],
    fix: "Return a real 404 (or 410 for deliberately removed content) with a helpful error template. In single-page apps, route unknown paths to a URL that returns 404, or add noindex to the error view.",
    citations: [
      {
        source_id: "G-JS",
        section: "Use meaningful HTTP status codes",
        quote:
          "To tell Googlebot if a page can't be crawled or indexed, use a meaningful status code, like a 404 for a page that could not be found or a 401 code for pages behind a login.",
      },
      {
        source_id: "G-HTTP",
        section: "2xx (success)",
        quote:
          "If the content suggests an error for Google Search, an empty page or an error message, Search Console will show a soft 404 error.",
        conditions: ["probe_200"],
      },
      {
        source_id: "G-JS",
        section: "Avoid soft 404 errors in single-page apps",
        quote:
          "Use a JavaScript redirect to a URL for which the server responds with a 404 HTTP status code (for example /not-found).",
      },
    ],
    notes:
      "{same_as_home_clause} = \" with the same content as the home page\". {via_clause} as in SEO-HTTP-01. This rule also covers the book's SEO-JS-02.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-07",
    title: "HTTPS without certificate errors or downgrades",
    class: "C2",
    weight: 4,
    gate: null,
    category: "http",
    scope: "site",
    scopeKind: "site",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION",
    conditions: [
      {
        code: "preferred_origin_http",
        reason:
          "The site's preferred origin, {origin}, is served over HTTP. Google strongly recommends HTTPS and prefers HTTPS pages over equivalent HTTP pages as canonical.",
      },
      {
        code: "certificate_invalid",
        reason:
          "TLS validation failed for {origin}: {error}. Google warns that bad certificates and HTTPS-to-HTTP redirects can cause Google to prefer HTTP very strongly.",
      },
      {
        code: "https_to_http_redirect",
        reason:
          "{from} redirects to {to}, from HTTPS to HTTP. Google warns that HTTPS-to-HTTP redirects can cause Google to prefer HTTP very strongly.",
      },
    ],
    fix: "Serve every host over HTTPS with a valid, auto-renewed certificate; redirect HTTP permanently to HTTPS (SEO-URL-01); remove any rule that sends HTTPS traffic to HTTP.",
    citations: [
      {
        source_id: "G-HTTPS-REPORT",
        section: "HTTPS report",
        quote:
          "strongly recommends using HTTPS for your site to protect your users' security and privacy.",
      },
      {
        source_id: "G-CANON",
        section: "Prefer HTTPS over HTTP for canonical URLs",
        quote: "Google prefers HTTPS pages over equivalent HTTP pages as canonical",
      },
      {
        source_id: "G-CANON",
        section: "Prefer HTTPS over HTTP for canonical URLs",
        quote: "cause Google to prefer HTTP very strongly.",
      },
    ],
    notes: "Never describe HTTPS as a ranking boost. That claim is not established (§6).",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-09",
    title: "HTML stays within Googlebot's 2 MB fetch limit",
    class: "C1",
    weight: 8,
    gate: null,
    category: "http",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC, SUPPORTED (documented limit)",
    conditions: [
      {
        code: "over_limit",
        reason:
          "The HTML of {url} is {bytes} bytes uncompressed. Googlebot crawls the first 2MB of a supported file type, measured on uncompressed data, so content after that point is not crawled.{beyond_clause}",
      },
    ],
    fix: "Move large inline payloads (serialized application state, inline SVG sprites, base64 images, repeated JSON-LD) into separate files or after the primary content; paginate very long lists.",
    citations: [
      {
        source_id: "G-BOT",
        section: "Googlebot",
        quote:
          "Googlebot crawls the first 2MB of a supported file type, and the first 64MB of a PDF file.",
      },
      {
        source_id: "G-BOT",
        section: "Googlebot",
        quote: "The file size limit is applied on the uncompressed data.",
      },
    ],
    notes:
      "{beyond_clause} lists head elements found beyond the limit, for example \" The canonical link starts at byte 2,140,512, beyond the limit.\" Equivalent Bing limits were not established from reviewed Bing sources. Referenced CSS and JavaScript are fetched separately, each under the same limit.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-09B",
    title: "HTML that may exceed the 2 MB limit",
    class: "C4",
    weight: 0,
    gate: null,
    category: "http",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "near_limit",
        reason:
          "{url} is {bytes} bytes uncompressed. Google states a 2MB limit without defining its byte count, so content after byte 2,000,000 may not be crawled.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-BOT",
        section: "Googlebot",
        quote:
          "Googlebot crawls the first 2MB of a supported file type, and the first 64MB of a PDF file.",
      },
      {
        source_id: "G-BOT",
        section: "Googlebot",
        quote: "The file size limit is applied on the uncompressed data.",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
  {
    id: "SEO-HTTP-09-HC",
    title: "HTML larger than 1 MB (house convention)",
    class: "C4",
    weight: 0,
    gate: null,
    category: "http",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "house convention",
    conditions: [
      {
        code: "over_1mb",
        reason:
          "{url} is {bytes} bytes uncompressed. Google's documented fetch limit is 2MB; the 1,000,000-byte warning is a house convention.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-BOT",
        section: "Googlebot",
        quote:
          "Googlebot crawls the first 2MB of a supported file type, and the first 64MB of a PDF file.",
      },
    ],
    houseConvention: true,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-05",
    title: "Server errors observed during the scan",
    class: "C4",
    weight: 0,
    gate: null,
    category: "http",
    scope: "site",
    scopeKind: "site",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "server_errors",
        reason:
          "{n} URLs returned server errors or 429 during this scan, for example {examples}. Google's crawlers slow down on these responses, and already indexed URLs are eventually dropped. A single scan cannot tell whether an error is persistent.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-HTTP",
        section: "5xx (server errors)",
        quote:
          "5xx and 429 server errors prompt Google's crawlers to temporarily slow down with crawling. For Google Search, already indexed URLs are preserved in the index, but eventually dropped.",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-HTTP-06",
    title: "Conditional requests",
    class: "C4",
    weight: 0,
    gate: null,
    category: "http",
    scope: "preferred origin",
    scopeKind: "origin",
    engines: [],
    book: "OPTIONAL",
    conditions: [
      {
        code: "supports_304",
        reason:
          "The home page answered 304 to a conditional re-request. Google's crawlers treat 304 as a signal that the content is the same as last time it was crawled.",
      },
      {
        code: "no_304",
        reason:
          "The home page sent {validator} but answered {status} to a conditional re-request instead of 304.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-HTTP",
        section: "3xx (redirection)",
        quote:
          "signal the next processing system that the content is the same as last time it was crawled.",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
