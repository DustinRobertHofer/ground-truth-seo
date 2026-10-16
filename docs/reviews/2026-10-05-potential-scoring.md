# Review: scoring against the best a site could do

2026-10-05 · Ruleset 1.0.0 reviewed, 2.0.0 shipped with this review

Dustin asked for the score to measure a site against the best it could do, not against how well it presents what it already has, and said he does not agree with the "No source, no score" principle because he wants the scanner to help companies improve their SEO and GEO. This document reviews the whole system from that angle: what the 1.0.0 design actually measured, what changed in 2.0.0, what still sits outside the score and why, and the decisions that remain his.

## 1. What the 1.0.0 score measured

The 1.0.0 formula was a weighted pass rate over the rules that applied. A rule applied only when the mechanism it checks was present. That produced three effects, all of them the opposite of what Dustin wants.

**Absence was invisible.** A site with no structured data had no structured data rules in its denominator. A site with no sitemap, no meta descriptions, no favicon and no stated site name reported those facts as information and scored 100 if the little it had was well formed. The baseline fixture, a three-page site with every practice in place, scored 100. The same three pages stripped of those practices also scored 100.

**Investment was punished.** A site that added JSON-LD and got one required property wrong scored lower than a site that added nothing. A site that published a sitemap with date-only lastmod values lost points its neighbour without a sitemap kept.

**The denominator shrank with effort.** Because `Σ w_r` ran over applicable rules only, doing less raised the score. That is a grade of presentation, not of distance from the best setup.

The principle behind it, as the home page put it, was "No source, no score: a check can move the score only when a primary source supports it." That sentence conflated two things. One is that every check needs a documented source. The other is that a documented practice with no engine-stated consequence for its absence (a sitemap "isn't required", snippets come "primarily from the page content") should carry zero weight. The second reading is what made absence free. Several of those practices are plainly recommended by the engines in words already stored in the knowledge base.

## 2. What 2.0.0 changes

### The principle

Principle 1 now reads "Scored against the best you could do." The score measures distance from the best setup the engines and standards document, so a documented practice counts whether or not the site has started on it. Absence is an opportunity: not a pass by default, not a failure.

Sourcing stays, and this is the one place where this review pushes back on the request as phrased. Every check still rests on a primary source registered in SOURCES.md, for three reasons. The source is what makes a recommendation worth acting on for a site owner, and what lets a consultant forward the report as it stands. The ruleset tests check every emitted quote against KNOWLEDGE.md word for word, and that machinery is the product's credibility. And the folklore the engines contradict (sixty-character titles, one H1, word counts) is exactly what an unsourced "best practice" denominator would let back in. What changed is the consequence of sourcing: a source that recommends a practice now puts that practice in the denominator, instead of being read as "optional, so zero".

### The new status: opportunity

A finding can now be an `opportunity`: the documented practice is absent on the unit and nothing is broken by its absence. It counts as unmet in the score exactly as a fail does. The report shows it as something to add, with the rule's fix, outcome, verification steps and citations, and never calls it an error. Recommendations carry a kind, `fix` or `add`, and the order is gates, then weight, then broken before missing, then reach.

The formula is unchanged in shape. `C` (conformance) is renamed `A` (achieved share), because the denominator now includes practices the site has not adopted, and the arithmetic string reads `Overall S = 100 × eligibility E × achieved A`. The worked example still resolves to 85; its second row is now eight missing descriptions counted as unmet units, which is the point of the change.

### Rules that changed

| Rule | 1.0.0 | 2.0.0 | Basis |
|---|---|---|---|
| `SEO-META-02C` | C4 info: "not an error" | C2 opportunity `absent`, weight 4 per page | G-SNIPPET: "at the very least, create a description for the critical URLs like your home page and popular pages"; "use page-level descriptions everywhere else". Quotes were already stored for the review guidance, read 2026-10-04 |
| `SEO-SITEMAP-08` | C4 info | C2 opportunity `none_found`, weight 4, Bing only | B-SITEMAP-2025: "The lastmod field in your sitemap remains a key signal, helping Bing prioritize URLs for recrawling and reindexing". A site without a sitemap sends that signal for no page. Google still says a sitemap "isn't required", so Google is not an engine of this rule until its overview page is quoted (§4) |
| `SEO-META-05A` `no_icon_link` | C1 fail, "critical" | C1 opportunity, same weight | Nothing is broken; the feature has not been adopted |
| `SEO-SD-04` `missing` | C2 fail | C2 opportunity, same weight | Same reasoning |

