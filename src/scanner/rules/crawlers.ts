/** KNOWLEDGE.md §7 Crawler reference. */

export interface CrawlerRef {
  /** The token as written in the table's first column, e.g. "Googlebot", "OAI-SearchBot". */
  token: string;
  operator: string;
  /** "Documented purpose" column verbatim. */
  purpose: string;
  /** Lowercase token chain, e.g. ["googlebot", "*"]. */
  chain: string[];
  /** "Documented robots.txt behavior" column verbatim. */
  robotsBehavior: string;
  source_id: string;
  /** True for ChatGPT-User and Perplexity-User (operators say robots.txt may not apply). */
  userTriggered: boolean;
}

export const CRAWLERS: CrawlerRef[] = [
  {
    token: "Googlebot",
    operator: "Google",
    purpose: "Google Search crawler (smartphone and desktop)",
    chain: ["googlebot", "*"],
    robotsBehavior:
      "Common crawlers \"always obey robots.txt rules when crawling automatically\"",
    source_id: "G-CRAWLERS",
    userTriggered: false,
  },
  {
    token: "Googlebot-Image",
    operator: "Google",
    purpose: "Image crawling for Google Search",
    chain: ["googlebot-image", "googlebot", "*"],
    robotsBehavior: "As above",
    source_id: "G-CRAWLERS",
    userTriggered: false,
  },
  {
    token: "Google-Extended",
    operator: "Google",
    purpose:
      "Control token, no separate crawler: Gemini training and grounding; no effect on Search inclusion or ranking",
    chain: ["google-extended", "*"],
    robotsBehavior: "Is a robots.txt token",
    source_id: "G-CRAWLERS",
    userTriggered: false,
  },
  {
    token: "bingbot",
    operator: "Microsoft",
    purpose: "Bing search crawler",
    chain: ["bingbot", "msnbot", "*"],
    robotsBehavior:
      "Honors one group only: the bingbot group if present, else msnbot, else * (2012)",
    source_id: "B-ROBOTS-2012",
    userTriggered: false,
  },
  {
    token: "OAI-SearchBot",
    operator: "OpenAI",
    purpose: "\"used to surface websites in search results in ChatGPT's search features\"",
    chain: ["oai-searchbot", "*"],
    robotsBehavior: "Controlled by its robots.txt token",
    source_id: "OPENAI-BOTS",
    userTriggered: false,
  },
  {
    token: "GPTBot",
    operator: "OpenAI",
    purpose: "Training; a disallow indicates content \"should not be used in training\"",
    chain: ["gptbot", "*"],
    robotsBehavior: "Controlled by its token",
    source_id: "OPENAI-BOTS",
    userTriggered: false,
  },
  {
    token: "ChatGPT-User",
    operator: "OpenAI",
    purpose: "User-triggered fetches",
    chain: ["chatgpt-user", "*"],
    robotsBehavior: "\"robots.txt rules may not apply\"",
    source_id: "OPENAI-BOTS",
    userTriggered: true,
  },
  {
    token: "Claude-SearchBot",
    operator: "Anthropic",
    purpose: "Search; blocking it \"may reduce your site's visibility\"",
    chain: ["claude-searchbot", "*"],
    robotsBehavior: "Anthropic states its bots honor robots.txt",
    source_id: "ANTHROPIC-BOTS",
    userTriggered: false,
  },
  {
    token: "ClaudeBot",
    operator: "Anthropic",
    purpose: "Training; a disallow signals exclusion from \"AI model training datasets\"",
    chain: ["claudebot", "*"],
    robotsBehavior: "Honors robots.txt; supports crawl-delay",
    source_id: "ANTHROPIC-BOTS",
    userTriggered: false,
  },
  {
    token: "Claude-User",
    operator: "Anthropic",
    purpose: "User-triggered fetches; blocking it \"may reduce your site's visibility\"",
    chain: ["claude-user", "*"],
    robotsBehavior: "Honors robots.txt (no exception stated)",
    source_id: "ANTHROPIC-BOTS",
    userTriggered: false,
  },
  {
    token: "PerplexityBot",
    operator: "Perplexity",
    purpose:
      "\"designed to surface and link websites in search results on Perplexity\"; \"not used to crawl content for AI foundation models\"",
    chain: ["perplexitybot", "*"],
    robotsBehavior: "Perplexity recommends allowing it; no explicit compliance sentence",
    source_id: "PERPLEXITY-BOTS",
    userTriggered: false,
  },
  {
    token: "Perplexity-User",
    operator: "Perplexity",
    purpose: "User-triggered fetches",
    chain: ["perplexity-user", "*"],
    robotsBehavior: "\"generally ignores robots.txt rules\"",
    source_id: "PERPLEXITY-BOTS",
    userTriggered: true,
  },
  {
    token: "Applebot",
    operator: "Apple",
    purpose: "Apple search crawler (data may also train Apple models)",
    chain: ["applebot", "googlebot", "*"],
    robotsBehavior: "Follows Googlebot rules when Applebot is not named",
    source_id: "APPLEBOT",
    userTriggered: false,
  },
  {
    token: "Applebot-Extended",
    operator: "Apple",
    purpose: "Control token for training; \"does not crawl webpages\"",
    chain: ["applebot-extended", "*"],
    robotsBehavior:
      "\"Webpages that disallow Applebot-Extended can still be included in search results.\"",
    source_id: "APPLEBOT",
    userTriggered: false,
  },
  {
    token: "CCBot",
    operator: "Common Crawl",
    purpose: "Open dataset used by third parties",
    chain: ["ccbot", "*"],
    robotsBehavior: "Obeys robots.txt and crawl-delay",
    source_id: "CC-FAQ",
    userTriggered: false,
  },
  {
    token: "meta-externalagent",
    operator: "Meta",
    purpose: "Training or product improvement",
    chain: ["meta-externalagent", "*"],
    robotsBehavior: "robots.txt used to express preferences",
    source_id: "META-CRAWLERS",
    userTriggered: false,
  },
  {
    token: "meta-webindexer",
    operator: "Meta",
    purpose: "Meta AI search index",
    chain: ["meta-webindexer", "*"],
    robotsBehavior: "robots.txt used to express preferences",
    source_id: "META-CRAWLERS",
    userTriggered: false,
  },
];

/** The three bullet notes under "Notes for the access matrix text", verbatim. */
export const ACCESS_MATRIX_NOTES: string[] = [
  "Training access is not search inclusion, and crawler access is not citation. No operator promises that allowed content will be used or linked.",
  "ChatGPT-User and Perplexity-User rows quote their operators' statements that robots.txt may not apply; the matrix never implies that a disallow blocks them. Google's user-triggered fetchers (\"these fetchers generally ignore robots.txt rules\", G-USER-FETCHERS) and Meta's meta-externalfetcher (\"may bypass robots.txt\", META-CRAWLERS) are documented the same way and are not tracked in the matrix.",
  "Bing's AdIdxBot, BingPreview and MicrosoftPreview are omitted: no first-party source retrieved for the book documented their strings or robots.txt behavior.",
];
