# Ground-Truth SEO Scanner: Specification Pack

Four documents that define a website SEO scanner whose results are deterministic, explained and cited, and which rates a site against the best setup its sources describe rather than against what the site already has. Drop them into a repository and build from them. Dated reviews of the design live in `reviews/`.

| File | Role | Authority over |
|---|---|---|
| `PRODUCT.md` | Product description and functional specification | How a scan runs, the determinism contract, scoring formulas, finding and report formats, configuration, acceptance criteria |
| `KNOWLEDGE.md` | Knowledge base and rule catalog | Every check: class, detection, fail conditions, reason templates, fixes, verbatim citations; shared algorithms; manual checklist; myth guard; crawler reference |
| `SOURCES.md` | Source registry | Identity, URL and dates of every primary source the scanner may cite |
| `README.md` | This file | How to use the pack |
| `reviews/` | Dated design reviews | Why a release changed what it changed; not normative |

The knowledge comes from *The Ground-Truth Guide to Modern SEO* (Dustin Hofer, Book With Haven; research cutoff 2026-09-28), chiefly Chapter 44 and the Developer Specification (Deliverable 5). On 2026-10-03 the rule logic was re-read against fifteen key sources, which produced the corrections listed in `KNOWLEDGE.md` §1.4, and every stored quote was checked word for word against its live source page.

## Putting it in a repository

Place the four files at `docs/` (this repository keeps them there). If the repository uses an agent instruction file (`CLAUDE.md`, `AGENTS.md` or similar), add the block below to it so every coding session follows the same rules.

```markdown
## SEO scanner: ground rules

- Specs live in docs/seo-scanner/. PRODUCT.md defines behavior and scoring. KNOWLEDGE.md is the only
  source of SEO knowledge: rule logic, classes, reason templates, fixes and quotes. SOURCES.md
  defines citable sources.
- Do not add a check, threshold, weight or claim that is not in KNOWLEDGE.md. If something seems
  missing, propose a KNOWLEDGE.md change with a registered source and a verbatim quote first.
- Rule IDs, condition codes and source IDs are stable identifiers. Never rename or reuse them.
- Evaluation is a pure function of (snapshot, ruleset, config): no network, clock, randomness,
  locale, floating point in output, or model calls. Run the determinism tests before every merge.
- Reasons are filled templates, never generated prose. Quotes are emitted exactly as stored.
- Nothing in KNOWLEDGE.md §6 (myth guard) may ever produce a fail.
- Every rule and fail condition ships with fixtures.
```

## Reading order

1. `PRODUCT.md` §1 to §3 for intent and principles.
2. `KNOWLEDGE.md` §1 to §3 for the evidence model and the shared algorithms (URL normalization, robots.txt matching, effective robots directives, HTML parsing).
3. `PRODUCT.md` §5 to §8 for acquisition, the snapshot, determinism, scoring and findings.
4. `KNOWLEDGE.md` §4 rule by rule, while building each category.
5. `KNOWLEDGE.md` §5 to §8 for the manual checklist, the myth guard, crawler tokens and retired features.

## Suggested build order

| Milestone | Scope | Done when |
|---|---|---|
| 1. Acquisition and snapshot | Fetcher, phased crawler, robots-respecting mode, content-addressed snapshot, SSRF protection | Two acquisitions of an unchanged fixture site produce the same manifest apart from timing |
| 2. Core evaluator | Shared algorithms (§3), HTTP, URL, robots.txt, indexing, head and canonical rules | Golden reports pass; robots.txt conformance tests pass |
| 3. Coverage | Sitemaps, links, headings, images, structured data, hreflang, redirects | Every C1 to C3 rule has fixtures for pass and each fail condition |
| 4. Scoring and report | Formulas, gates, recommendations, canonical JSON, rendered views, diff mode | The worked example in `PRODUCT.md` §7.6 yields exactly 85; all acceptance criteria in §15 pass |
| 5. Optional inputs | Rendered mode, CrUX field data, parity check, owner mode | Turning each off moves only its rules to `not_evaluated` |

## What makes this scanner different

The scanner reports only what primary sources support, at the strength they support it, and it measures a site's distance from the best setup those sources describe. A documented practice the site has not adopted (a sitemap, a meta description, a favicon, a stated site name) counts against the score as an opportunity and is reported as something to add, so a bare site is never rated as perfect. It weights a "must" above a "recommends" above a standards nicety, gives zero weight to optional features and house conventions, and never scores the folklore that fills most SEO audits: title and description lengths, word counts, keyword density, one-H1 rules, llms.txt, sitemap priority. Each finding names what was observed, why it matters in the source's own words, and how to fix or add it, and the headline score prints its own arithmetic. It does not predict rankings, and it says so on the first screen of every report.

## Keeping it current

Search documentation changes often; Google's documentation-updates page logged retirements as recent as June 2026. `PRODUCT.md` §12 and `KNOWLEDGE.md` §9 describe the maintenance loop: a monthly re-fetch of every registered source, a human re-verification of any changed wording, and a versioned ruleset. Reports always show the ruleset version and research cutoff they were produced with.
