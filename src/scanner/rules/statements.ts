/** KNOWLEDGE.md §10 Report statements. */

/** §10.1 Headline statements. `text` is the quoted text without the "Google: " label. */
export const HEADLINE_STATEMENTS: {
  key: string;
  text: string;
  source_id: string | null;
  section: string | null;
  onlyWhen?: "perf_evaluated";
}[] = [
  {
    key: "not_a_ranking_prediction",
    text: "The score measures how much of the best documented setup the site has in place, weighted by the strength of the documentation. A documented practice counts whether or not the site has started on it. It is not a ranking prediction.",
    source_id: null,
    section: null,
  },
  {
    key: "indexing_not_guaranteed",
    text: "Just because a page meets these requirements doesn't mean that a page will be indexed; indexing isn't guaranteed.",
    source_id: "G-TECH",
    section: "Google Search technical requirements",
  },
  {
    key: "cwv_scope",
    text: "\"Core Web Vitals are used by our ranking systems.\" and \"Beyond Core Web Vitals, other page experience aspects don't directly help your website rank higher in search results.\"",
    source_id: "G-PAGE-EXP",
    section: "Are Core Web Vitals used in ranking?",
    onlyWhen: "perf_evaluated",
  },
  {
    key: "weights_meaning",
    text: "Weights express the strength of the documentation, not ranking impact.",
    source_id: null,
    section: null,
  },
];

/** §10.2 Outcome statements for recommendations. */
export const OUTCOME_STATEMENTS: {
  applies: "gate_indexing" | "gate_feature" | "c1" | "c2" | "c3";
  text: string;
  note?: string;
}[] = [
  {
    applies: "gate_indexing",
    text: "Fixing this makes the page eligible to be indexed. Google does not guarantee that an eligible page will be crawled, indexed or shown.",
  },
  {
    applies: "gate_feature",
    text: "Fixing this makes the page eligible for the feature. Google does not guarantee that your structured data will show up in search results, even if your page is marked up correctly according to the Rich Results Test.",
    note: "(the second sentence only for structured-data features)",
  },
  {
    applies: "c1",
    text: "Fixing this lets the mechanism work as documented.",
  },
  {
    applies: "c2",
    text: "This follows a documented {engine} recommendation. {Engine} publishes no ranking weight for it.",
  },
  {
    applies: "c3",
    text: "This brings the page into conformance with {standard}. No search engine documents a ranking effect for it.",
  },
];

/** §10.2 "Sources for the quoted sentence". */
export const OUTCOME_QUOTE_SOURCE: {
  source_id: "G-SD-POLICIES";
  section: string;
  quote: string;
} = {
  source_id: "G-SD-POLICIES",
  section: "General structured data guidelines",
  quote:
    "Google does not guarantee that your structured data will show up in search results, even if your page is marked up correctly according to the Rich Results Test.",
};

/** §10.3 Verification steps. */
export const VERIFY_STEPS: { engine: "any" | "google" | "bing"; text: string }[] = [
  {
    engine: "any",
    text: "Re-run the scan after deploying the fix and compare the reports.",
  },
  {
    engine: "google",
    text: "For a sample URL, use URL Inspection in Google Search Console to confirm how Google sees the page.",
  },
  {
    engine: "bing",
    text: "For a sample URL, use URL Inspection in Bing Webmaster Tools to confirm how Bing sees the page.",
  },
];
