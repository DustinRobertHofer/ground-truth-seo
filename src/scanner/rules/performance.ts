import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.13 Performance and mobile. */
export const PERFORMANCE_RULES: Rule[] = [
  {
    id: "SEO-PERF-01",
    title: "Core Web Vitals meet the \"good\" thresholds in field data",
    class: "C2",
    weight: 4,
    gate: null,
    category: "performance",
    scope:
      "(origin or member of P, form factor) pairs with data, for the form factors PHONE and DESKTOP only",
    scopeKind: "pair",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, DOCUMENTED SIGNAL",
    requires: ["crux"],
    conditions: [
      {
        code: "lcp_over",
        reason:
          "In Chrome UX Report field data for {scope_label} ({form_factor}, collection period {first_date} to {last_date}), {metric} at the 75th percentile is {value}, above the 'good' threshold of {threshold}. Google documents Core Web Vitals as used by its ranking systems, without a published weight.{bing_clause}",
      },
      {
        code: "inp_over",
        reason:
          "In Chrome UX Report field data for {scope_label} ({form_factor}, collection period {first_date} to {last_date}), {metric} at the 75th percentile is {value}, above the 'good' threshold of {threshold}. Google documents Core Web Vitals as used by its ranking systems, without a published weight.{bing_clause}",
      },
      {
        code: "cls_over",
        reason:
          "In Chrome UX Report field data for {scope_label} ({form_factor}, collection period {first_date} to {last_date}), {metric} at the 75th percentile is {value}, above the 'good' threshold of {threshold}. Google documents Core Web Vitals as used by its ranking systems, without a published weight.{bing_clause}",
      },
    ],
    fix: "Work on the specific metric (server response and resource priority for LCP; main-thread work for INP; reserved space for media and embeds for CLS).",
    citations: [
      {
        source_id: "WEBDEV-VITALS",
        section: "Core Web Vitals",
        quote:
          "LCP should occur within 2.5 seconds of when the page first starts loading.",
      },
      {
        source_id: "WEBDEV-VITALS",
        section: "Core Web Vitals",
        quote: "pages should have a INP of 200 milliseconds or less.",
      },
      {
        source_id: "WEBDEV-VITALS",
        section: "Core Web Vitals",
        quote: "pages should maintain a CLS of 0.1. or less.",
      },
      {
        source_id: "WEBDEV-VITALS",
        section: "Core Web Vitals",
        quote:
          "the 75th percentile of page loads, segmented across mobile and desktop devices.",
      },
      {
        source_id: "G-PAGE-EXP",
        section: "Are Core Web Vitals used in ranking?",
        quote: "Core Web Vitals are used by our ranking systems.",
      },
      {
        source_id: "MS-BING-RANK",
        section: "How Bing Ranks Search Results",
        quote: "the main parameters Bing uses to rank pages in search results",
        conditions: ["lcp_over", "inp_over", "cls_over"],
      },
    ],
    notes:
      "{scope_label} is \"the origin {origin}\" or \"{url}\". {bing_clause} is \" Bing lists page load time among its main ranking parameters.\" when Bing is a selected engine, otherwise empty. The book's SEO-PERF-02 (Bing page load time) is folded into this rule's reason. No CrUX data means not_evaluated, not failure: field data requires a page to be publicly discoverable and sufficiently popular, and \"An exact number is not disclosed\" (CRUX-METHOD). Lab tools (Lighthouse, PageSpeed lab scores) are never scored: their results vary between runs, and Google says chasing a perfect score for SEO \"may not be the best use of your time\" (G-PAGE-EXP, §6). The MS-BING-RANK citation is emitted only when Bing is a selected engine.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-PERF-03",
    title: "Mobile and desktop versions are equivalent",
    class: "C2",
    weight: 4,
    gate: null,
    category: "performance",
    scope: "the home page and one sample intended page",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    requires: ["parity"],
    conditions: [
      {
        code: "title_differs",
        reason:
          "The mobile and desktop versions of {url} differ in {field}: {mobile_value} versus {desktop_value}. For most sites Google primarily indexes the mobile version, and it asks that the mobile site contain the same content as the desktop site, including structured data and metadata.",
      },
      {
        code: "robots_differs",
        reason:
          "The mobile and desktop versions of {url} differ in {field}: {mobile_value} versus {desktop_value}. For most sites Google primarily indexes the mobile version, and it asks that the mobile site contain the same content as the desktop site, including structured data and metadata.",
      },
      {
        code: "canonical_differs",
        reason:
          "The mobile and desktop versions of {url} differ in {field}: {mobile_value} versus {desktop_value}. For most sites Google primarily indexes the mobile version, and it asks that the mobile site contain the same content as the desktop site, including structured data and metadata.",
      },
      {
        code: "structured_data_differs",
        reason:
          "The mobile and desktop versions of {url} differ in {field}: {mobile_value} versus {desktop_value}. For most sites Google primarily indexes the mobile version, and it asks that the mobile site contain the same content as the desktop site, including structured data and metadata.",
      },
    ],
    fix: "Serve one responsive document per URL, or keep separate templates in parity.",
    citations: [
      {
        source_id: "G-BOT",
        section: "Googlebot",
        quote:
          "For most sites Google Search primarily indexes the mobile version of the content.",
      },
      {
        source_id: "G-MOBILE",
        section: "Make sure that content is the same on desktop and mobile",
        quote:
          "Make sure that your mobile site contains the same content as your desktop site.",
      },
    ],
    notes:
      "Visible-text differences are info only, since layouts can legitimately vary.",
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
];
