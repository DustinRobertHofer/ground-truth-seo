# Source Registry

Every source the scanner may cite, with a stable ID

Ruleset 2.0.0 · Knowledge cutoff 2026-09-28 · Partial re-verification 2026-10-03

---

## How to use this registry

- `KNOWLEDGE.md` cites sources only by the IDs below. A finding's citation carries the ID, the section, the verbatim quote stored in `KNOWLEDGE.md`, and the "Last updated" value from this table.
- "Last updated" is what the page itself displayed. "not stated" means the page shows no date; the access date then stands in for it.
- "Verified" is the date the cited wording was last read on the live page. 2026-09-28 is the book's research access date. 2026-10-03 marks sources whose stored quotes were checked verbatim against the live page for this ruleset.
- The build should repeat that check: fetch each source, strip markup, normalize whitespace and quote marks, and confirm every stored quote is an exact substring. A failure blocks the release until a person re-reads the page.
- IDs are permanent. When a page moves, update its URL here and keep the ID. When a page is withdrawn, mark it withdrawn and retire or reclassify the rules that cite it (`KNOWLEDGE.md` §9).
- Which rules cite which source is derived by the build from `KNOWLEDGE.md`, never maintained by hand here.
- Only primary sources belong here: the engine, standards body or operator that owns the system being described.

