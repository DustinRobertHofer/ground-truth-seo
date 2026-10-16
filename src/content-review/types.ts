/**
 * What the advisory content review sees (SiteContent, produced
 * deterministically from a snapshot) and what it produces (ContentReview).
 * PRODUCT.md §17.
 */

import type { PageReview, SiteReview } from "./schema.js";

export interface QaPair {
  question: string;
  answer: string;
  /** Inside a closed <details> element. */
  collapsed: boolean;
}

export interface PageContent {
  url: string;
  /** Link-crawl depth, or null for pages only listed in a sitemap. */
  depth: number | null;
  title: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  canonical: string | null;
  lang: string | null;
  /** h1 to h3 headings in document order. */
  headings: { level: number; text: string }[];
  /** Main content with heading, list, table and paragraph structure; closed <details> content is prefixed "[collapsed]". */
  text: string;
  textTruncated: boolean;
  wordCount: number;
  /** Set when the main content sits in a hidden streaming segment: what the page shows before scripts reveal it. */
  streamingFallback: string | null;
  visibleQa: QaPair[];
  questionHeadings: string[];
  jsonLdTypes: string[];
  faqMarkup: { question: string; answer: string }[];
  authors: string[];
  datePublished: string | null;
  dateModified: string | null;
  images: number;
  imagesWithoutAlt: number;
  nosnippet: boolean;
}

export interface LlmsTxtStructure {
  h1: string | null;
  summary: string | null;
  sections: { title: string; links: number }[];
  links: number;
  /** Links whose path ends in .md, the proposal's LLM-friendly form. */
  markdownLinks: number;
}

export interface LlmsTxtContent {
  url: string;
  /** "HTTP 200", "HTTP 404", "a timeout", "not fetched" and so on. */
  outcome: string;
  /** A 200 response that is not an HTML page. */
  found: boolean;
  /** The server answered /llms.txt with an HTML page. */
  servedHtml: boolean;
  text: string | null;
  truncated: boolean;
  structure: LlmsTxtStructure | null;
}

export interface CrawlerAccess {
  crawler: string;
  operator: string;
  purpose: string;
  outcome: "allowed" | "disallowed" | "unknown";
  rule: string | null;
  userTriggered: boolean;
}

export interface SiteContent {
  version: 1;
  snapshotId: string;
  origin: string;
  homePage: string;
  scannedAt: string;
  siteName: string | null;
  organizationName: string | null;
  /** Pages that qualified for sampling, before the page limit. */
  candidates: number;
  pages: PageContent[];
  llmsTxt: LlmsTxtContent;
  crawlerAccess: CrawlerAccess[];
}

/** The parts of a page the review UI shows next to the model's suggestions. */
export interface PageCurrent {
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  wordCount: number;
  visibleQa: number;
  faqMarkup: number;
  nosnippet: boolean;
  scriptRevealed: boolean;
}

export interface PageReviewEntry {
  url: string;
  current: PageCurrent;
  status: "reviewed" | "failed" | "not_reviewed";
  /** Why the page was not reviewed, when it was not. */
  note: string | null;
  review: PageReview | null;
}

export interface ContentReview {
  version: 1;
  guidanceVersion: string;
  model: string;
  snapshotId: string;
  origin: string;
  generatedAt: string;
  targetQueries: string[];
  candidates: number;
  llmsTxt: Omit<LlmsTxtContent, "text"> & { excerpt: string | null };
  crawlerAccess: CrawlerAccess[];
  site: SiteReview | null;
  siteNote: string | null;
  pages: PageReviewEntry[];
  usage: { inputTokens: number; outputTokens: number };
}
