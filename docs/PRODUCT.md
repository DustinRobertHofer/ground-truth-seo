# Ground-Truth SEO Scanner

Product description and functional specification

Ruleset 2.0.0 · Knowledge cutoff 2026-09-28 · Key sources re-verified 2026-10-03
Companion files: `KNOWLEDGE.md` (rules), `SOURCES.md` (citation registry), `README.md` (how to use this set)

---

## 1. What it is

The Ground-Truth SEO Scanner audits a website against what search engines, web standards bodies and AI crawler operators have actually documented, and rates it against the best setup those documents describe. Every point in its score traces to a rule, every rule to a primary source, and every source to a dated passage quoted word for word. Scan the same snapshot twice and the report comes back identical, byte for byte.

That combination is the product. Most SEO audits grade sites against folklore: sixty-character titles, one H1 per page, a minimum word count, a mandatory meta description. Google contradicts several of those beliefs in its own documentation. This scanner reports only what it can verify, weights each finding by the strength of the evidence behind it, and says plainly when a question cannot be answered from outside the site.

The score is a distance, not a grade of what exists. A site that has done little cannot score well by doing that little correctly: a documented practice it has not adopted (a sitemap, a meta description, a favicon, a stated site name) counts against it in the same way a broken one would, and the report lists it as something to add, with the passage that recommends it. The point of the scanner is to show owners how to improve, not only how well they present what they already have.

The knowledge base derives from _The Ground-Truth Guide to Modern SEO_ (Dustin Hofer, Book With Haven; research cutoff 2026-09-28) and its Developer Specification. Rule IDs match the book's requirement IDs (`SEO-HTTP-01`, `SEO-CANON-01` and so on), so the book, the scanner and any CMS built to the specification share one vocabulary.

## 2. Who it serves

Platforms that generate many sites from shared templates come first. Book With Haven is the motivating case: a wrong canonical rule in one template ships to every customer site, so the audit has to be precise enough to trust and repeatable enough to run in CI on every deploy.

Site owners and developers are the second audience. They need to know what is actually broken, in what order to fix it, and how to confirm the fix worked.

Consultants and agencies are the third. Every recommendation they hand a client should be defensible with a citation rather than a reputation, and the scanner's output is built to be forwarded as it stands.

## 3. Product principles

1. Scored against the best you could do. The score measures distance from the best setup the engines and standards document, so a documented practice counts whether or not the site has started on it. Absence is an opportunity (§7.1), not a pass by default and not a failure. Every check still rests on a primary source registered in `SOURCES.md`, because the source is what makes the advice worth acting on; stricter house conventions may appear in the report, labeled as conventions, with zero weight unless a team opts in.
2. Strength is preserved. "Must", "recommend", "supports" and "ignores" are different claims. The scanner weights them differently and never promotes a recommendation into a requirement.
3. Deterministic by construction. The network is touched once, during acquisition. Evaluation is a pure function of the stored snapshot, the ruleset version and the configuration.
4. Every number explains itself. Each finding carries the observed evidence, the expected state, a reason assembled from those values, a recommendation and at least one verbatim citation. The headline score is printed with its arithmetic.
5. Honest about limits. A check that needs data the scanner cannot see (server logs, Search Console, editorial intent) reports `manual` or `not_evaluated` with the reason. It never guesses.
6. No ranking claims. The score measures how much of the documented best setup is in place. It does not predict rankings, traffic or citations in AI answers, and the first screen of every report says so in Google's words: "Just because a page meets these requirements doesn't mean that a page will be indexed; indexing isn't guaranteed."

## 4. Scope

| Category                          | What the scanner examines                                                                          | Rule prefix            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------- |
| HTTP and hosting                  | Status codes of intended pages, 404 behavior, HTTPS and certificates, HTML size limit              | `SEO-HTTP`             |
| Hosts and URLs                    | Host and protocol consolidation, URL syntax, hyphens, fragment routing, case duplicates            | `SEO-URL`              |
| robots.txt                        | Availability, encoding, size, crawl access for search crawlers, rendering resources, ignored lines | `SEO-ROBOTS`           |
| Indexing controls                 | noindex on intended pages, noindex placement mistakes, effective directives per engine             | `SEO-IDX`              |
| Document head and metadata        | Title, charset, lang, description, favicon, meta refresh, head integrity                           | `SEO-HEAD`, `SEO-META` |
| Canonicalization                  | Placement, absoluteness, uniqueness, target validity, agreement with other signals                 | `SEO-CANON`            |
| Sitemaps                          | Retrieval, well-formedness, limits, URL scope, listed-URL hygiene, lastmod                         | `SEO-SITEMAP`          |
| Links and headings                | Orphaned intended pages, anchor text, uncrawlable link patterns, heading ranks                     | `SEO-LINK`, `SEO-HDG`  |
| Images                            | `src` fallback, alt attributes, supported formats, dimensions on lazy images                       | `SEO-IMG`              |
| Structured data                   | JSON-LD parsing, Google feature requirements, WebSite and Organization logo, retired features      | `SEO-SD`               |
| Localization                      | hreflang placement, self-reference, reciprocity, URL form, language codes, canonical alignment     | `SEO-I18N`             |
| Redirects                         | Chains, loops, temporary redirects                                                                 | `SEO-REDIR`            |
| Performance (optional input)      | Core Web Vitals field data from CrUX, mobile and desktop parity                                    | `SEO-PERF`             |
| JavaScript (optional rendering)   | Canonical and robots changes made by JavaScript, content only present after render                 | `SEO-JS`               |
| AI crawlers and generative search | Snippet eligibility for Google AI features, per-crawler access matrix, llms.txt (informational)    | `SEO-AI`               |

### What it deliberately does not score

Content quality, helpfulness and E-E-A-T. Rankings, traffic and click-through. Backlinks and third-party "authority" metrics. Keyword density, word count, and title or description length. Lab performance scores.

Some of these lack published, testable criteria: Google publishes questions for creators, not a rubric. Others are explicitly dismissed by the engines. A few need data the scanner never sees. In each case the report says which, pointing to the myth guard in `KNOWLEDGE.md` §6, rather than substituting a proxy.

Content quality still matters to site owners, so the advisory content review (§17) offers editorial suggestions on titles, descriptions, page content, answers to visitors' questions and llms.txt. It sits outside the score, is labeled as model output, and follows `KNOWLEDGE.md` §11. Beside it, the AI answers readiness list (§10, `KNOWLEDGE.md` §10.4) shows which documented conditions for appearing in AI answers are in place, without scoring them.

## 5. How a scan works

```
 start URL + config ──> ACQUIRE ──> SNAPSHOT ──> EVALUATE ──> REPORT
                       (network)   (immutable,    (pure        (canonical JSON
                                    hashed)       function)     + rendered views)
                                                     ^
                                  KNOWLEDGE.md rules + SOURCES.md citations
```

Acquisition is the only phase allowed to touch the network. Its job is to collect everything evaluation will need and freeze it. Evaluation never fetches, never reads the clock and never consults anything outside the snapshot, the compiled ruleset and the configuration.

### 5.1 Acquire

Acquisition runs in fixed phases. Within a phase, URLs are processed in ascending byte order of their normalized form (`KNOWLEDGE.md` §3.1), so the set of fetched URLs does not depend on network timing or concurrency.

