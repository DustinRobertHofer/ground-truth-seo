/** KNOWLEDGE.md §5 Manual review checklist. */

export interface ManualCheck {
  id: string;
  what: string;
  why: string;
  /** The Source cell as written. */
  source: string;
  /** The registry IDs mentioned in the Source cell. */
  source_ids: string[];
}

export const MANUAL_CHECKS: ManualCheck[] = [
  {
    id: "SEO-HTTP-04",
    what: "Error and empty states in templates (no results, missing product) return 404 or noindex, not 200 with error text",
    why: "Requires knowing which page states are errors",
    source: "G-HTTP · 2xx (success)",
    source_ids: ["G-HTTP"],
  },
  {
    id: "SEO-HTTP-08",
    what: "Firewalls, CDNs and bot protection admit verified Googlebot and bingbot",
    why: "The scanner cannot send requests from Google or Microsoft addresses",
    source:
      "G-AI · SEO best practices (\"Ensuring that crawling is allowed in robots.txt, and by any CDN or hosting infrastructure\"); G-VERIFY; B-VERIFY",
    source_ids: ["G-AI", "G-VERIFY", "B-VERIFY"],
  },
  {
    id: "SEO-ROBOTS-06",
    what: "Low-value parameter spaces (sorts, unindexed filters, internal search) are disallowed when they need not be crawled",
    why: "Requires knowing which parameters are low value",
    source:
      "G-FACET (\"If you don't need the faceted navigation URLs potentially indexed, prevent crawling of these URLs.\")",
    source_ids: ["G-FACET"],
  },
  {
    id: "SEO-CANON-04-CONTENT",
    what: "Every cross-page canonical points to a true duplicate or superset",
    why: "Content equivalence needs human judgment",
    source:
      "RFC6596 · 3 (\"The target (canonical) IRI MUST identify content that is either duplicative or a superset of the content at the context (referring) IRI.\")",
    source_ids: ["RFC6596"],
  },
  {
    id: "SEO-LINK-04",
    what: "Paginated and infinite-scroll lists expose a unique, linked URL per page of results",
    why: "Requires interaction and intent",
    source: "G-LAZY (\"Give each chunk its own persistent, unique URL.\")",
    source_ids: ["G-LAZY"],
  },
  {
    id: "SEO-LINK-05",
    what: "Paid and user-generated outbound links carry sponsored or ugc (or nofollow)",
    why: "The scanner cannot tell which links are paid",
    source: "G-QUALIFY",
    source_ids: ["G-QUALIFY"],
  },
  {
    id: "SEO-IMG-05",
    what: "Lazy loading never depends on scrolling or clicking; the main above-the-fold image is not lazy-loaded (house convention)",
    why: "Requires interaction and LCP identification",
    source:
      "G-LAZY · Load content when it's visible in the viewport (the recommended methods \"don't rely on user actions, such as scrolling or clicking\")",
    source_ids: ["G-LAZY"],
  },
  {
    id: "SEO-I18N-01",
    what: "Each language version has its own URL; language never switches by cookie or Accept-Language alone",
    why: "The scanner sends fixed headers and no cookies",
    source: "G-MULTIREGIONAL",
    source_ids: ["G-MULTIREGIONAL"],
  },
  {
    id: "SEO-REDIR-02",
    what: "Changing a published slug creates a permanent redirect from the old URL",
    why: "A single snapshot cannot see slug changes; diff mode lists URLs that disappeared between scans",
    source: "G-REDIRECTS",
    source_ids: ["G-REDIRECTS"],
  },
  {
    id: "SEO-REDIR-04",
    what: "Migration redirects are kept for at least a year",
    why: "Needs history",
    source:
      "G-SITEMOVE (\"Keep the redirects for as long as possible, generally at least 1 year.\")",
    source_ids: ["G-SITEMOVE"],
  },
  {
    id: "SEO-REDIR-05",
    what: "302, 303 and 307 are used only for genuinely temporary moves",
    why: "Needs intent",
    source: "G-REDIRECTS",
    source_ids: ["G-REDIRECTS"],
  },
  {
    id: "SEO-REDIR-06-UA",
    what: "Redirects do not vary by user agent to mislead crawlers (sneaky redirects)",
    why: "The scanner never impersonates crawlers",
    source: "G-SPAM · Sneaky redirects",
    source_ids: ["G-SPAM"],
  },
  {
    id: "SEO-JS-03",
    what: "Dynamic rendering is not used for new builds",
    why: "Would require crawler impersonation",
    source:
      "G-DYNAMIC (\"Dynamic rendering is a workaround and not a recommended solution\")",
    source_ids: ["G-DYNAMIC"],
  },
  {
    id: "SEO-META-05-STABLE",
    what: "The favicon URL stays stable",
    why: "Needs history; the diff mode reports changes",
    source:
      "G-FAVICON (\"The favicon URL must be stable (don't change the URL frequently).\")",
    source_ids: ["G-FAVICON"],
  },
  {
    id: "SEO-TOOLS-02",
    what: "Sitemaps are submitted in Search Console and Bing Webmaster Tools",
    why: "Not observable",
    source: "G-SC-SITEMAPS; B-BWT-2025",
    source_ids: ["G-SC-SITEMAPS", "B-BWT-2025"],
  },
  {
    id: "SEO-TOOLS-03",
    what: "Page indexing, URL Inspection, manual actions and security issues are reviewed after releases",
    why: "Not observable",
    source: "G-PIR; G-URL-INSPECTION",
    source_ids: ["G-PIR", "G-URL-INSPECTION"],
  },
  {
    id: "SEO-AI-06",
    what: "Search Console's Search generative AI control is set as intended",
    why: "Not observable",
    source: "G-SC-AI-CONTROL",
    source_ids: ["G-SC-AI-CONTROL"],
  },
  {
    id: "SEO-TOOLS-04",
    what: "Server logs are retained and crawler visits are verified by reverse DNS (Google) or Verify Bingbot (Bing)",
    why: "Logs are not observable",
    source: "G-VERIFY; B-VERIFY",
    source_ids: ["G-VERIFY", "B-VERIFY"],
  },
  {
    id: "SEO-CONTENT-01",
    what: "People-first, original, trustworthy content; E-E-A-T",
    why: "No published, testable rubric; Google publishes self-assessment questions, not weights",
    source: "G-HELPFUL",
    source_ids: ["G-HELPFUL"],
  },
];
