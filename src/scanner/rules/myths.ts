/** KNOWLEDGE.md §6 Myth guard: claims the scanner never scores. */

export interface Myth {
  claim: string;
  verdict: string;
  /** The "What the source says" cell verbatim. */
  evidence: string;
  /** Registry IDs parsed from the Source cell; empty when none is registered. */
  source_ids: string[];
  /** The Source cell as written. */
  source: string;
}

/** The paragraph under "## 6. Myth guard: claims the scanner never scores", verbatim. */
export const MYTH_GUARD_INTRO: string =
  "Each row is a claim that circulates widely and is contradicted, dismissed or unsupported by the primary record. The scanner must never emit a fail for these, under any configuration, and must never recommend them. One carve-out: heading levels are scored by SEO-HDG-02 strictly as HTML Standard conformance (C3), and its reason must never connect heading order to Google. When the report touches one of these topics, it uses the stated verdict. A house convention that overlaps a myth (for example, a title-length hint) may exist only as a -HC info item, and its text must quote the source below.";

export const MYTHS: Myth[] = [
  {
    claim: "Titles must be about 60 characters",
    verdict: "Contradicted",
    evidence:
      "\"While there's no limit on how long a <title> element can be, the title link is truncated in Google Search results as needed\"",
    source_ids: ["G-TITLE"],
    source: "G-TITLE",
  },
  {
    claim: "Meta descriptions must be about 155 to 160 characters",
    verdict: "Contradicted",
    evidence: "\"There's no limit on how long a meta description can be\"",
    source_ids: ["G-SNIPPET"],
    source: "G-SNIPPET",
  },
  {
    claim: "A missing meta description is an error",
    verdict: "Not supported",
    evidence:
      "Snippets \"are primarily created from the page content itself\"; the scanner reports a missing description as an opportunity (SEO-META-02C), never as a failure",
    source_ids: ["G-SNIPPET"],
    source: "G-SNIPPET",
  },
  {
    claim: "Every page needs exactly one H1",
    verdict: "Not supported",
    evidence:
      "Google: heading order doesn't matter for Search; the HTML Standard allows several top-level headings",
    source_ids: ["G-STARTER", "WHATWG-SECTIONS"],
    source: "G-STARTER; WHATWG-SECTIONS",
  },
  {
    claim: "Heading order affects Google rankings",
    verdict: "Contradicted",
    evidence:
      "\"from Google Search perspective, it doesn't matter if you're using them out of order.\"",
    source_ids: ["G-STARTER"],
    source: "G-STARTER",
  },
  {
    claim: "The meta keywords tag helps",
    verdict: "Contradicted",
    evidence: "\"Google Search doesn't use the keywords meta tag.\"",
    source_ids: ["G-STARTER"],
    source: "G-STARTER",
  },
  {
    claim: "Keyword density should be a set percentage",
    verdict: "Not supported",
    evidence: "No figure is published; keyword stuffing violates spam policies",
    source_ids: ["G-SPAM"],
    source: "G-SPAM",
  },
  {
    claim: "Pages need a minimum word count; longer content ranks better",
    verdict: "Contradicted",
    evidence:
      "\"The length of the content alone doesn't matter for ranking purposes\"; on a preferred word count: \"(No, we don't.)\"",
    source_ids: ["G-STARTER", "G-HELPFUL"],
    source: "G-STARTER; G-HELPFUL",
  },
  {
    claim: "Schema markup boosts rankings",
    verdict: "Not supported",
    evidence: "Structured data enables, but does not guarantee, rich results",
    source_ids: ["G-SD-POLICIES"],
    source: "G-SD-POLICIES",
  },
  {
    claim: "Special markup or files are needed for AI search",
    verdict: "Contradicted (Google)",
    evidence: "\"there's no special schema.org markup you need to add\"",
    source_ids: ["G-AI-OPT"],
    source: "G-AI-OPT",
  },
  {
    claim: "llms.txt is required for AI visibility",
    verdict: "Contradicted (Google)",
    evidence: "Google Search ignores llms.txt; it \"will neither harm nor help\"",
    source_ids: ["G-AI-OPT"],
    source: "G-AI-OPT",
  },
  {
    claim: "Sitemap priority and changefreq matter",
    verdict: "Contradicted",
    evidence:
      "Google ignores both; Bing says they \"do not influence how your content is crawled or ranked\"",
    source_ids: ["G-SITEMAP-BUILD", "B-SITEMAP-2025"],
    source: "G-SITEMAP-BUILD; B-SITEMAP-2025",
  },
  {
    claim: "A sitemap improves rankings",
    verdict: "Not supported",
    evidence: "Sitemaps help discovery and do not guarantee crawling or indexing",
    source_ids: ["G-SITEMAP-OVERVIEW"],
    source: "G-SITEMAP-OVERVIEW",
  },
  {
    claim: "Submitting or listing a URL guarantees indexing",
    verdict: "Contradicted",
    evidence:
      "Google does not guarantee it will crawl, index or serve a page, even one that follows Search Essentials",
    source_ids: ["G-HOW-SEARCH-WORKS", "G-URL-INSPECTION"],
    source: "G-HOW-SEARCH-WORKS; G-URL-INSPECTION",
  },
  {
    claim: "A perfect PageSpeed score is needed",
    verdict: "Contradicted",
    evidence:
      "Good tool results don't guarantee top ranking; chasing a perfect score for SEO \"may not be the best use of your time\"",
    source_ids: ["G-PAGE-EXP"],
    source: "G-PAGE-EXP",
  },
  {
    claim: "HTTPS gives a direct ranking boost",
    verdict: "Not established",
    evidence:
      "A \"very lightweight signal\" in 2014; the current page experience documentation says aspects beyond Core Web Vitals \"don't directly help\" ranking",
    source_ids: ["G-HTTPS-2014", "G-PAGE-EXP"],
    source: "G-HTTPS-2014; G-PAGE-EXP",
  },
  {
    claim: "Duplicate content triggers a penalty",
    verdict: "Contradicted",
    evidence: "Ordinary duplication is \"not a violation of Google's spam policies\"",
    source_ids: ["G-CANONICALIZATION"],
    source: "G-CANONICALIZATION",
  },
  {
    claim: "nofollow links are never crawled",
    verdict: "Overstated",
    evidence:
      "Such links \"will generally not be followed\"; linked pages may still be crawled by other paths",
    source_ids: ["G-QUALIFY"],
    source: "G-QUALIFY",
  },
  {
    claim: "Linking out to authoritative sites boosts rankings",
    verdict: "Not supported",
    evidence:
      "External links \"can help establish trustworthiness (for example, citing your sources)\"; no ranking gain is documented",
    source_ids: ["G-LINKS"],
    source: "G-LINKS",
  },
  {
    claim: "E-E-A-T is a ranking factor",
    verdict: "Contradicted",
    evidence: "\"E-E-A-T itself isn't a specific ranking factor\"",
    source_ids: ["G-HELPFUL"],
    source: "G-HELPFUL",
  },
  {
    claim: "AI-generated content is automatically penalized",
    verdict: "Context dependent",
    evidence:
      "Scaled content abuse applies \"no matter how it's created\"; using AI is not itself a violation",
    source_ids: ["G-SPAM", "G-HELPFUL"],
    source: "G-SPAM; G-HELPFUL",
  },
  {
    claim: "A .com outranks other TLDs",
    verdict: "Contradicted",
    evidence: "TLD impact on Google performance: \"No.\"",
    source_ids: ["G-SITE-POSITION-FAQ"],
    source: "G-SITE-POSITION-FAQ",
  },
  {
    claim: "Keywords in the domain or URL rank pages",
    verdict: "Overstated",
    evidence:
      "Keywords in the domain or path \"alone have hardly any effect beyond appearing in breadcrumbs\"",
    source_ids: ["G-STARTER"],
    source: "G-STARTER",
  },
  {
    claim: "Blocking GPTBot removes a site from ChatGPT search",
    verdict: "Contradicted",
    evidence:
      "OAI-SearchBot governs ChatGPT search; \"Each setting is independent of the others\"",
    source_ids: ["OPENAI-BOTS"],
    source: "OPENAI-BOTS",
  },
  {
    claim: "Blocking Google-Extended removes a site from Google Search",
    verdict: "Contradicted",
    evidence:
      "Google-Extended \"does not impact a site's inclusion in Google Search nor is it used as a ranking signal\"",
    source_ids: ["G-CRAWLERS"],
    source: "G-CRAWLERS",
  },
  {
    claim: "Bounce rate or analytics data are ranking factors",
    verdict: "Not supported",
    evidence: "No reviewed Google document names them",
    source_ids: ["G-GA-SC"],
    source: "G-GA-SC",
  },
  {
    claim: "Buying ads improves organic rankings",
    verdict: "Contradicted",
    evidence:
      "Participation in an advertising program \"doesn't positively or negatively affect inclusion or ranking\"",
    source_ids: ["G-SITE-POSITION-FAQ"],
    source: "G-SITE-POSITION-FAQ",
  },
  {
    claim: "Third-party \"authority\" scores are engine metrics",
    verdict: "Not supported",
    evidence: "No engine publishes such scores; they are vendor constructs",
    source_ids: [],
    source: "(absence in all registered sources)",
  },
];