## Google Search Central and Google crawling documentation

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| G-TECH | Google Search technical requirements | https://developers.google.com/search/docs/essentials/technical | 2025-12-18 | 2026-10-03 |
| G-HOW-SEARCH-WORKS | In-depth guide to how Google Search works | https://developers.google.com/search/docs/fundamentals/how-search-works | 2025-12-18 | 2026-09-28 |
| G-STARTER | Search Engine Optimization (SEO) Starter Guide | https://developers.google.com/search/docs/fundamentals/seo-starter-guide | 2025-12-10 | 2026-10-03 |
| G-HELPFUL | Creating helpful, reliable, people-first content | https://developers.google.com/search/docs/fundamentals/creating-helpful-content | 2025-12-10 | 2026-10-03 |
| G-SPAM | Spam policies for Google web search | https://developers.google.com/search/docs/essentials/spam-policies | 2026-08-28 | 2026-10-03 |
| G-HTTP | How HTTP status codes, and network and DNS errors affect Google Search | https://developers.google.com/crawling/docs/troubleshooting/http-status-codes | 2026-02-04 | 2026-10-03 |
| G-BOT | Googlebot | https://developers.google.com/search/docs/crawling-indexing/googlebot | 2026-02-03 | 2026-10-03 |
| G-CRAWLERS | Google's common crawlers | https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers | 2026-07-14 | 2026-10-03 |
| G-USER-FETCHERS | Google's user-triggered fetchers | https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers | 2026-08-19 | 2026-10-03 |
| G-VERIFY | Verify requests from Google crawlers and fetchers | https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests | 2026-03-20 | 2026-09-28 |
| G-ROBOTS-SPEC | How Google interprets the robots.txt specification | https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec | 2026-08-31 | 2026-10-03 |
| G-ROBOTS-INTRO | Introduction to robots.txt | https://developers.google.com/search/docs/crawling-indexing/robots/intro | 2025-12-10 | 2026-10-03 |
| G-NOINDEX | Block Search indexing with noindex | https://developers.google.com/search/docs/crawling-indexing/block-indexing | 2025-12-10 | 2026-10-03 |
| G-ROBOTS-META | Robots meta tag, data-nosnippet, and X-Robots-Tag specifications | https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag | 2026-03-24 | 2026-10-03 |
| G-META-TAGS | Meta tags and attributes that Google supports | https://developers.google.com/search/docs/crawling-indexing/special-tags | 2025-12-10 | 2026-10-03 |
| G-URL | URL structure best practices for Google Search | https://developers.google.com/search/docs/crawling-indexing/url-structure | 2025-12-10 | 2026-10-03 |
| G-FACET | Managing crawling of faceted navigation URLs | https://developers.google.com/crawling/docs/faceted-navigation | 2025-12-18 | 2026-10-03 |
| G-CANON | How to specify a canonical URL with rel="canonical" and other methods | https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls | 2026-07-10 | 2026-10-03 |
| G-CANONICALIZATION | What is URL canonicalization | https://developers.google.com/search/docs/crawling-indexing/canonicalization | 2026-08-20 | 2026-10-03 |
| G-REDIRECTS | Redirects and Google Search | https://developers.google.com/search/docs/crawling-indexing/301-redirects | 2026-04-14 | 2026-10-03 |
| G-SITEMOVE | Site moves with URL changes | https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes | 2026-08-20 | 2026-10-03 |
| G-SITEMAP-BUILD | Build and submit a sitemap | https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap | 2026-07-08 | 2026-10-03 |
| G-SITEMAP-OVERVIEW | What is a sitemap | https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview | 2025-12-10 | 2026-09-28 |
| G-LINKS | SEO link best practices for Google | https://developers.google.com/search/docs/crawling-indexing/links-crawlable | 2025-12-10 | 2026-10-03 |
| G-QUALIFY | Qualify your outbound links to Google | https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links | 2025-12-10 | 2026-10-03 |
| G-LAZY | Fix lazy-loaded content | https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading | 2025-12-10 | 2026-10-03 |
| G-JS | Understand the JavaScript SEO basics | https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics | 2026-03-04 | 2026-10-03 |
| G-DYNAMIC | Dynamic rendering as a workaround | https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering | 2025-12-10 | 2026-10-03 |
| G-MOBILE | Mobile site and mobile-first indexing best practices | https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing | 2025-12-10 | 2026-10-03 |
| G-TITLE | Influencing your title links in search results | https://developers.google.com/search/docs/appearance/title-link | 2025-12-10 | 2026-10-03 |
| G-SNIPPET | Control your snippets in search results | https://developers.google.com/search/docs/appearance/snippet | 2026-04-20 | 2026-10-03 |
| G-FAVICON | Define a favicon to show in search results | https://developers.google.com/search/docs/appearance/favicon-in-search | 2026-08-28 | 2026-10-03 |
| G-SITENAME | Provide a site name to Google Search | https://developers.google.com/search/docs/appearance/site-names | 2025-12-10 | 2026-10-03 |
| G-IMAGES | Google image SEO best practices | https://developers.google.com/search/docs/appearance/google-images | 2026-03-02 | 2026-10-03 |
| G-PAGE-EXP | Understanding page experience in Google Search results | https://developers.google.com/search/docs/appearance/page-experience | 2026-09-22 | 2026-10-03 |
| G-AI | AI features and your website | https://developers.google.com/search/docs/appearance/ai-features | 2025-12-10 | 2026-10-03 |
| G-AI-OPT | Optimizing your website for generative AI features on Google Search | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide | 2026-07-10 | 2026-10-03 |
| G-SD-POLICIES | General structured data guidelines | https://developers.google.com/search/docs/appearance/structured-data/sd-policies | 2026-07-10 | 2026-10-03 |
| G-ORG | Organization (Organization) structured data | https://developers.google.com/search/docs/appearance/structured-data/organization | 2026-09-08 | 2026-10-03 |
| G-BREADCRUMB | Breadcrumb (BreadcrumbList) structured data | https://developers.google.com/search/docs/appearance/structured-data/breadcrumb | 2026-09-08 | 2026-10-03 |
| G-VR | Vacation rental (VacationRental) structured data | https://developers.google.com/search/docs/appearance/structured-data/vacation-rental | 2026-09-08 | 2026-10-03 |
| G-HREFLANG | Tell Google about localized versions of your page | https://developers.google.com/search/docs/specialty/international/localized-versions | 2026-09-21 | 2026-10-03 |
| G-MULTIREGIONAL | Managing multi-regional and multilingual sites | https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites | 2025-12-10 | 2026-09-28 |
| G-UPDATES | Latest Google Search Documentation Updates | https://developers.google.com/search/updates | continuously updated | 2026-10-03 |
| G-SITE-POSITION-FAQ | FAQ: Site position in Google Search | https://developers.google.com/search/help/site-position-in-search-faq | 2026-05-06 | 2026-10-03 |
| G-GA-SC | Using Search Console and Google Analytics data for SEO | https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console | 2026-01-07 | 2026-09-28 |
| G-HTTPS-2014 | HTTPS as a ranking signal (Google Search Central Blog) | https://developers.google.com/search/blog/2014/08/https-as-ranking-signal | posted 2014-08-07 | 2026-10-03 |

