import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.15 AI crawlers and generative search. */
export const AI_RULES: Rule[] = [
  {
    id: "SEO-AI-01",
    title: "Snippet eligibility for Google's AI features",
    class: "C4",
    weight: 0,
    gate: null,
    category: "ai",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "ELIGIBILITY REQUIREMENT (Google AI features), applied as a policy observation",
    conditions: [
      {
        code: "nosnippet_policy",
        reason:
          "Policy choice: {url} carries {directive}. To be eligible as a supporting link in AI Overviews or AI Mode, Google says a page must be indexed and eligible to be shown in Google Search with a snippet; nosnippet also prevents the content from being used as a direct input for AI Overviews and AI Mode.",
      },
      {
        code: "max_snippet_limit",
        reason: "Policy choice: {url} limits snippets with {directive}.",
      },
      {
        code: "data_nosnippet_regions",
        reason: "{url} marks {n} elements with data-nosnippet.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-AI",
        section: "Technical requirements",
        quote: "must be indexed and eligible to be shown in Google Search with a snippet",
      },
      {
        source_id: "G-AI",
        section: "Technical requirements",
        quote: "There are no additional technical requirements.",
      },
      {
        source_id: "G-ROBOTS-META",
        section: "nosnippet",
        quote:
          "will also prevent the content from being used as a direct input for AI Overviews and AI Mode.",
      },
    ],
    notes:
      "Informational because restricting snippets may be deliberate. Indexing itself is covered by the gates. Google's Search Console \"Search generative AI control\" is not observable from outside and appears in the manual checklist.",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-AI-02",
    title: "AI crawler access matrix",
    class: "C4",
    weight: 0,
    gate: null,
    category: "ai",
    scope: "site",
    scopeKind: "site",
    engines: [],
    book: "SUPPORTED, SEARCH-ENGINE-SPECIFIC",
    conditions: [
      {
        code: "access_matrix",
        reason: "{crawler} ({operator}): {outcome} for {url}{rule_clause}. {meaning}",
      },
    ],
    fix: null,
    citations: [],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-AI-04",
    title: "Bing answer-use controls",
    class: "C4",
    weight: 0,
    gate: null,
    category: "ai",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["bing"],
    book: "",
    conditions: [
      {
        code: "answer_use_control",
        reason:
          "{url} carries {directive}. Bing's 2023 announcement says NOARCHIVE content \"will not be included in Bing Chat answers\" and is not used to train Microsoft's generative AI models, while tagged content \"will still appear in our search results.\" Google moved noarchive to its list of rules Google Search no longer uses.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "B-NOARCHIVE-2023",
        section:
          "Announcing new options for webmasters to control usage of their content in Bing Chat",
        quote: "will not be included in Bing Chat answers",
      },
      {
        source_id: "B-NOARCHIVE-2023",
        section:
          "Announcing new options for webmasters to control usage of their content in Bing Chat",
        quote: "will still appear in our search results.",
      },
      {
        source_id: "G-ROBOTS-META",
        section: "Reference of historical and other unused rules",
        quote: null,
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
  {
    id: "SEO-AI-05",
    title: "llms.txt",
    class: "C4",
    weight: 0,
    gate: null,
    category: "ai",
    scope: "preferred origin",
    scopeKind: "origin",
    engines: ["google"],
    book: "",
    conditions: [
      {
        code: "llms_txt",
        reason:
          "{presence} For your information: Google Search ignores llms.txt files; Google says publishing one will neither harm nor help visibility in Google Search.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-AI-OPT",
        section: "Mythbusting generative AI search: what you don't need to do",
        quote:
          "Doing so will neither harm nor help your site's visibility or rankings in Google Search, as Google Search ignores them.",
      },
    ],
    notes: "{presence} is \"/llms.txt returned {outcome}.\"",
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
