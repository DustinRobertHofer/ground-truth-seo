import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.14 JavaScript (rendered mode). */
export const JAVASCRIPT_RULES: Rule[] = [
  {
    id: "SEO-JS-01",
    title: "The canonical is set in HTML and not changed by JavaScript",
    class: "C2",
    weight: 4,
    gate: null,
    category: "javascript",
    scope: "page (P)",
    scopeKind: "page",
    engines: ["google"],
    book: "DOCUMENTED RECOMMENDATION, SEARCH-ENGINE-SPECIFIC",
    requires: ["rendered"],
    conditions: [
      {
        code: "canonical_added_by_js",
        reason:
          "On {url}, the canonical ({rendered}) exists only after JavaScript runs. Google says the best way to set the canonical URL is to use HTML.",
      },
      {
        code: "canonical_changed_by_js",
        reason:
          "On {url}, JavaScript changes the canonical from {raw} to {rendered}. Google says that if JavaScript must set the canonical, it should always be the same value as in the original HTML.",
      },
    ],
    fix: "Render the canonical on the server and leave it unchanged in the client.",
    citations: [
      {
        source_id: "G-JS",
        section: "Set the canonical URL",
        quote:
          "The best way to set the canonical URL is to use HTML, but if you have to use JavaScript, make sure that you always set the canonical URL to the same value as the original HTML.",
      },
    ],
    houseConvention: false,
    informational: false,
    scannerAdded: false,
  },
  {
    id: "SEO-JS-04",
    title: "Content and links that exist only after rendering",
    class: "C4",
    weight: 0,
    gate: null,
    category: "javascript",
    scope: "page (P)",
    scopeKind: "page",
    engines: [],
    book: "",
    requires: ["rendered"],
    conditions: [
      {
        code: "render_only_content",
        reason:
          "{url} has {raw_words} words of visible text and {raw_links} crawlable links in the raw HTML, versus {rendered_words} words and {rendered_links} links after rendering{render_only_links_clause}. Google renders JavaScript, and also says \"server-side or pre-rendering is still a great idea\" and \"Google won't load content that requires user interactions\".",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-JS",
        section: "Understand the JavaScript SEO basics",
        quote: "server-side or pre-rendering is still a great idea",
      },
      {
        source_id: "G-MOBILE",
        section: "Make sure that Google can access and render your content",
        quote: "Google won't load content that requires user interactions",
      },
    ],
    notes: "No threshold is scored.",
    houseConvention: false,
    informational: true,
    scannerAdded: true,
  },
];
