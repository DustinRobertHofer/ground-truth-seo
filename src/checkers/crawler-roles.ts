import type { CrawlerRole } from "./types.js";

/**
 * A grouping of the crawlers in KNOWLEDGE.md §7 by their "Documented purpose"
 * column, for the checker tables. It summarizes that column and adds nothing
 * to it; the purpose text itself is always shown beside the label.
 */
export const CRAWLER_ROLES: Readonly<Record<string, CrawlerRole>> = {
  Googlebot: "search",
  "Googlebot-Image": "search",
  "Google-Extended": "control",
  bingbot: "search",
  "OAI-SearchBot": "search",
  GPTBot: "training",
  "ChatGPT-User": "user",
  "Claude-SearchBot": "search",
  ClaudeBot: "training",
  "Claude-User": "user",
  PerplexityBot: "search",
  "Perplexity-User": "user",
  Applebot: "search",
  "Applebot-Extended": "control",
  CCBot: "dataset",
  "meta-externalagent": "training",
  "meta-webindexer": "search",
};

export const ROLE_LABEL: Record<CrawlerRole, string> = {
  search: "Search crawler",
  training: "Training crawler",
  control: "Control token",
  user: "User-triggered fetcher",
  dataset: "Open dataset crawler",
};

/** The search engines' own crawlers, shown on the robots.txt checker. */
export const SEARCH_CRAWLER_TOKENS = ["Googlebot", "Googlebot-Image", "bingbot", "Applebot"] as const;