robots.txt for an origin is always fetched before any other request to that origin. For sequencing, every robots.txt exchange belongs to phase 0, ordered by origin. This covers the preferred origin, every additional in-scope origin, every resolving variant origin, the origins of favicon and Organization logo URLs (always, because their eligibility depends on crawl access), and, when enabled, other third-party resource origins.

1. Resolve the start URL. Follow redirects up to 10 hops, recording each hop. The origin of the final URL is the preferred origin unless the configuration names one. In `respect` mode, a hop disallowed for the scanner's own token is recorded as `blocked_by_robots_policy` and resolution stops there.
2. Probe host variants. For the registrable host, request `/` on each combination of `http`/`https` and with/without `www.` that resolves in DNS. Variants are probed, never crawled. A second probe per variant follows in step 7.
3. Request the 404 probe URL on the preferred origin: `/gt-probe-404-` followed by the first 16 hex characters of the SHA-256 of the preferred origin string. The path is stable per site and never random.
4. Collect sitemaps: `Sitemap:` lines from in-scope robots.txt files, sitemap URLs from configuration, and, only if neither yields one, `/sitemap.xml` on the preferred origin (recorded as "found by convention"). Follow sitemap index files one level deep per index.
5. Crawl breadth-first from the home page over in-scope `<a href>` and `<area href>` links found in raw HTML. Finish each depth level completely, then sort and deduplicate the next level's URLs before fetching any of them. Stop at `max_pages` or `max_depth`.
6. Fetch sitemap-listed URLs that the link crawl did not reach, in sorted order, within the remaining page budget.
7. Fetch referenced targets not yet fetched, up to `max_extra_fetches`: canonical targets, hreflang alternates (cross-origin allowed), and redirect targets. Then, on each resolving variant origin, request the path and query of the first member of `I` other than the home page (sorted order), when one exists.
8. Fetch page resources needed by rules: favicon candidates from the home page of every in-scope hostname, Organization logos, and the first `max_images_per_page` images per intended page (enough bytes to read format and dimensions).
9. Fetch `/llms.txt` on the preferred origin (informational only), a conditional re-request of the home page when it sent `ETag` or `Last-Modified`, the IndexNow key file when a key is configured, and DNS TXT records of the registrable domain.
10. Optional, when configured: render intended pages in pinned headless Chromium and store the serialized DOM; query the Chrome UX Report API for the origin and intended URLs; fetch the home page and one sample page with fixed mobile and desktop browser user agents for the parity check. The web scanner asks the Chrome UX Report for the origin and the home page, on phones and desktops, whenever a key is configured (`CRUX_API_KEY`); each answer is stored normalized (75th-percentile LCP and INP in integer milliseconds, CLS in integer thousandths, the collection period) and the key never enters the snapshot or the report.

If a limit truncates the crawl, the snapshot records `truncated: true` with the limit that was hit, and rules that need a complete crawl (orphan detection, for example) report `not_evaluated` rather than a misleading result.

### 5.2 Fetch policy

| Setting               | Value                                                                                                                                                                                                                    | Why                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-Agent            | `GroundTruthSEOScanner/<version> (+<info URL>)`                                                                                                                                                                          | Honest identification. The scanner never impersonates Googlebot or any other crawler; crawler access is evaluated by parsing robots.txt, not by spoofing. The only exception is the opt-in parity check, which uses two fixed, recorded browser user-agent strings. |
| Other request headers | Fixed `Accept` and `Accept-Encoding: gzip, deflate, br`. No `Accept-Language`, no cookies, no `Referer`.                                                                                                                 | Identical requests on every run; the server returns its default variant.                                                                                                                                                                                            |
| Method                | `GET` for everything (no reliance on `HEAD`, which some servers mishandle)                                                                                                                                               | Consistent behavior.                                                                                                                                                                                                                                                |
| Redirects             | Followed manually, one hop at a time; at most 11 requests per chain, so a chain still redirecting at the 11th response is recorded as exceeding 10 hops (`KNOWLEDGE.md` §3.12); each hop is a separate snapshot exchange | Redirect rules need every hop, and Google's crawlers follow up to 10.                                                                                                                                                                                               |
| Timeouts              | Connect 10 s, total 30 s per request                                                                                                                                                                                     | Fixed values recorded in the report.                                                                                                                                                                                                                                |
| Retries               | One retry on connection error or timeout only. HTTP status codes are never retried.                                                                                                                                      | The snapshot reflects what the server actually answered.                                                                                                                                                                                                            |
| Body caps             | HTML 10 MB uncompressed, sitemaps 60 MB uncompressed, robots.txt 1 MB, images 512 KB                                                                                                                                     | Large enough to measure every documented limit. Truncation is recorded.                                                                                                                                                                                             |
| TLS                   | Validated against a pinned CA bundle whose version is recorded                                                                                                                                                           | Certificate outcomes are reproducible inputs.                                                                                                                                                                                                                       |
| Concurrency           | Up to 4 requests per origin with a politeness delay                                                                                                                                                                      | Affects speed only, never the fetched set or the order of the snapshot.                                                                                                                                                                                             |

### 5.3 Robots modes

`respect` (default): the scanner obeys robots.txt for its own user-agent token and does not fetch disallowed URLs. It still evaluates, by parsing, whether Googlebot, bingbot and the AI crawlers in `KNOWLEDGE.md` §7 may fetch every URL it knows about.

`owner` (opt-in): available only after the user proves control of the site with a DNS TXT record or a token file. Disallowed URLs are fetched, which lets the scanner detect conflicts such as a noindex placed behind a robots.txt disallow (`SEO-IDX-02`). The mode is recorded in the report, and rules that depend on it state which mode produced their result.

### 5.4 Snapshot

The snapshot is the boundary between the unpredictable world and the deterministic evaluator.

- A manifest lists every exchange: a sequence number assigned after acquisition by (phase, normalized URL, attempt), the request (URL, method, headers), the outcome (`response`, `dns_error`, `tls_error`, `timeout`, `connection_error`, `blocked_by_robots_policy`), status, response headers (names lowercased, original order preserved), compressed and uncompressed sizes, a truncation flag, and the SHA-256 of the body.
- Bodies are stored content-addressed by SHA-256.
- TLS certificate details and DNS answers are stored per origin.
- Timing data may be stored for diagnostics but is never read by evaluation.
- `completed_at` is the single clock reading. Evaluation uses it wherever it needs "now" (a lastmod in the future, an expired certificate).
- `snapshot_id` is the SHA-256 of the canonical serialization of the manifest.

### 5.5 Evaluate

`evaluate(snapshot, ruleset, config) -> report` is a pure function. Inside it the following are forbidden: network access, reading files outside the snapshot and the compiled ruleset, the system clock, random numbers, locale-dependent formatting or collation, floating-point values in anything that reaches the output, model or LLM calls of any kind, and iteration over unordered collections without an explicit sort. The advisory content review (§17) runs outside `evaluate` and never feeds back into the report.

### 5.6 Report

The report is emitted as canonical JSON (RFC 8785 JSON Canonicalization Scheme, UTF-8, LF line endings) plus human-readable views rendered from that JSON. Section 10 describes the contents.

## 6. Determinism contract

Given the same snapshot, the same ruleset version and the same configuration, the scanner produces a byte-identical `report.json`. The contract holds across runs, processes, machines, operating systems, time zones and locales.

