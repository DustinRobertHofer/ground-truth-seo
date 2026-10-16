/**
 * The advisory review (PRODUCT.md §17.3): one model call per sampled page and
 * one for the site, through the Vercel AI Gateway. Runs outside evaluation
 * and never changes the report.
 */

import { generateText, Output } from "ai";
import type { z } from "zod";
import { REVIEW_GUIDANCE_VERSION } from "./guidance.js";
import { pagePrompt, reviewInstructions, sitePrompt } from "./prompt.js";
import { PageReviewSchema, SiteReviewSchema, type SiteReview } from "./schema.js";
import type { ContentReview, PageContent, PageReviewEntry, SiteContent } from "./types.js";

export const DEFAULT_REVIEW_MODEL = "anthropic/claude-sonnet-5.5";
const MAX_QUERIES = 20;
const MAX_QUERY_CHARS = 200;
const LLMS_EXCERPT_CHARS = 4_000;
/** A call started with less time than this left would only be cut off. */
const MIN_CALL_MS = 20_000;

export function reviewModel(): string {
  return process.env.AI_REVIEW_MODEL?.trim() || DEFAULT_REVIEW_MODEL;
}

/** True when a Gateway credential is available: an API key, a pulled OIDC token, or running on Vercel. */
export function aiReviewConfigured(): boolean {
  if (process.env.AI_REVIEW_DISABLED === "1") return false;
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

export function normalizeQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of queries) {
    const query = raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
    const key = query.toLowerCase();
    if (query === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

export interface ReviewOptions {
  queries?: readonly string[];
  /** Epoch milliseconds by which every model call must have finished. */
  deadline?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

class OutOfTime extends Error {}

function failureNote(error: unknown): string {
  if (error instanceof OutOfTime) return "Not reviewed: the time limit was reached first.";
  const message = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "";
  return message ? `The model request failed: ${message.slice(0, 300)}` : "The model request failed.";
}

async function pool(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next]!;
      next += 1;
      await task();
    }
  });
  await Promise.all(workers);
}

function current(page: PageContent): PageReviewEntry["current"] {
  return {
    title: page.title,
    metaDescription: page.metaDescription,
    h1: page.headings.filter((h) => h.level === 1).map((h) => h.text),
    wordCount: page.wordCount,
    visibleQa: page.visibleQa.length + page.questionHeadings.length,
    faqMarkup: page.faqMarkup.length,
    nosnippet: page.nosnippet,
    scriptRevealed: page.streamingFallback !== null,
  };
}

export async function reviewContent(site: SiteContent, options: ReviewOptions = {}): Promise<ContentReview> {
  const model = reviewModel();
  const instructions = reviewInstructions();
  const queries = normalizeQueries(options.queries ?? []);
  const deadline = options.deadline ?? Date.now() + 240_000;
  const usage = { inputTokens: 0, outputTokens: 0 };

  async function ask<T>(schema: z.ZodType<T>, name: string, prompt: string): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_MS) throw new OutOfTime();
    const result = await generateText({
      model,
      instructions,
      prompt,
      output: Output.object({ schema, name }),
      reasoning: "low",
      maxRetries: 1,
      timeout: remaining,
      abortSignal: options.signal,
      providerOptions: { gateway: { caching: "auto", tags: ["content-review"] } },
    });
    usage.inputTokens += result.usage.inputTokens ?? 0;
    usage.outputTokens += result.usage.outputTokens ?? 0;
    return result.output;
  }

  const total = site.pages.length + 1;
  let done = 0;
  const progress = (label: string) => {
    done += 1;
    options.onProgress?.(`AI review: ${done} of ${total} done (${label}).`);
  };

  const entries: PageReviewEntry[] = site.pages.map((page) => ({ url: page.url, current: current(page), status: "not_reviewed", note: null, review: null }));
  let siteReview: SiteReview | null = null;
  let siteNote: string | null = null;

  const tasks: (() => Promise<void>)[] = [
    async () => {
      try {
        siteReview = await ask(SiteReviewSchema, "SiteReview", sitePrompt(site, queries));
      } catch (error) {
        siteNote = failureNote(error);
      }
      progress("site overview");
    },
    ...site.pages.map((page, i) => async () => {
      const entry = entries[i]!;
      try {
        entry.review = await ask(PageReviewSchema, "PageReview", pagePrompt(site, page, queries));
        entry.status = "reviewed";
      } catch (error) {
        entry.status = error instanceof OutOfTime ? "not_reviewed" : "failed";
        entry.note = failureNote(error);
      }
      progress(new URL(page.url).pathname);
    }),
  ];

  options.onProgress?.(`AI review: reading ${site.pages.length} page${site.pages.length === 1 ? "" : "s"} with ${model}.`);
  await pool(tasks, options.concurrency ?? 4);

  const { text, ...llms } = site.llmsTxt;
  return {
    version: 1,
    guidanceVersion: REVIEW_GUIDANCE_VERSION,
    model,
    snapshotId: site.snapshotId,
    origin: site.origin,
    generatedAt: new Date().toISOString(),
    targetQueries: queries,
    candidates: site.candidates,
    llmsTxt: { ...llms, excerpt: text === null ? null : text.slice(0, LLMS_EXCERPT_CHARS) },
    crawlerAccess: site.crawlerAccess,
    site: siteReview,
    siteNote,
    pages: entries,
    usage,
  };
}
