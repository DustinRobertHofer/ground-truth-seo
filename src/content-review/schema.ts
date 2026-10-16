/**
 * The shape of the model's answers. Descriptions here only explain fields;
 * what to judge and suggest comes from the guidance (KNOWLEDGE.md §11).
 */

import { z } from "zod";
import { GUIDELINE_IDS } from "./guidance.js";

const guidelineIds = z.array(z.enum(GUIDELINE_IDS)).min(1).max(3).describe("The guideline IDs this relies on.");
const verdict = z.enum(["good", "improve", "rewrite", "missing"]);
const priority = z.enum(["high", "medium", "low"]);
const engine = z.enum(["google", "bing", "both"]).describe("Whose documentation the advice follows.");

export const PageReviewSchema = z.object({
  pageType: z.string().describe("A short label such as 'home page', 'service page', 'product page', 'article', 'location page', 'about page' or 'contact page'."),
  visitorIntent: z.string().describe("One sentence: what someone arriving from a search wants from this page."),
  likelyQueries: z
    .array(
      z.object({
        query: z.string().describe("Written the way a person would type or ask it."),
        source: z.enum(["owner", "inferred"]).describe("'owner' only for queries copied from the owner's target queries."),
        audience: z.enum(["newcomer", "expert", "local", "comparison", "brand"]),
        coverage: z.enum(["answered", "partly", "not_answered"]).describe("Whether the visible content answers it."),
      }),
    )
    .max(8),
  title: z.object({
    verdict,
    assessment: z.string().describe("One or two sentences about the current title, quoting it."),
    suggestions: z.array(z.string()).max(3).describe("Empty when the verdict is good."),
  }),
  metaDescription: z.object({
    verdict,
    assessment: z.string().describe("One or two sentences about the current description, quoting it, or noting it is missing."),
    suggestions: z.array(z.string()).max(2).describe("Empty when the verdict is good."),
  }),
  mainHeading: z.object({
    verdict,
    assessment: z.string(),
    suggestion: z.string().nullable().describe("Null when the verdict is good."),
  }),
  queryAlignment: z.object({
    assessment: z.string(),
    termsToAdd: z
      .array(
        z.object({
          term: z.string(),
          where: z.string().describe("The existing heading or passage where it fits."),
          why: z.string().describe("Who searches with this term and why."),
        }),
      )
      .max(6),
  }),
  answers: z.object({
    verdict: z.enum(["strong", "partial", "weak"]),
    assessment: z.string(),
    gaps: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string().describe("One or two sentences from page facts, with [placeholders] for missing facts."),
          placement: z.string().describe("The existing section where the answer belongs."),
          needsOwnerInput: z.boolean(),
        }),
      )
      .max(5)
      .describe("Questions best answered inline in existing sections. Never repeat a question that is in faq.items."),
  }),
  faq: z.object({
    recommended: z.boolean(),
    reason: z.string(),
    items: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string().describe("From page facts, with [placeholders] for missing facts."),
          needsOwnerInput: z.boolean(),
        }),
      )
      .max(6)
      .describe("Empty when an FAQ is not recommended."),
  }),
  issues: z
    .array(
      z.object({
        guidelines: guidelineIds,
        priority,
        engine,
        title: z.string().describe("A short imperative, for example 'Name the service area in the title'."),
        observation: z.string().describe("What on the page shows this, quoting the page where possible."),
        recommendation: z.string(),
        example: z.string().nullable().describe("Copy-ready replacement text when the fix is a rewrite, else null."),
      }),
    )
    .max(8)
    .describe("Highest priority first. Do not repeat the title, description or FAQ suggestions above."),
  strengths: z.array(z.string()).max(4),
});

export const SiteReviewSchema = z.object({
  summary: z.string().describe("Two or three sentences: what the site is, for whom, and the overall state of its content for searchers and AI answers."),
  audience: z.string(),
  identity: z.object({
    verdict: z.enum(["clear", "partial", "unclear"]),
    assessment: z.string(),
    statement: z.string().nullable().describe("A plain who/what/where paragraph from site facts with [placeholders]; null when the site already states this well."),
  }),
  patterns: z
    .array(
      z.object({
        guidelines: guidelineIds,
        priority,
        engine,
        title: z.string(),
        observation: z.string(),
        recommendation: z.string(),
        pages: z.array(z.string()).describe("URLs of the sampled pages affected."),
      }),
    )
    .max(6)
    .describe("Problems that repeat across pages or concern the whole site."),
  contentGaps: z
    .array(
      z.object({
        question: z.string().describe("A question real visitors would have that no sampled page answers."),
        where: z.string().describe("The existing URL where the answer belongs, or 'New page: <topic>' only when no existing page fits."),
        why: z.string(),
      }),
    )
    .max(6),
  llmsTxt: z.object({
    verdict: z.enum(["good", "improve", "invalid", "missing_worthwhile", "missing_optional"]),
    assessment: z.string(),
    draft: z.string().nullable().describe("A complete llms.txt in the proposal's format built from the site's pages and facts, or null when not useful."),
  }),
  priorities: z
    .array(
      z.object({
        title: z.string(),
        why: z.string(),
        guidelines: guidelineIds,
      }),
    )
    .max(5)
    .describe("The few changes most worth the owner's time across the site, most valuable first."),
});

export type PageReview = z.infer<typeof PageReviewSchema>;
export type SiteReview = z.infer<typeof SiteReviewSchema>;