## Google Search Console Help

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| G-HTTPS-REPORT | HTTPS report | https://support.google.com/webmasters/answer/11396518?hl=en | not stated | 2026-10-03 |
| G-PIR | Page indexing report | https://support.google.com/webmasters/answer/7440203?hl=en | not stated | 2026-09-28 |
| G-URL-INSPECTION | URL Inspection tool | https://support.google.com/webmasters/answer/9012289 | not stated | 2026-09-28 |
| G-SC-SITEMAPS | Manage your sitemaps using the Sitemaps report | https://support.google.com/webmasters/answer/7451001?hl=en | not stated | 2026-09-28 |
| G-VERIFY-SC | Verify your site ownership | https://support.google.com/webmasters/answer/9008080?hl=en | not stated | 2026-10-03 |
| G-SC-AI-CONTROL | Search generative AI control | https://support.google.com/webmasters/answer/16908024?hl=en | not stated (page reports rollout completed 2026-08-31) | 2026-09-28 |

## Chrome and web.dev

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| WEBDEV-VITALS | Web Vitals | https://web.dev/articles/vitals | 2024-10-31 | 2026-10-03 |
| CRUX-METHOD | CrUX methodology | https://developer.chrome.com/docs/crux/methodology | 2024-06-20 | 2026-10-03 |
| WEBDEV-LCP | Largest Contentful Paint (LCP) | https://web.dev/articles/lcp | 2025-09-04 | 2026-10-16 |
| WEBDEV-INP | Interaction to Next Paint (INP) | https://web.dev/articles/inp | 2025-09-02 | 2026-10-16 |
| WEBDEV-CLS | Cumulative Layout Shift (CLS) | https://web.dev/articles/cls | 2023-04-12 | 2026-10-16 |
| WEBDEV-FCP | First Contentful Paint (FCP) | https://web.dev/articles/fcp | 2023-12-06 | 2026-10-16 |
| WEBDEV-TTFB | Time to First Byte (TTFB) | https://web.dev/articles/ttfb | 2025-11-28 | 2026-10-16 |
| WEBDEV-THRESHOLDS | How the Core Web Vitals metrics thresholds were defined | https://web.dev/articles/defining-core-web-vitals-thresholds | 2025-05-07 | 2026-10-16 |
| WEBDEV-OPT-LCP | Optimize Largest Contentful Paint | https://web.dev/articles/optimize-lcp | 2025-03-31 | 2026-10-16 |
| WEBDEV-OPT-INP | Optimize Interaction to Next Paint | https://web.dev/articles/optimize-inp | 2025-09-02 | 2026-10-16 |
| WEBDEV-OPT-CLS | Optimize Cumulative Layout Shift | https://web.dev/articles/optimize-cls | 2025-02-07 | 2026-10-16 |
| WEBDEV-OPT-TTFB | Optimize Time to First Byte | https://web.dev/articles/optimize-ttfb | 2025-11-28 | 2026-10-16 |
| CRUX-METRICS | CrUX metrics | https://developer.chrome.com/docs/crux/methodology/metrics | 2026-10-13 | 2026-10-16 |
| PSI-ABOUT | About PageSpeed Insights | https://developers.google.com/speed/docs/insights/v5/about | 2024-10-21 | 2026-10-16 |

## Microsoft Bing

