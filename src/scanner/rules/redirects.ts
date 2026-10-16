import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.12 Redirects. */
export const REDIRECT_RULES: Rule[] = [
  {
    id: "SEO-REDIR-07",
    title: "Redirect chains resolve",
    class: "C1",
    weight: 8,
    gate: null,
    category: "redirects",
    scope: "redirect units that are not members of I",
    scopeKind: "redirect",
    engines: ["google"],
    book: "SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "loop",
        reason: "{source} redirects in a loop ({chain}), so it never resolves.",
      },
      {
        code: "too_many_hops",
        reason:
          "{source} needs more than 10 redirects ({chain}). Google's crawlers follow up to 10 redirect hops, so this URL never resolves for Google.",
      },
    ],
    fix: "Point every source directly at its final destination and remove the rule that creates the cycle.",
    citations: [
      {
        source_id: "G-HTTP",
        section: "3xx (redirection)",
        quote: "By default, Google's crawlers follow up to 10 redirect hops.",
      },
      {
        source_id: "G-SITEMOVE",
        section: "Avoid chaining redirects",
        quote:
          "While Googlebot can follow up to 10 hops in a \"chain\" of multiple redirects (for example, Page 1 > Page 2 > Page 3), we advise redirecting to the final destination directly.",
      },
    ],
    notes: "Members of I are excluded because SEO-HTTP-01 already blocks them.",
    related: ["SEO-HTTP-01"],
    houseConvention: false,
    informational: false,
    scannerAdded: true,
  },
  {
    id: "SEO-REDIR-03",
    title: "Redirects go straight to the final destination",
    class: "C2",
    weight: 4,
    gate: null,
    category: "redirects",
    scope: "redirect units",
    scopeKind: "redirect",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "multi_hop",
        reason:
          "{source} reaches {final} after {hops} redirects ({chain}). Googlebot can follow up to 10 hops, but Google advises redirecting to the final destination directly.",
      },
    ],
    fix: "When saving a redirect, rewrite existing rules that point at its source so every source points at the final URL.",
    citations: [
      {
        source_id: "G-SITEMOVE",
        section: "Avoid chaining redirects",
        quote:
          "While Googlebot can follow up to 10 hops in a \"chain\" of multiple redirects (for example, Page 1 > Page 2 > Page 3), we advise redirecting to the final destination directly.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-REDIR-01",
    title: "Temporary redirects in use",
    class: "C4",
    weight: 0,
    gate: null,
    category: "redirects",
    scope: "redirect units",
    scopeKind: "redirect",
    engines: ["google"],
    book: "",
    conditions: [
      {
        code: "temporary_redirect",
        reason:
          "{source} redirects to {target} with {status}, a temporary redirect. The scanner cannot know whether the move is temporary. Google's redirects guide says the indexing pipeline \"doesn't use the redirect as a signal that the redirect target should be canonical\", the crawling documentation calls 302 \"a weak signal that the redirect target should be processed\", and Google recommends \"a permanent server-side redirect whenever possible\" for permanent moves.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-REDIRECTS",
        section: "Permanent server-side redirects",
        quote:
          "doesn't use the redirect as a signal that the redirect target should be canonical",
      },
      {
        source_id: "G-HTTP",
        section: "3xx (redirection)",
        quote: "a weak signal that the redirect target should be processed",
      },
      {
        source_id: "G-REDIRECTS",
        section: "Permanent server-side redirects",
        quote: "a permanent server-side redirect whenever possible",
      },
    ],
    notes:
      "Info for 302, 303 and 307 responses. The scanner cannot know whether a move is temporary. Permanent moves should use 301 or 308.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-REDIR-06",
    title: "Client-side redirects",
    class: "C4",
    weight: 0,
    gate: null,
    category: "redirects",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "",
    conditions: [
      {
        code: "client_side_redirect",
        reason:
          "{url} contains an inline script that assigns location ({snippet}). Google says: \"Only use JavaScript redirects if you can't do server-side or meta refresh redirects.\" This detection is heuristic.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-REDIRECTS",
        section: "JavaScript location redirects",
        quote:
          "Only use JavaScript redirects if you can't do server-side or meta refresh redirects.",
      },
    ],
    notes:
      "Info when inline scripts assign location, location.href, or call location.replace or location.assign at top level. Heuristic, hence informational.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