Every other rule keeps its class, weight and conditions. The myth guard row "A missing meta description is an error" now says the scanner reports it as an opportunity, never as a failure, which keeps §6 true: no row in it can produce a fail.

### What a bare site scores now

The scoring fixture builds a well-formed three-page site with no sitemap, no descriptions, no favicon link and no WebSite item. In 1.0.0 it scored 100. In 2.0.0:

```
Overall 87 = 100 × eligibility 1 × achieved 13/15
To add: SEO-META-05A (favicon), SEO-META-02C on 3 pages, SEO-SD-04 (site name), SEO-SITEMAP-08
Category scores: sitemaps 0, structured data 0, head 67, everything else 100
```

Nothing is broken, so there are no failures. Eighty-seven is still high, and the reason is honest: the knowledge base documents many more mechanics (status codes, canonicals, robots.txt, redirects) than adoptable practices, and the mechanics all pass. The way to lower that number for a bare site is not to invent weights but to widen the denominator with more documented practices, which is §4 below. The category scores already say where the gaps are.

### GEO

Google's position, quoted in the knowledge base, is that optimizing for generative AI search is still SEO and that no special markup or file is needed. Microsoft documents more: question-and-answer formatting, visible answers, entity consistency, sitemaps with lastmod, and the noarchive control. Almost all of that is editorial and has no testable rubric, which is why it lives in the advisory review (PRODUCT.md §17) and cannot honestly enter a deterministic score.

What is deterministic and documented now has a home. The report carries an AI answers readiness list (KNOWLEDGE.md §10.4): whether pages are eligible to be shown with a snippet (Google's stated condition for AI Overviews and AI Mode), whether pages carry noarchive (Bing says that keeps content out of its answers), whether a sitemap with timed lastmod values exists (Bing's recrawl signal), whether each search crawler (Googlebot, bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot, meta-webindexer) may fetch the home page, and whether /llms.txt exists (optional either way, because Google ignores it). Each line says in place or not, what was observed, and the operator's words. It is derived from findings already made and is never scored, because blocking an AI crawler is a policy choice and the operators promise nothing for allowing one.

## 3. The whole catalog, rule by rule, against this approach

Every rule falls into one of five groups.

**Already measured potential (no change).** The indexing gates (`SEO-HTTP-01`, `-02`, `SEO-ROBOTS-05A`, `SEO-IDX-06`) and every C1 to C3 mechanism rule: canonical placement, head integrity, robots.txt syntax, sitemap limits, hreflang reciprocity, redirect chains, image src and alt, lazy-load dimensions, JSON-LD validity, required properties. These describe how a mechanism must be built; when the mechanism exists they already measure distance from correct.

**Reclassified in 2.0.0.** `SEO-META-02C`, `SEO-SITEMAP-08`, `SEO-META-05A` `no_icon_link`, `SEO-SD-04` `missing` (§2).

**Correctly not applicable.** Rules whose trigger is a kind of content the site may simply not have: every hreflang rule (`SEO-I18N-*`) for a single-language site, `SEO-SD-05` when no Organization declares a logo, `SEO-SD-02` vacation rentals (Google limits the feature to sites with a Technical Account Manager), `SEO-ROBOTS-09` without staging hosts, `SEO-LINK-02` when intent was inferred. Treating these as opportunities would tell a one-language bakery to add hreflang.

**Not evaluated for lack of input.** `SEO-PERF-01` (Core Web Vitals) without CrUX, `SEO-PERF-03` without the parity check, `SEO-JS-01`, `SEO-JS-04`, `SEO-IDX-04`, `SEO-IDX-07` without rendering. Google documents Core Web Vitals as used by its ranking systems, so a site with poor field data is far from its best and the web app currently cannot say so. This is a configuration decision, not a rule change (§5).

**Kept informational, with the reason.** `SEO-AI-01` snippet controls and `SEO-AI-04` noarchive: deliberate policy, now surfaced in the readiness list. `SEO-AI-05` llms.txt and `SEO-META-03` keywords: the engines say they ignore them. `SEO-SITEMAP-05` priority and changefreq: ignored by both engines. `SEO-SD-07` retired features and `SEO-SD-08` AI markup: Google says they earn nothing. `SEO-HTTP-06` conditional requests, `SEO-SITEMAP-06` IndexNow, `SEO-IMG-03` formats, `SEO-SD-03` visible values, `SEO-LINK-01` uncrawlable links, `SEO-LINK-06` error links, the inventories (`SEO-IDX-01`, `SEO-CANON-03`, `SEO-HDG-01`, `SEO-ROBOTS-01`) and the house conventions: either "supported, not recommended" in the source, or the scanner cannot tell intent from outside. `SEO-HEAD-03` viewport is the one informational rule that should move (§4).

