/**
 * KNOWLEDGE.md §10.4 AI answers readiness. Each item is a documented condition
 * for getting content into an engine's or operator's AI answers, read off the
 * findings and the access matrix. Nothing here is scored.
 */

export type ReadinessKind =
  | { kind: "google_snippet" }
  | { kind: "bing_answers" }
  | { kind: "bing_sitemap_lastmod" }
  | { kind: "crawler"; token: string }
  | { kind: "llms_txt" };

export interface ReadinessDef {
  key: string;
  /** The "Item" column verbatim. */
  label: string;
  /** The "Engine or operator" column verbatim. */
  party: string;
  source_id: string;
  section: string;
  /** The stored quote, or null when the row cites a section for context only. */
  quote: string | null;
  derive: ReadinessKind;
}

/** The paragraph under "### 10.4 AI answers readiness", verbatim. */
export const AI_READINESS_INTRO: string =
  "What the engines and AI operators document about getting content into AI answers, checked against this scan. Nothing here is scored: Google says optimizing for generative AI search is still SEO, and allowing or blocking an AI crawler is a policy choice. Each line says whether the documented condition is in place, so an owner can see what they could still do.";

export const AI_READINESS: ReadinessDef[] = [
  {
    key: "google_snippet",
    label: "Pages eligible to be shown with a snippet, Google's condition for AI Overviews and AI Mode",
    party: "Google",
    source_id: "G-AI",
    section: "Technical requirements",
    quote: "must be indexed and eligible to be shown in Google Search with a snippet",
    derive: { kind: "google_snippet" },
  },
  {
    key: "bing_answers",
    label: "Pages without noarchive or nocache, which keep content available to Bing's answers",
    party: "Microsoft",
    source_id: "B-NOARCHIVE-2023",
    section: "Announcing new options for webmasters to control usage of their content in Bing Chat",
    quote: "will not be included in Bing Chat answers",
    derive: { kind: "bing_answers" },
  },
  {
    key: "bing_sitemap_lastmod",
    label: "A sitemap whose lastmod values include date and time, Bing's recrawl signal",
    party: "Microsoft",
    source_id: "B-SITEMAP-2025",
    section: "Why lastmod Still Matters for AI Powered Indexing",
    quote:
      "The lastmod field in your sitemap remains a key signal, helping Bing prioritize URLs for recrawling and reindexing, or skip them entirely if the content hasn't changed since the last crawl.",
    derive: { kind: "bing_sitemap_lastmod" },
  },
  {
    key: "crawler_googlebot",
    label: "Googlebot may fetch the home page",
    party: "Google",
    source_id: "G-CRAWLERS",
    section: "Crawler reference",
    quote: null,
    derive: { kind: "crawler", token: "Googlebot" },
  },
  {
    key: "crawler_bingbot",
    label: "bingbot may fetch the home page",
    party: "Microsoft",
    source_id: "B-ROBOTS-2012",
    section: "Crawler reference",
    quote: null,
    derive: { kind: "crawler", token: "bingbot" },
  },
  {
    key: "crawler_oai_searchbot",
    label: "OAI-SearchBot may fetch the home page",
    party: "OpenAI",
    source_id: "OPENAI-BOTS",
    section: "Crawler reference",
    quote: "used to surface websites in search results in ChatGPT's search features",
    derive: { kind: "crawler", token: "OAI-SearchBot" },
  },
  {
    key: "crawler_claude_searchbot",
    label: "Claude-SearchBot may fetch the home page",
    party: "Anthropic",
    source_id: "ANTHROPIC-BOTS",
    section: "Crawler reference",
    quote: "may reduce your site's visibility",
    derive: { kind: "crawler", token: "Claude-SearchBot" },
  },
  {
    key: "crawler_perplexitybot",
    label: "PerplexityBot may fetch the home page",
    party: "Perplexity",
    source_id: "PERPLEXITY-BOTS",
    section: "Crawler reference",
    quote: "designed to surface and link websites in search results on Perplexity",
    derive: { kind: "crawler", token: "PerplexityBot" },
  },
  {
    key: "crawler_applebot",
    label: "Applebot may fetch the home page",
    party: "Apple",
    source_id: "APPLEBOT",
    section: "Crawler reference",
    quote: null,
    derive: { kind: "crawler", token: "Applebot" },
  },
  {
    key: "crawler_meta_webindexer",
    label: "meta-webindexer may fetch the home page",
    party: "Meta",
    source_id: "META-CRAWLERS",
    section: "Crawler reference",
    quote: null,
    derive: { kind: "crawler", token: "meta-webindexer" },
  },
  {
    key: "llms_txt",
    label: "/llms.txt for agents that read it; Google Search ignores the file",
    party: "Google (ignores it); the llms.txt proposal",
    source_id: "G-AI-OPT",
    section: "Mythbusting generative AI search: what you don't need to do",
    quote: "Doing so will neither harm nor help your site's visibility or rankings in Google Search, as Google Search ignores them.",
    derive: { kind: "llms_txt" },
  },
];