Bing's Webmaster Guidelines and most help-center pages render client-side and could not be read as text for the book. Bing rules rest on these dated posts and Microsoft Support.

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| MS-BING-RANK | How Bing delivers search results (Microsoft Support) | https://support.microsoft.com/en-us/topic/how-bing-delivers-search-results-d18fc815-ac37-4723-bc67-9229ce3eb6a3 | March 2025 | 2026-10-03 |
| B-ROBOTS-2012 | To crawl or not to crawl, that is BingBot's question | https://blogs.bing.com/webmaster/May-2012/To-crawl-or-not-to-crawl,-that-is-BingBot-s-questi | posted 2012-05-03 | 2026-10-03 |
| B-NOARCHIVE-2023 | Announcing new options for webmasters to control usage of their content in Bing Chat | https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat | posted 2023-09-22 | 2026-09-28 |
| B-BWT-2025 | Start Using Bing Webmaster Tools to Improve Your Site Visibility | https://blogs.bing.com/webmaster/2025/6/Start-Using-Bing-Webmaster-Tools-to-Improve-Your-Site-Visibility/ | posted 2025-06-17 | 2026-09-28 |
| B-SITEMAP-2025 | Keeping Content Discoverable with Sitemaps in AI Powered Search | https://blogs.bing.com/webmaster/2025/7/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search/ | posted 2025-07-31 | 2026-10-03 |
| B-NOSNIPPET | Bing Introduces Support for the data-nosnippet HTML Attribute | https://blogs.bing.com/webmaster/October-2025/Bing-Introduces-Support-for-the-data-nosnippet-HTML-Attribute | posted 2025-10-15 | 2026-09-28 |
| B-DUP | Does Duplicate Content Hurt SEO and AI Search Visibility? | https://blogs.bing.com/webmaster/December-2025/Does-Duplicate-Content-Hurt-SEO-and-AI-Search-Visibility | posted 2025-12-19 | 2026-10-03 |
| B-VERIFY | Verify Bingbot | https://www.bing.com/toolbox/verify-bingbot | not stated | 2026-09-28 |
| B-AI-PERF | Introducing AI Performance in Bing Webmaster Tools Public Preview | https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/ | posted 2026-02-10 | 2026-10-04 |
| MS-AI-ANSWERS | Optimizing Your Content for Inclusion in AI Search Answers (Microsoft Advertising blog, by Krishna Madhavan of Microsoft Bing; linked from B-AI-PERF as Bing's deeper guidance) | https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers | posted 2025-10-08 | 2026-10-04 |

## Standards bodies and protocols

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| RFC9309 | RFC 9309: Robots Exclusion Protocol | https://www.rfc-editor.org/rfc/rfc9309.html | September 2022 | 2026-10-03 |
| RFC6596 | RFC 6596: The Canonical Link Relation | https://www.rfc-editor.org/rfc/rfc6596.html | April 2012 | 2026-10-03 |
| RFC3986 | RFC 3986: Uniform Resource Identifier (URI): Generic Syntax (IETF STD 66) | https://www.rfc-editor.org/rfc/rfc3986.html | January 2005 | 2026-10-03 |
| SITEMAPS-ORG | Sitemaps XML format (protocol) | https://www.sitemaps.org/protocol.html | 2016-11-21 | 2026-10-03 |
| INDEXNOW-DOC | IndexNow documentation | https://www.indexnow.org/documentation | not stated | 2026-09-28 |
| INDEXNOW-FAQ | IndexNow FAQ | https://www.indexnow.org/faq | not stated | 2026-09-28 |
| WHATWG-SEM | HTML Standard: 4.2 Document metadata (and 4.1 The document element) | https://html.spec.whatwg.org/multipage/semantics.html | Living Standard | 2026-10-03 (4.2.5 read via the developer edition, https://html.spec.whatwg.org/dev/semantics.html) |
| WHATWG-SECTIONS | HTML Standard: 4.3 Sections (headings and outlines) | https://html.spec.whatwg.org/multipage/sections.html | Living Standard | 2026-10-03 |
| WHATWG-EMBED | HTML Standard: 4.8 Embedded content (img, lazy loading) | https://html.spec.whatwg.org/multipage/embedded-content.html | Living Standard | 2026-10-03 |
| W3C-HEADINGS | Headings (W3C WAI Page Structure Tutorial) | https://www.w3.org/WAI/tutorials/page-structure/headings/ | 2017-05-04 | 2026-10-03 |
| WCAG-111 | Understanding Success Criterion 1.1.1: Non-text Content (WCAG 2.2) | https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html | not stated | 2026-09-28 |

## AI crawler operators

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| OPENAI-BOTS | Overview of OpenAI Crawlers | https://developers.openai.com/api/docs/bots | not stated | 2026-10-03 |
| ANTHROPIC-BOTS | Does Anthropic crawl data from the web, and how can site owners block the crawler? | https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler | 2026-04-07 | 2026-10-03 |
| PERPLEXITY-BOTS | Perplexity Crawlers | https://docs.perplexity.ai/docs/resources/perplexity-crawlers | not stated | 2026-10-03 |
| APPLEBOT | About Applebot | https://support.apple.com/en-us/119829 | 2026-09-04 | 2026-10-03 |
| CC-FAQ | Common Crawl FAQ | https://commoncrawl.org/faq | not stated | 2026-09-28 |
| META-CRAWLERS | Meta Web Crawlers | https://developers.facebook.com/docs/sharing/webmasters/web-crawlers | not stated | 2026-10-03 |

## Format proposals

The owner of a proposed format is its primary source for what the format is. These sources never support a claim about how a search engine treats the format.

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| LLMSTXT | The /llms.txt file, v2 (proposal by Jeremy Howard) | https://llmstxt.org/ | 2026-08-10 | 2026-10-04 |

## Security testing and secret formats

Sources for the security checker's exposure checks (`KNOWLEDGE.md` §12). None of them backs an SEO rule. OWASP is the primary source for web security testing practice; each other source is the project that owns the format or tool it describes.

| ID | Title | URL | Last updated | Verified |
|---|---|---|---|---|
| OWASP-WSTG-INFO-05 | Review Web Page Content for Information Leakage (OWASP Web Security Testing Guide, WSTG-INFO-05) | https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/05-Review_Web_Page_Content_for_Information_Leakage | not stated (latest) | 2026-10-06 (source file) |
| OWASP-WSTG-CONF-04 | Review Old Backup and Unreferenced Files for Sensitive Information (OWASP Web Security Testing Guide, WSTG-CONF-04) | https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information | not stated (latest) | 2026-10-06 (source file) |
| OWASP-SECRETS | Secrets Management Cheat Sheet (OWASP Cheat Sheet Series) | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html | not stated | 2026-10-06 (source file) |
| GIT-HTTP | gitprotocol-http: Git HTTP-based protocols | https://git-scm.com/docs/gitprotocol-http | not stated (Git documentation, master) | 2026-10-06 (source file) |
| GIT-CRED-STORE | git-credential-store: Helper to store credentials on disk | https://git-scm.com/docs/git-credential-store | not stated (Git documentation, master) | 2026-10-06 (source file) |
| GH-TOKENS | About authentication to GitHub | https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github | not stated | 2026-10-06 (source file) |
| ECMA-426 | ECMA-426: Source map format specification | https://tc39.es/ecma426/ | not stated (editor's draft) | 2026-10-06 (source file) |
| WHATWG-URL | URL Standard | https://url.spec.whatwg.org/ | Living Standard | 2026-10-06 (source file) |
| OPENSSL-FORMAT | openssl-format-options: OpenSSL command input and output format options | https://docs.openssl.org/master/man1/openssl-format-options/ | not stated (OpenSSL documentation, master) | 2026-10-06 (source file) |
| NEXT-SOURCEMAPS | productionBrowserSourceMaps (Next.js documentation) | https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps | not stated | 2026-10-06 (source file) |
| NEXT-ENV | How to use environment variables in Next.js | https://nextjs.org/docs/app/guides/environment-variables | not stated | 2026-10-06 (source file) |
| OWASP-API3 | API3:2023 Broken Object Property Level Authorization (OWASP API Security Top 10 2023) | https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/ | not stated (2023 edition) | 2026-10-06 (source file) |
| NEXT-DATA-SECURITY | How to think about data security in Next.js | https://nextjs.org/docs/app/guides/data-security | not stated | 2026-10-06 (source file) |
| REACT-TAINT-OBJECT | experimental_taintObjectReference (React reference) | https://react.dev/reference/react/experimental_taintObjectReference | not stated | 2026-10-06 (source file) |
| REACT-TAINT-VALUE | experimental_taintUniqueValue (React reference) | https://react.dev/reference/react/experimental_taintUniqueValue | not stated | 2026-10-06 (source file) |

## Re-verification log

| Date | Sources re-read | Result |
|---|---|---|
| 2026-10-03 | G-BOT, G-CANON, G-FAVICON, G-HREFLANG, G-IMAGES, G-LINKS, G-ROBOTS-META, G-ROBOTS-SPEC, G-SITENAME, G-SNIPPET, G-TITLE, G-VR, RFC6596, SITEMAPS-ORG, WHATWG-SEM | Pages re-read for the rule logic. Corrections to the book's Deliverable 5 recorded in `KNOWLEDGE.md` §1.4. G-VR added. |
| 2026-10-03 | Every source with a quote in `KNOWLEDGE.md` (all rows marked 2026-10-03) | Two independent reviews, then an automated exact-substring check of every stored quote of 14 characters or more (239 quotes) against the live pages. Quotes that the book had trimmed or punctuated differently were replaced with the live wording, section labels were corrected, and G-USER-FETCHERS and RFC3986 were registered. Final result: all 239 match. |
| 2026-10-04 | G-AI-OPT, G-HELPFUL, G-SNIPPET, G-STARTER, G-TITLE, B-AI-PERF, MS-AI-ANSWERS, LLMSTXT | Read on the live pages for the review guidance in `KNOWLEDGE.md` §11. B-AI-PERF, MS-AI-ANSWERS and LLMSTXT registered. The Verified dates of the five Google sources are unchanged because the rule quotes they back were not re-checked; their §11 quotes date from this reading. |
| 2026-10-06 | OWASP-WSTG-INFO-05, OWASP-WSTG-CONF-04, OWASP-SECRETS, GIT-HTTP, GIT-CRED-STORE, GH-TOKENS, ECMA-426, WHATWG-URL, OPENSSL-FORMAT, NEXT-SOURCEMAPS, NEXT-ENV | Registered for `KNOWLEDGE.md` §12. The rendered pages could not be reached from the build environment, so every quote was read in the file each page is published from and checked as an exact substring after stripping markup and normalizing whitespace: OWASP/wstg at commit 4182523, OWASP/CheatSheetSeries at 29994dd, git/git `Documentation/` at 5a7d1e8, github/docs at b976e25 (with its `product.yml` variables expanded), tc39/ecma426 `spec.emu` at c724f0f, whatwg/url `url.bs` and openssl/openssl `doc/man1/openssl-format-options.pod` on their main branches, and the Next.js documentation shipped in next 16.2.4 and on vercel/next.js canary. All 26 citation quotes match. "Verified" carries "(source file)" until a person re-reads the rendered pages; "Last updated" was not read for the same reason. |
| 2026-10-06 | OWASP-API3, NEXT-DATA-SECURITY, REACT-TAINT-OBJECT, REACT-TAINT-VALUE | Registered for `SEC-DATA-01` and `SEC-DATA-02` (`KNOWLEDGE.md` §12, exposure checks 1.1.0). As with the first §12 sources, the rendered pages could not be reached from the build environment, so every quote was read in the file each page is published from and checked as an exact substring after stripping markup and normalizing whitespace and quote marks: OWASP/API-Security `editions/2023/en/0xa3-broken-object-property-level-authorization.md` at 33cea37, the Next.js documentation shipped in next 16.2.4 (`dist/docs/01-app/02-guides/data-security.md`) and on vercel/next.js canary at 0e912cb, and reactjs/react.dev `src/content/reference/react/` at 046f17d. All 7 citation quotes match. "Verified" carries "(source file)" until a person re-reads the rendered pages; "Last updated" was not read for the same reason. |
| 2026-10-16 | WEBDEV-LCP, WEBDEV-INP, WEBDEV-CLS, WEBDEV-FCP, WEBDEV-TTFB, WEBDEV-THRESHOLDS, WEBDEV-OPT-LCP, WEBDEV-OPT-INP, WEBDEV-OPT-CLS, WEBDEV-OPT-TTFB, CRUX-METRICS, PSI-ABOUT | Registered for `KNOWLEDGE.md` §13 (performance diagnostics 1.0.0) and read on the live pages. Every §13 quote, 55 in all, was checked as an exact substring of the rendered page after stripping markup and normalizing whitespace and quote marks; all match. The §13 statement quoting G-PAGE-EXP uses the page's current section label, "What aspects of page experience are used in ranking?"; the G-PAGE-EXP row and its rule quotes were not re-checked. |