The build must prove it with these tests, run in CI:

| Test                     | Method                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Golden reports           | Evaluate each fixture snapshot and compare with the committed expected report byte for byte.                                           |
| Idempotence              | Evaluate the same snapshot twice in one process and once in a fresh process; all outputs identical.                                    |
| Order independence       | Shuffle the storage order of manifest entries (sequence numbers retained); output identical.                                           |
| Environment independence | Run under different `TZ`, `LANG` and `LC_ALL` values; output identical.                                                                |
| Platform independence    | CI matrix of at least two operating systems; output identical.                                                                         |
| Rule coverage            | Every scored rule has at least one passing fixture and one fixture per fail condition. CI fails if a rule or condition lacks fixtures. |
| Citation integrity       | Every source ID cited in `KNOWLEDGE.md` exists in `SOURCES.md`; every quote emitted by the code matches the knowledge base exactly.    |

Acquisition cannot be fully deterministic, because the site and the network change. The contract therefore covers evaluation. Acquisition is made as stable as practical (fixed phases, sorted queues, fixed headers, no retries on status codes), and every scan's `snapshot_id` lets two reports be compared knowing exactly whether their inputs differed.

## 7. Scoring

### 7.1 Finding statuses

| Status           | Meaning                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pass`           | The rule applied and every condition was met.                                                                                                                |
| `fail`           | The rule applied and at least one fail condition was observed: something is broken.                                                                          |
| `opportunity`    | A documented practice is absent on the unit and nothing is broken by its absence (`KNOWLEDGE.md` §1.3). Counts as unmet in the score exactly like a fail; reported as something to add. |
| `info`           | An informational rule produced an observation. Never affects the score.                                                                                      |
| `not_applicable` | Nothing on the site could trigger the rule: the site has no localized versions, declares no Organization logo, or the engine is not selected. Distinct from an opportunity, where the practice could be adopted and is not. |
| `not_evaluated`  | The rule applied but the snapshot lacks the data needed (crawl truncated, rendering off, CrUX not configured, robots.txt unavailable). The reason is stated. |
| `manual`         | The question cannot be answered from outside the site. The report lists it in the manual review checklist with the source.                                   |

### 7.2 Evidence classes and weights

Each rule carries one class, taken from the strength of its strongest supporting source for that exact condition. When different conditions of one requirement have different strengths, they are separate rules (for example `SEO-META-05A` for favicon eligibility and `SEO-META-05B` for the recommended size).

| Class            | Assigned when the source says                                                                                                                                                                                                                                                       | Book badges                                                                          | Weight | Severity on fail |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ | ---------------- |
| C1 Mechanism     | It must be done this way or it does not work, is ignored, or the page or feature is ineligible. The source is an engine, or the standard that defines the mechanism itself (robots.txt, sitemaps, canonical links) stating that non-conforming input is ignored, dropped or invalid | REQUIRED, ELIGIBILITY REQUIREMENT, documented engine behavior with an adverse effect | 8      | critical         |
| C2 Recommended   | The engine recommends it, or documents it as used by its ranking systems                                                                                                                                                                                                            | DOCUMENTED RECOMMENDATION, DOCUMENTED SIGNAL                                         | 4      | major            |
| C3 Standard      | A web standard requires or recommends it, without a documented consequence for crawling, indexing or display                                                                                                                                                                        | STANDARD                                                                             | 2      | minor            |
| C4 Informational | It is supported, optional, a policy choice or a house convention                                                                                                                                                                                                                    | SUPPORTED, OPTIONAL, house convention                                                | 0      | info             |
| Never scored     | The engines dismiss it, do not document it, or the record is silent                                                                                                                                                                                                                 | EXPLICITLY DISMISSED, NOT A DOCUMENTED RANKING FACTOR, UNKNOWN                       | n/a    | Myth guard only  |

No search engine publishes ranking weights, and these numbers are not an attempt to guess them. They encode how strongly the documentation speaks, in a fixed 8:4:2 ratio, and every report prints them with that explanation: "Weights express the strength of the documentation, not ranking impact."

An opportunity carries the weight of its rule's class, which comes from the quote that recommends the practice. The gap between the site and the best documented setup is the same whether a practice is missing or done wrong; what differs is the advice, so the report separates what to fix from what to add.

House conventions (rule IDs ending in `-HC`) are off by default. A team may enable them, and may assign them a weight, but the report then labels the score "with house conventions" and lists each enabled convention.

### 7.3 Gates

Some C1 rules decide eligibility rather than quality, and they are handled separately so that the headline number cannot look healthy while pages are blocked.

- `gate: indexing` rules decide whether an intended page can be indexed at all (it returns 200, it is publicly accessible, search crawlers may fetch it, it carries no noindex). They do not enter the achieved share. They produce the eligibility factor.
- `gate: feature:<name>` rules decide eligibility for one search feature (favicon, site name preference, breadcrumbs, Organization logo, vacation rentals). They enter the achieved share as ordinary C1 rules, and the report also lists each feature's eligibility on its own line. A feature the site has not adopted at all (a home page with no favicon link, no WebSite item) is an opportunity condition of the gate rule rather than a failure.

### 7.4 Intended-indexable set

Eligibility only means something relative to what the site owner wants indexed. The scanner derives that set, `I`, deterministically:

1. `I` always contains the home page (the root URL of the preferred origin). `exclude` patterns never remove it.
2. If sitemaps were found, `I` adds every valid `<loc>` on an in-scope origin: one that passes `SEO-SITEMAP-02` and `SEO-SITEMAP-02B`. A sitemap is the site's own statement of what it wants discovered.
3. `I` adds discovered URLs matching configured `include` patterns and removes URLs matching `exclude` patterns.
4. If no sitemap was found and no `include` patterns exist, `I` adds every link-discovered in-scope URL that returned 200 HTML, carries no effective noindex, and is not disallowed for any selected engine's search crawler. Without a declared intent, a noindex or a disallow is treated as intent, and such URLs are reported as information rather than as blockers. The report states that intent was inferred and recommends a sitemap or include patterns for a stricter audit.

### 7.5 Formulas

All arithmetic uses exact rationals over integers. Floating point never touches a score.

For each scored rule `r` (weight `w_r > 0`, not `gate: indexing`, at least one evaluated unit):

- `n_r` = number of applicable units that were evaluated: units with status `pass`, `fail` or `opportunity` (pages, sitemap files, origins or pairs, per the rule's scope; site-scoped rules have `n_r = 1`). Units with status `not_evaluated` are excluded, and so are members of `B`: page-scoped rules apply to `P`, which leaves blocked pages out (`KNOWLEDGE.md` §3.2).
- `p_r` = number of those units that pass. An opportunity is a unit that does not pass.

```
Achieved      A = Σ (w_r × p_r / n_r)  /  Σ w_r
Eligibility   E = (|I| − |B|) / |I|        where B = members of I failing at least one gate:indexing rule
Overall       S = round_half_up(100 × E × A)
Category      S_k = round_half_up(100 × A_k)    (A restricted to rules in category k; no E factor)
round_half_up(x = a/b, b > 0) = floor((2a + b) / (2b))
```

`A` is the share of the best documented setup the site has in place, weighted by evidence. Because an absent practice is an evaluated unit that does not pass, a site cannot raise `A` by having less: a site with no sitemap, no descriptions and no favicon is measured against the same denominator as one that has them.

Fractions in reports are reduced to lowest terms. Edge cases: if `|I| = 0`, no overall score is reported ("No intended-indexable pages found"). If `E = 0`, the overall score is 0 whatever `A` is, and the headline says every intended page is blocked. If no scored rule applies, `A` is reported as "not measurable" rather than 100, and so is the overall score unless `E = 0`.

The eligibility multiplier is a product decision, recorded as a house convention: practices in place on pages that cannot be indexed have no search value, so they should not dilute the warning that the pages are blocked.

### 7.6 Worked example

A site declares 40 URLs in its sitemap. Two carry `noindex`, so they fail `SEO-IDX-06` (gate: indexing) and leave `P`, which therefore has 38 pages. Four scored rules apply. Eight pages have no meta description: those are opportunities, and they count as unmet units of `SEO-META-02C` exactly as failures would.

| Rule                                 | Class | w   | Units    | Pass | Contribution      |
| ------------------------------------ | ----- | --- | -------- | ---- | ----------------- |
| `SEO-CANON-01` canonical in head     | C1    | 8   | 38 pages | 38   | 8 × 38/38 = 8     |
| `SEO-META-02C` meta description present | C2 | 4   | 38 pages | 30   | 4 × 30/38 = 60/19 |
| `SEO-HTTP-07` HTTPS                  | C2    | 4   | site     | 1    | 4                 |
| `SEO-HDG-02` heading ranks           | C3    | 2   | 38 pages | 19   | 2 × 19/38 = 1     |

```
Σ w            = 18
Σ contribution = 8 + 60/19 + 4 + 1 = 307/19
A              = (307/19) / 18 = 307/342
E              = 38/40 = 19/20
100 × E × A    = 100 × 5833/6840 = 583300/6840
S              = floor((2 × 583300 + 6840) / (2 × 6840)) = floor(1173440 / 13680) = 85
```

The report prints: "Overall 85 = 100 × eligibility 19/20 × achieved 307/342. Two intended pages are blocked from indexing; see SEO-IDX-06." The arithmetic string always has this shape: `Overall <S> = 100 × eligibility <E> × achieved <A>`, with `E` and `A` as reduced fractions. The recommendations list the eight pages under "add a meta description", after any rule of equal or higher weight that is broken rather than missing.

### 7.7 What the score is not

The report's headline block always carries the statements stored in `KNOWLEDGE.md` §10.1: that the score is not a ranking prediction; Google's statement that "Just because a page meets these requirements doesn't mean that a page will be indexed; indexing isn't guaranteed."; what weights mean; and, only when performance data was evaluated, Google's statements on the scope of Core Web Vitals in ranking.

## 8. Findings, reasons and citations

### 8.1 Finding record

```json
{
  "rule_id": "SEO-CANON-01",
  "condition": "outside_head",
  "status": "fail",
  "class": "C1",
  "weight": 8,
  "severity": "critical",
  "gate": null,
  "category": "canonical",
  "engines": ["google"],
  "scope": "page",
  "unit": "https://www.example.com/stays/ocean-view",
  "observed": {
    "url": "https://www.example.com/stays/ocean-view",
    "href": "https://www.example.com/stays/ocean-view",
    "line": 88,
    "head_closed_line": 41,
    "culprit": "<iframe>"
  },
  "expected": "The canonical link is inside the head",
  "reason": "Google accepts rel=\"canonical\" only in the <head>. On https://www.example.com/stays/ocean-view the canonical element (line 88) is in <body> because the parser closed <head> at line 41, where it met <iframe>, so Google will not accept it.",
  "recommendation": "Emit the canonical in the server-rendered head, before any third-party snippet, and fix the culprit reported by SEO-HEAD-05.",
  "outcome": "Fixing this lets the mechanism work as documented.",
  "verify": [
    "Re-run the scan after deploying the fix and compare the reports.",
    "For a sample URL, use URL Inspection in Google Search Console to confirm how Google sees the page."
  ],
  "citations": [
    {
      "source_id": "G-CANON",
      "section": "rel=\"canonical\" link element",
      "quote": "The rel=\"canonical\" link element is only accepted if it appears in the <head> section of the HTML",
      "source_last_updated": "2026-07-10"
    }
  ],
  "related": ["SEO-HEAD-05"]
}
```

Every value in `observed` is a string or an integer. Line numbers are integers taken from the parser's source locations in the raw response body. `expected` is the rule title; `recommendation` is the rule's Fix text; `outcome` and `verify` come from `KNOWLEDGE.md` §10; `source_last_updated` is the "Last updated" value from `SOURCES.md`, copied as written (for example "2026-07-10", "March 2025" or "not stated"). A finding with status `opportunity` carries the same `recommendation`, `outcome`, `verify` and `citations` as a fail; its `severity` follows its class like any other finding, and the report shows it as something to add.

### 8.2 How reasons are written

Reasons are never generated by a language model. Each rule condition in `KNOWLEDGE.md` has a reason template with named placeholders, and the evaluator fills those placeholders from `observed` values only, using the fixed formats in `KNOWLEDGE.md` §1.5. A good reason does three things in two or three sentences: states what was observed with the specific values, states what the source says about it, and states the documented consequence.

A lint, run in CI over every template, fix text and info text, keeps reasons within their sources:

- C1-only consequence phrases ("will not be accepted", "is ignored", "is not eligible", "does not take effect", "is not crawled", "never resolves") may appear only in C1 templates, unless they are inside a quotation.
- C2 templates attribute the statement to its engine with a reporting verb ("recommends", "advises", "asks", "notes", "says", "states", "warns", "treats", "documents", "lists"). Only rules backed by a documented signal may mention ranking, and only in the source's words.
- C3 templates attribute the statement to the standard by name.
- C4 text is a neutral observation. It may begin "For your information:" or "Policy choice:" and never uses C1 phrases outside quotations.
- Banned everywhere: "will improve rankings", "boosts SEO", "Google penalizes", "best practice" without a named source, and any number (length, count, ratio, fraction) that is not in a cited source or in `observed`.

### 8.3 Citations

Each finding cites at least one source by its `SOURCES.md` ID, with the section name, the verbatim quote stored in the knowledge base, and the source's last-updated date as displayed when it was verified. Quotes are stored once, in `KNOWLEDGE.md`, and compiled into the ruleset; code must never retype them.

## 9. Recommendations

Failing and opportunity findings are aggregated into one recommendation per (rule, condition), listing every affected unit. Each recommendation has a `kind`: `fix` when the condition is a fail, `add` when it is an opportunity. The order is deterministic:

1. Gate failures (indexing gates first, then feature gates)
2. Higher weight first
3. `fix` before `add`: what is broken before what is missing
4. More affected units first
5. Rule ID ascending, then condition ascending

Each recommendation contains the action (the rule's Fix text), the reason with its citation, the affected units (complete list in JSON, first 20 in rendered views with a count), an outcome statement and verification steps. Outcome and verification text come from `KNOWLEDGE.md` §10.2 and §10.3, chosen by class, gate and engine.

Outcome statements use only documented outcomes. Fixing a `noindex` on an intended page makes it eligible; it does not make it indexed. Adding valid BreadcrumbList markup makes a page eligible for the feature, and Google says: "Google does not guarantee that your structured data will show up in search results, even if your page is marked up correctly according to the Rich Results Test." [G-SD-POLICIES]

## 10. Report outputs

`report.json` contains, in this order:

1. `meta`: scanner version, ruleset version, knowledge cutoff, `snapshot_id`, `config_hash`, the full effective configuration, robots mode, `completed_at`, truncation flags
2. `headline`: overall score with arithmetic string, eligibility (`|I|`, `|B|`, per-gate counts), the achieved share `A`, critical, major and minor failure counts, the count of opportunities, and the statements from §7.7 (stored in `KNOWLEDGE.md` §10.1)
3. `features`: eligibility per search feature (favicon, site name preference, breadcrumbs, Organization logo, vacation rentals) with the failing conditions
4. `categories`: score per category with the arithmetic and achieved share, keyed by `http`, `urls`, `robots`, `indexing`, `head`, `canonical`, `sitemaps`, `links`, `images`, `structured_data`, `i18n`, `redirects`, `performance`, `javascript`, `ai` and `tooling`
5. `recommendations`: ordered as in §9, each with its `kind`
6. `findings`: every finding, sorted by status (fail, opportunity, info, pass, manual, not evaluated, not applicable), then severity rank (critical, major, minor, info), then rule ID, condition and unit, each compared by UTF-8 byte order
7. `ai_access_matrix`: per crawler token, the robots.txt outcome for the home page and sampled intended URLs, with the operator's documented meaning
8. `ai_readiness`: the AI answers readiness list of `KNOWLEDGE.md` §10.4: each documented condition for appearing in AI answers, whether it is in place, what was observed, and its source. Derived from findings already made; never scored
9. `manual_review`: checklist of `manual` items with sources
10. `not_scored`: the myth guard summary, so readers see what was deliberately left out and why
11. `methodology`: class definitions, weights, formulas, and every source cited in this report with its dates

Rendered views (Markdown and HTML) are pure functions of `report.json`. A diff command compares two reports and lists new, resolved and changed findings keyed by (rule ID, condition, URL), with both `snapshot_id` values.

## 11. Configuration

Every value below that can change output is echoed in `meta` and included in `config_hash`.

| Key                           | Default              | Notes                                                                  |
| ----------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `start_url`                   | required             |                                                                        |
| `engines`                     | `["google", "bing"]` | Rules documented only by an unselected engine become `not_applicable`. |
| `preferred_origin`            | derived              | Override when the start URL redirects unexpectedly.                    |
| `additional_origins`          | `[]`                 | Extra origins treated as in scope.                                     |
| `max_pages`                   | 500                  | Link crawl plus sitemap-only fetches.                                  |
| `max_depth`                   | 20                   |                                                                        |
| `max_extra_fetches`           | 500                  | Canonical targets, alternates, redirect targets.                       |
| `max_images_per_page`         | 20                   |                                                                        |
| `include` / `exclude`         | `[]`                 | Path glob patterns that shape the intended set.                        |
| `robots_mode`                 | `respect`            | `owner` requires verified control of the site.                         |
| `staging_hosts`               | `[]`                 | Enables `SEO-ROBOTS-09`.                                               |
| `indexnow_key`                | none                 | Enables `SEO-SITEMAP-06`.                                              |
| `render`                      | `false`              | Enables rules marked `requires: rendered`.                             |
| `crux`                        | off                  | API key reference; enables `SEO-PERF-01`.                              |
| `parity_check`                | `false`              | Enables `SEO-PERF-03`.                                                 |
| `check_third_party_resources` | `false`              | Extends `SEO-ROBOTS-05B` to resources on other origins.                |
| `house_conventions`           | `false`              | Enables `-HC` rules, weight 0 unless overridden.                       |

## 12. Knowledge base maintenance

- `KNOWLEDGE.md` is the authority for rule logic, classes, reason templates and quotes. `SOURCES.md` is the authority for source identity and dates. The build compiles both into a versioned ruleset artifact; CI fails if they disagree with the code.
- Ruleset versions follow semantic versioning: major when a class, weight or formula changes; minor when rules or conditions are added; patch for wording that does not change outcomes.
- A scheduled job, separate from scanning, re-fetches every source page monthly and diffs the text. A change opens a review task listing the affected rules. Nothing updates automatically; a person re-verifies the wording and the class.
- A new rule ships only with a registered source, a verbatim quote, a class justified by that quote, reason templates for every condition, a fix, and fixtures.
- Before each ruleset release, an automated check fetches every registered source, strips markup, normalizes whitespace and quote marks, and confirms that every stored quote is an exact substring of its page. Any miss blocks the release until a person re-reads the source (`SOURCES.md`).
- The report always shows the ruleset version and research cutoff, so a reader knows how current the knowledge was.

## 13. Security and safety

The scanner fetches URLs supplied by users and found on third-party pages, so it must defend itself.

- Block requests to private, loopback, link-local and cloud metadata addresses after DNS resolution, including on every redirect hop.
- Parse XML with DTDs and external entities disabled.
- Enforce decompressed-size limits to defeat compression bombs.
- Never execute page JavaScript outside the sandboxed renderer, and run the renderer without access to the scanner's credentials or network-internal hosts.
- Store CrUX keys and similar secrets outside the snapshot and the report.

## 14. Build notes

Recommended, not mandatory. Whatever the stack, each component must meet the stated requirement.

| Component     | Requirement                                                                                                                                                                                    | Suggested implementation                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| HTML parsing  | Must follow the HTML Standard tree-construction algorithm with scripting enabled, so implied `</head>` behavior matches browsers and Googlebot's renderer, and must expose source line numbers | `parse5` (TypeScript) with source locations                                  |
| URL handling  | WHATWG URL parsing for resolution; a separate raw-string check against RFC 3986 for syntax rules                                                                                               | Platform `URL` plus a small validator                                        |
| robots.txt    | Implements `KNOWLEDGE.md` §3.6 exactly, with per-engine group fallback                                                                                                                         | In-house module with conformance tests from the Google and RFC 9309 examples |
| XML           | Well-formedness errors reported with line numbers; DTDs disabled                                                                                                                               | Any streaming XML parser with those options                                  |
| Images        | Format sniffed from magic bytes; dimensions read from headers (ICO, PNG, JPEG, GIF, BMP, TIFF, PPM, WebP, AVIF, SVG)                                                                           | Header-only reader                                                           |
| Rendering     | Pinned Chromium version, fixed viewport, fixed wait condition, DOM serialized into the snapshot                                                                                                | Playwright                                                                   |
| Serialization | RFC 8785 canonical JSON; integers and strings only                                                                                                                                             | JCS implementation                                                           |
| Arithmetic    | Exact rationals                                                                                                                                                                                | `BigInt` numerator and denominator                                           |

Suggested repository layout:

```
docs/seo-scanner/        README.md, PRODUCT.md, KNOWLEDGE.md, SOURCES.md
rules/                   compiled or hand-mirrored rule data, one file per category
src/acquire/             fetcher, crawler, snapshot writer
src/snapshot/            manifest and body store
src/evaluate/            shared algorithms and one module per rule category
src/report/              scoring, aggregation, JSON and rendered views
fixtures/<rule-id>/      minimal snapshots for pass and each fail condition
fixtures/sites/          full golden snapshots with expected reports
```

## 15. Acceptance criteria

The first release is complete when all of the following hold:

1. All determinism tests in §6 pass in CI.
2. Every rule in `KNOWLEDGE.md` marked C1, C2 or C3 is implemented with fixtures for pass and every fail condition, or explicitly deferred in a tracked list.
3. Every finding in every golden report carries at least one citation whose quote matches the knowledge base exactly.
4. No rule in the myth guard (`KNOWLEDGE.md` §6) produces a `fail`, under any configuration.
5. The worked example in §7.6, supplied as a scoring-layer fixture (rule statuses and unit counts, not a site snapshot), yields exactly 85 with the printed arithmetic string, with the eight missing descriptions counted as unmet units.
5a. A snapshot of a well-formed site with no sitemap, no meta descriptions, no favicon link and no WebSite item has no failing finding, an eligibility of 1, and an overall score below 100; the same site with those four practices in place scores 100.
6. A snapshot of a site whose robots.txt disallows `/` for all user agents reports every intended page as blocked by `SEO-ROBOTS-05A`, an eligibility of 0, and an overall score of 0.
7. A snapshot with a tag-manager `<iframe>` inside `<head>` before the canonical yields `SEO-CANON-01` failing with the culprit element and line, and `SEO-HEAD-05` naming the same element.
8. Turning `render`, `crux` or `parity_check` off changes only the rules and conditions marked as requiring them, which move to `not_evaluated`, plus any rendered-mode observations those rules feed.

## 16. Non-goals

- Predicting rankings, traffic or AI citations.
- Grading writing quality, expertise or helpfulness in the score. The advisory review (§17) makes editorial suggestions outside it.
- Third-party authority scores or backlink audits.
- Monitoring Search Console or Bing Webmaster Tools data (the report links to the relevant reports in its manual checklist instead).
- Spoofing search engine crawlers to test cloaking or user-agent-conditional behavior.

## 17. Content and AI-answer review (advisory)

The score answers one question: does the site follow what the engines document? Owners also ask whether their titles, descriptions and pages serve the people searching, and whether AI answers can use them. Those questions have no testable rubric (§4), so they never enter the score. The advisory review answers them with a language model, under rules that keep it honest.

### 17.1 What it is

- A separate artifact (`review.json`), produced after evaluation from the same snapshot. It never changes `report.json`, the score or any finding, and a report is complete without it. `evaluate` stays free of model calls (§5.5).
- Not deterministic. Two runs on one snapshot can word things differently. Each review records the model, the guidance version, the `snapshot_id` it reviewed and when it ran.
- Labeled as model output wherever it appears, together with the statements in `KNOWLEDGE.md` §11.3.
- Grounded. The model's instructions are the constraints and guidelines in `KNOWLEDGE.md` §11, passed exactly as stored. Every suggestion names the guideline IDs it relies on, and the app prints those guidelines' stored quotes beside it, so a citation is never generated.
- GEO is treated as SEO. Google says optimizing for generative AI search "is optimizing for the search experience, and thus still SEO." Where Microsoft documents more specific advice for AI answers (question-and-answer formats, FAQ sections, self-contained phrasing), the review applies it and says the advice is Microsoft's.

### 17.2 Extraction

`extractContent(snapshot, config, options)` is a pure function of the snapshot, so the same snapshot always gives the model the same input.

- Pages: the home page, then members of `I` whose final response is 200 HTML, that carry no effective noindex and are not disallowed for a selected engine's search crawler, ordered by crawl depth (sitemap-only pages last) and then by URL byte order, up to `pages` (6 by default, at most 12 in the web app and 20 from the command line).
- Per page: title, meta description, Open Graph title and description, canonical, `lang`, h1 to h3 headings, and the main content text. Main content is the `main` element with the most text, else the only `article`, else `body` without `nav`, `footer`, `aside` and any `header` that holds no `h1`. Hidden elements are skipped, except React streaming segments (`div[hidden]` with an `id` of the form `S:<n>`), whose server-rendered content an inline script moves into place; when the chosen `main` sits in such a segment, the text the first `main` shows until scripts run is recorded as the streaming fallback. The text is serialized with heading, list, table and paragraph structure, with collapsed `<details>` content marked, and capped at 12,000 characters. Also: visible question-and-answer blocks (`details`/`summary` pairs and headings that end in a question mark), JSON-LD types, FAQPage questions and answers, author and date properties, counts of images and of images without alt text, and whether `nosnippet` applies.
- Site: the llms.txt response (outcome, whether an HTML page was served instead, text up to 20,000 characters, and its structure as the proposal defines it), the WebSite and Organization names from JSON-LD, the scan date, and the home page's robots.txt outcome for every crawler in `KNOWLEDGE.md` §7, computed as `SEO-AI-02` computes it and shown with the operator's documented purpose.

Fixtures test the extraction.

### 17.3 Review

- One model call per sampled page and one for the site, run concurrently through the Vercel AI Gateway. `AI_REVIEW_MODEL` selects the model. Authentication is `AI_GATEWAY_API_KEY`, or Vercel OIDC on Vercel and in linked local projects.
- Page review: page type and visitor intent; likely queries, labeled as hypotheses unless the owner supplied target queries; a verdict and rewrites for the title, the meta description and the main heading; query alignment; answerability with the questions left unanswered; whether an FAQ would help, with drafted pairs whose missing facts are placeholders flagged for the owner; prioritized issues, each tied to guideline IDs; strengths.
- Site review: what the site is and for whom; whether its identity is stated plainly; site-wide patterns such as boilerplate titles or overlapping pages; questions real visitors would have that no page answers; the llms.txt assessment with an optional draft; top priorities.
- Target queries are optional and come from the owner, for example from Search Console's Performance report. Every call receives them.
- The web app gives the review whatever remains of the request's time limit. Pages not reviewed in time are listed as not reviewed.

### 17.4 Where it runs

- In the web app it runs in the same streamed request as the scan, after the report has been sent, and streams progress. When accounts are configured it runs only for signed-in users; otherwise (local development) for everyone. It is off when no AI Gateway credential is available or `AI_REVIEW_DISABLED=1`.
- The review is kept with the scan in the browser and, for signed-in users, on the scan's history row.
- From the command line, `pnpm scan <url> --review` writes `review.json` and `review.md` beside the report, and `pnpm scan:review <dir>/snapshot.json` reviews a stored snapshot again.

### 17.5 Limits

- The model sees only the sampled pages as served, without JavaScript rendering, and nothing else on the web. It cannot measure originality against competitors, search demand, rankings or citations, and it says so.
- Model output can be wrong. The owner checks drafted copy before publishing it; placeholders mark facts the model could not find.
- Each run costs one model call per sampled page plus one for the site. The page cap bounds the cost.

## 18. Research corpus

Every scan observes a real site. Those observations, kept across sites, answer a
question no single report can: what are owners in a given industry actually doing
about search and AI answers? Section 18 defines the corpus that accumulates them.

### 18.1 What it is

One row per distinct scan, recording the scan's key results in a form fit for
aggregation: the site's public identity, the signals that place it in an industry,
its scale, its score, and the outcome of every rule. The corpus is a research
asset, not a product feature. Nothing in the report, the score or the user's
history reads from it.

### 18.2 Position in the pipeline

- Extraction is a pure function of `(snapshot, config, report)`, with the same
  prohibitions as `evaluate` (§5.5): no network, no clock, no randomness, no
  locale-dependent formatting, no floating point, no model calls. Fixtures test it.
- It runs after evaluation. It never feeds back into `report.json`, the score, the
  recommendations or the advisory review (§17).
- In the web app the write is deferred to after the response, through `after` from
  `next/server`, so a slow or unreachable database cannot spend the advisory
  review's time budget (§17.2) or hold a streamed response open. The callback is
  registered while the request is in scope, before the scan starts, and runs once
  the response has finished.
- Writing the row is best effort. A failed write is logged and the scan succeeds.
  A scan is never blocked, delayed past its own result, or failed by the corpus.
- Rows are keyed on `(snapshot_id, config_hash)`. Re-recording the same inputs is a
  no-op, so the corpus counts distinct scans rather than repeated requests.

### 18.3 What one row records

| Group | Fields |
|---|---|
| Provenance | `snapshot_id`, `config_hash`, `scanner_version`, `ruleset_version`, `completed_at`, `robots_mode`, `truncated` |
| Site identity | `origin`, `host` (the origin's host without a leading `www.`), `tld` |
| Industry signals | `vertical`, `schema_types`, `platform_signals`, `languages`, `hreflang_regions` |
| Scale | `pages_fetched`, `pages_sampled`, `intended`, `blocked`, `sitemaps`, `sitemap_urls` |
| Score | `overall`, `overall_label`, `critical_failures`, `major_failures`, `minor_failures`, `categories` |
| Rule outcomes | `rules`: per rule, its class, weight, applicable units, units passed, and the count of each finding status |
| AI and features | `features`: per feature, its eligibility status. `ai_access`: per crawler in `KNOWLEDGE.md` §7, its operator and how many sampled URLs were allowed, disallowed or unknown |

`vertical` is a coarse industry label derived only from the schema.org business
types the site itself declares, by the fixed table in `lib/research/verticals.ts`.
It is descriptive metadata. It is never read by evaluation, never scored, and
carries no claim about what any industry should do. Sites that declare no business
type are `unspecified`.

The industry signals are read from a sample of pages, the home page first and then
the rest in URL byte order, up to 25. `pages_sampled` records how many that was, so
analysis knows the basis of each list. Scores and rule outcomes come from the whole
report and are never sampled.

`platform_signals` are the raw `generator` meta values and the `server` and
`x-powered-by` response header values, deduplicated. They are recorded as observed,
with no mapping to a platform taxonomy, so the classification stays open to revision
at analysis time rather than being frozen at scan time.

### 18.4 What it never records

- No user ID, email, session or IP address. The corpus describes scanned sites, not
  the people who scanned them. A row cannot be traced to an account.
- No page bodies, no page text, no response bodies, no snapshot. Rule outcomes and
  counts only.
- No URL beyond the origin. Paths and query strings can carry tokens and personal
  data, so they are dropped. `start_url` is not recorded.
- No advisory review output (§17). Model prose is not evidence.
- Nothing from a scan of a private, loopback or link-local host, which §13 blocks
  before a snapshot exists.

### 18.5 Where it runs

- In the web app, on every completed scan, whether or not anyone is signed in and
  whether or not the per-user history save succeeded.
- From the command line, on `pnpm scan`, when `DATABASE_URL` is set, so a batch of
  scans run for research contributes the same rows as the web app. Re-evaluating a
  stored snapshot does not record: a row stands for a visit to a live site.
- Off entirely when `RESEARCH_CORPUS_DISABLED=1`, or when no database is configured.

### 18.6 Analysis

`pnpm research:export` writes the corpus as JSONL for analysis elsewhere.
`pnpm research:rollup` prints adoption rates with the number of sites behind each
figure: per rule, the share of sites where every applicable unit passed; per rich
result feature, the share eligible; per documented AI crawler, the share of sites
disallowing it. `--vertical`, `--ruleset` and `--since` narrow either command to one
slice, and `--min-sites` drops rules with too few sites to report. Both read the
corpus and write nothing to it.

A site rate counts sites. The corpus holds one row per scan, so the rollup reduces
its rows to the latest scan per host before taking any rate, and a site rescanned
fifty times weighs exactly as much as one scanned once. `scans` reports the rows in
the slice and `sites` the hosts behind the figures, so rescan intensity stays
visible.

A rule's meaning is fixed by its ruleset version (§12), so a published figure names
the versions behind it, and the rollup prints them. Figures are integer percentages:
the corpus is a convenience sample of sites someone chose to scan, not a random
sample of the web, and nothing published from it should imply more precision than
that.

## 19. Focused checkers

The full audit answers every question at once. Ten public pages answer one each: robots.txt, sitemaps, indexability (noindex), canonical tags, redirects, titles, meta descriptions, hreflang, llms.txt and AI crawler access. They exist for visitors who arrive with a single question, and each leads to the full audit with the address already filled in. `/tools` lists them all, with the security checker (§20).

### 19.1 Same engine, smaller crawl

- A check runs the same acquisition and the same `evaluate` as a scan. It never defines its own idea of a problem: every issue it shows is a finding of an existing rule, with that rule's reason, fix, outcome and citations. Failures are listed as issues to fix and opportunities (§7.1) as practices to add, in the order and with the labels the full report's recommendations use. Which rules a checker shows, and its crawl bounds, are listed in `lib/checkers/config.ts`.
- Acquisition is focused. A checker names the phases of §5.1 it needs and skips the rest; robots.txt and the start URL are always fetched, robots.txt first. The noindex, canonical, redirect, title, meta description and hreflang checkers also crawl the entered URL at depth 0 beside the home page, so a deep page is evaluated. Bounds are small (at most 26 pages), the per-request timeout is 10 s, and no images are fetched. A whole check has 100 s: past that, or when the visitor leaves, remaining requests are skipped and the check reports that the site answered too slowly rather than showing results from an incomplete snapshot.
- Without a focus, acquisition runs every phase exactly as §5.1 describes. A focus that lists every phase produces the same snapshot as a full acquisition, and fixtures hold it to that.
- Results lay out what the snapshot holds (robots.txt groups, sitemap files, indexing signals per page, canonical tags per page, redirect chains hop by hop, titles and first headings per page, descriptions per page, hreflang annotations with what each alternate returned, the llms.txt structure, each crawler's group and outcome) beside the rule findings. That layout is derived from the evaluation context and the rules' own helpers; it adds no verdicts.

### 19.2 What a check is not

- Not a score. A check prints no overall or category score, because a bounded crawl with skipped phases is not an audit.
- Not saved. Checks are not written to scan history and not recorded in the research corpus (§18): a focused, partial snapshot would misrepresent the site, and the corpus keeps the latest scan per host.
- Not reviewed. The advisory AI review (§17) does not run.

### 19.3 Page copy

The copy on the checker pages follows the same rule as findings. Every quotation is looked up in the compiled ruleset, the §11 guidance or the myth guard and printed exactly as stored; a lookup that finds nothing fails the build. Claims that `KNOWLEDGE.md` does not support are left out, including character limits for descriptions and any effect of llms.txt on rankings.

### 19.4 Analytics

The checkers emit `checker_page_view`, `checker_scan_started`, `checker_scan_completed`, `checker_scan_failed` and `full_audit_cta_clicked`, each with the checker as a property, through `lib/analytics.ts`. No provider is configured: events go to `window.dataLayer` when a tag manager has created it and to a `seoscanner:analytics` DOM event. No event carries the URL a visitor entered.

## 20. Security checker

Owners ask one question that no SEO rule answers: is the site handing out its secrets? The security checker at `/security-checker` looks for credentials and source code that the site serves to anyone who asks, including private fields such as access codes and password hashes that pages send to the browser when they pass whole records instead of the properties they show, and lists what it found without showing it. It also searches what the site served for terms the person running it enters (§20.5). Its checks, the way it confirms a match, the way it searches and every sentence it prints come from `KNOWLEDGE.md` §12.

### 20.1 What it reads

- Pages: the same acquisition as the focused checkers (§19), with the crawl phase only: robots.txt first, the start URL, then the home page and the entered page at depth 0 and the pages they link to at depth 1, up to 8 pages.
- Files: a fixed list of paths on the preferred origin (`KNOWLEDGE.md` §12.4): `/.git/HEAD` and `/.git/config`, five environment file names, `/.git-credentials`, `/.npmrc` and `/.htpasswd`.
- Scripts: up to 20 same-site scripts referenced by the loaded pages, then the source map of each, found as `KNOWLEDGE.md` §12.3 describes, up to 20 maps. Scripts and maps are read up to 15 MB each and 40 MB in all; past that, the rest are listed as not checked. A redirect is followed only while it stays on the same site.
- Search terms add no requests: a search reads the same served text as the checks.
- These requests run in an extra acquisition phase, after the phases of §5.1, that only the security checker enables. A scan never runs it, so scan snapshots do not change. robots.txt is obeyed for every request, the user agent is the scanner's own, and the deadline, per-request timeout and SSRF protection of §19 and §13 apply.

### 20.2 How it decides

- The result is a pure function of the snapshot and the search terms, like an evaluation (§5.5): no network, clock, randomness or model calls once acquisition ends.
- A response is a finding only when its content is confirmed, never on its status code alone. A server that answers every path with the same HTML page (a soft 404) produces no finding.
- Each check reports `found`, `clear` or `not checked`. `clear` means every input the check needed was read in full and nothing matched. A check that found nothing but could not read all of them (robots.txt disallowed a path, a request failed, the read budget ran out, a file was larger than the check reads) reports `not checked` and names each input with a statement from `KNOWLEDGE.md` §12.5. A redirect to another site or a script hosted on another site is outside the check by design and does not make it incomplete.
- Findings are listed by what they expose (credentials, then source code, then file paths), then by check ID, condition and location.

### 20.3 What it never does

- Show, store or log a secret. A finding carries the kind of secret, its location (URL, line and column, and the source file inside a source map) and the counts and names `KNOWLEDGE.md` §12.2 allows: environment variable names, credential hosts and source file paths. Matched values never leave the server, and response bodies are discarded once the result is built. Tests plant secrets in fixture sites and fail if any appears in a result.
- Save anything. Like the focused checkers, a security check is not written to scan history, the research corpus or the browser's saved scans.
- Score anything. It prints no score, adds nothing to `report.json`, and the advisory review (§17) does not run.
- Guess. Provider key formats are matched only where the provider's documentation is registered (GitHub's prefixes today). Values assigned to names that mark a secret or an access code are reported with a fix that starts by checking or changing the value. Personal data is not judged, because pages often show it on purpose; the search (§20.5) finds the fields only the owner knows should stay private.

### 20.4 Page and analytics

The page follows §19.3: every quotation is looked up in `KNOWLEDGE.md` §12 and printed exactly as stored, and a lookup that finds nothing fails the build. It emits the §19.4 events with `security-checker` as the checker. No event carries the URL entered, a search term or anything found; events count search terms only.

### 20.5 Searching the source

An owner often knows exactly what must never reach the browser: a field name such as `lockboxCode`, the name of an internal note, or a value from their own records. The form takes up to five optional search terms, one per line, and the result lists where each one appears in the served text, by URL, line and column and the source file inside a source map, following `KNOWLEDGE.md` §12.7.

- A search is not a check. It judges nothing, carries no fix or citation and never changes a check's status.
- It shows no text from the site. When a term ends a property name, the result names the kind of value the property holds (a string, a number, null and so on), so an owner can tell a filled field from an empty one without the value being printed.
- Terms are validated in the browser and again on the server, are never logged or saved, and leave the server only inside the result sent back to the person who entered them.
- A term that contains a value a check redacted, or an access code a check found, is redacted where the result repeats it (`KNOWLEDGE.md` §12.2 rule 6).

## 21. Report views, private links and benchmarks

### 21.1 The first screen

The web report is a view over `report.json` (§10) and adds no judgment of its own. Its first screen is built from counts and labels the report already carries, in this order:

1. The masthead: host, scan time, the size of the intended set, ruleset version and snapshot id; the overall score with its arithmetic string; the verdict, worded from the counts of `fix` and `add` recommendations; three buckets (to fix, to add, cannot tell from outside) whose figures are the recommendation counts, the length of `manual_review` and the number of rules with `not_evaluated` findings; and the §7.7 statements.
2. What matters most: the first ten recommendations in the report's own order (§9), each as a card that opens in four layers. Layer one is the rule title with the kind and the count of affected units; the layers beneath are the filled reason and the affected units, the class with its stored definition and the outcome statement, the fix with the verification steps, and the citations verbatim with the rule, condition, class, weight and gate. The same steps are listed again in two lanes, `fix` and `add`; neither lane claims an effort, because the ruleset documents none.
3. Where the gaps are: the category scores, weakest first.
4. Field performance, when the scan asked for Chrome UX Report data: the `SEO-PERF-01` observations per (scope, form factor) with each metric's 75th-percentile value and the threshold the rule prints, and the rule's citations. Without data the section says so and quotes the reason the finding carries. Lab scores never appear.
5. How you compare (§21.3), when a benchmark exists.
6. What the scanner cannot tell from outside: the manual checklist count and every `not_evaluated` finding grouped by rule and reason.
7. What the scanner never grades: the §6 myth guard rows.
8. The complete record: the full action plan, categories with arithmetic, the work by page, every finding with filters, the AI answers lists and the reference tables, each closed until opened.

Values and quotes are printed as stored. A unit of `SEO-PERF-01` is named in words ("the whole origin, on phones") from the key the acquirer wrote.

### 21.2 Private links

A report can be published at a private link, `/r/<token>`, where the token is sixteen base64url characters from twelve random bytes. The row keeps the report JSON as emitted, the start URL and the benchmark summaries shown beside it; the page renders the same first screen with the actions removed, carries `noindex`, and is listed nowhere. Anyone with the link can read it. Sharing works signed out; a signed-in user's id is recorded on the row. Without a database the control is not offered.

### 21.3 Benchmarks

Up to three competitor addresses can be scanned beside a report, one after the other, with the report's own configuration (page budget, engines, patterns) and without the advisory review. Each competitor is kept as a summary only: origin, host, start URL, completion time, snapshot id, ruleset version, overall score and label, intended and blocked counts, the counts of `fix` and `add` steps, and the category scores. The comparison lists the overall score and every category at least one site measured, the scanned site first; a site with no score in an area shows a dash, never a zero, and areas where every site scores the same fold into one line. The view says when the scans ran on different ruleset versions. Competitor scans are not written to anyone's history; the summaries travel with the browser's saved scan and with a private link.