## 4. Practices that should count but need a verbatim quote first

The container this review ran in could not reach developers.google.com or blogs.bing.com, so no new quote could be read from a live page, and the ruleset tests refuse a quote that is not in KNOWLEDGE.md. These are the practices that belong in the denominator and the exact passage to read for each. Each is roughly half an hour of work once the page can be fetched.

| Candidate | Change | Where the quote is |
|---|---|---|
| Sitemap recommended by Google | Add `google` to `SEO-SITEMAP-08`'s engines (minor release) | G-SITEMAP-OVERVIEW, section "Do I need a sitemap?" |
| Viewport meta tag | `SEO-HEAD-03` from C4 info to C2 opportunity | G-MOBILE, the viewport guidance under mobile best practices; G-META-TAGS already stored: "Presence of this tag indicates to Google that the page is mobile friendly" (a "supported" statement, not enough alone for C2) |
| Organization structured data on the home page | New rule `SEO-SD-09` (scanner), C2 opportunity `missing` | G-ORG introduction, the sentence on what Organization markup helps Google understand; G-AI-OPT on business details for AI responses is already stored for the review |
| Organization logo declared | `SEO-SD-05` gains an opportunity `no_logo` when an Organization item has no `logo` | G-ORG, "Recommended properties (logo)"; the stored quotes cover size and crawlability, not the recommendation itself |
| BreadcrumbList on pages below the home page | New rule, C2 opportunity, scope to be decided (pages whose path has a directory) | G-BREADCRUMB introduction. Note that breadcrumb rich results show on desktop only since January 2025 |
| IndexNow for Bing | `SEO-SITEMAP-06` from C4 to C2 opportunity, Bing only | INDEXNOW-DOC and B-BWT-2025; neither is quoted verbatim yet |

With these six in place, the bare site in §2 would carry opportunities in head, structured data, sitemaps and tooling at once, and its score would reflect the distance Dustin wants it to.

## 5. Decisions that are Dustin's

1. **Core Web Vitals in the web app.** `SEO-PERF-01` is the only rule backed by a documented ranking system and the web app never evaluates it because CrUX is off. Turning it on needs a Chrome UX Report API key in the environment and a `crux: true` default for web scans. Recommended.
2. **nosnippet as an opportunity.** A page with `nosnippet` is, in Google's words, not eligible as a supporting link in AI Overviews or AI Mode. This review kept it informational because it is a deliberate control, like noindex, and put it in the readiness list. If Dustin would rather have it count, `SEO-AI-01` `nosnippet_policy` becomes a C1 opportunity on pages in `I`; the quote is already stored.
3. **Weight of opportunities.** This review gave an opportunity the weight of its class, so a missing description (C2) weighs 4 like a duplicate one. An alternative is a separate adoption weight. Not recommended: the class weights encode evidence strength, and a second scale would be a guess.
4. **Scoring without a source.** If the intent behind "I don't agree with no source, no score" is to count practices the engines have not documented (a brand's About page, author bylines, FAQ sections), those stay in the advisory review. Counting them deterministically would mean the scanner asserting what Google has not, which is the thing the product was built to refuse. The six quotes in §4 get most of the value without crossing that line.

## 6. What else changed in this release

- PRODUCT.md §1, §3, §4, §7, §8, §9, §10, §15; KNOWLEDGE.md §1.3 (opportunity conditions), the four rule blocks, §6, §9 change log, §10.1 statement, new §10.4; SOURCES.md header; both READMEs.
- Report JSON: `headline.achieved` replaces `headline.conformance`, `headline.opportunities` added, `categories[].achieved`, `recommendations[].kind`, new `ai_readiness` section, `opportunity` status in findings.
- Web app: the home page pillar, About principles, scoring and AI crawlers methodology pages, the report view (an opportunity status, a "to add" tile, Fix and Add labels, the readiness section), Markdown and diff renderers.
- Tests: the worked example, a new scoring fixture file (bare site below 100 with no failures, back to 100 once the practices exist, readiness statuses), ruleset integrity checks for the readiness list, updated fixtures for the four reclassified conditions. 433 tests pass.
