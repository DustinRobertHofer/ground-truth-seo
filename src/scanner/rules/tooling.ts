import type { Rule } from "./types.js";

/** KNOWLEDGE.md §4.16 Search tooling. */
export const TOOLING_RULES: Rule[] = [
  {
    id: "SEO-TOOLS-01",
    title: "Verification tokens observed",
    class: "C4",
    weight: 0,
    gate: null,
    category: "tooling",
    scope: "site",
    scopeKind: "site",
    engines: [],
    book: "",
    conditions: [
      {
        code: "verification_tokens",
        reason:
          "{tokens_clause} Presence suggests Search Console or Bing Webmaster Tools may be set up; it proves nothing about how they are used. Verification lasts \"as long as Search Console can confirm the presence and validity of your verification token\", so removing a token can drop verification.",
      },
    ],
    fix: null,
    citations: [
      {
        source_id: "G-VERIFY-SC",
        section: "Verify your site ownership",
        quote:
          "as long as Search Console can confirm the presence and validity of your verification token",
      },
    ],
    houseConvention: false,
    informational: true,
    scannerAdded: false,
  },
];
