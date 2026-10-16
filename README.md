# ground-truth-seo

A website SEO scanner whose results are deterministic, explained and cited. It audits a site against what search engines, web standards bodies and AI crawler operators have actually documented, and rates it against the best setup those documents describe: a documented practice the site has not adopted counts as an opportunity and is listed as something to add. Every point in the score traces to a rule, every rule to a primary source, and every source to a dated passage quoted word for word. Evaluate the same snapshot with the same configuration twice and the report comes back byte-identical.

This is the engine behind [seoscanner.app](https://www.seoscanner.app) and its command line, published as one npm package. The website uses this package; it has no engine of its own.

## Install and run

You need Node.js 22 or later (a current LTS release). Nothing else: no database, no browser, no account.

```bash
npx ground-truth-seo scan https://www.example.com --max-pages 50 --out scans/example
```

or install it:

```bash
npm install --global ground-truth-seo     # the `ground-truth-seo` command
npm install ground-truth-seo              # the library, for your own code
```

The scanner identifies itself honestly (`GroundTruthSEOScanner/<version>`), obeys robots.txt, and never requests private or reserved network addresses.

## Commands

```bash
ground-truth-seo scan <url> [options]                 # crawl, evaluate, write report.json, report.md, snapshot.json
ground-truth-seo evaluate <snapshot.json> [options]   # evaluate a stored snapshot again
ground-truth-seo review <snapshot.json> [options]     # advisory AI review of a stored snapshot
ground-truth-seo diff <before/report.json> <after/report.json>
ground-truth-seo --help
ground-truth-seo --version
```

### `scan <url>`

Fetches the site (robots.txt, sitemaps, a link crawl, variant origins, a 404 probe, favicons, images, llms.txt and more; `docs/PRODUCT.md` §5), freezes everything it fetched into a snapshot, evaluates it and writes three files to the output directory (default `scan-<host>`). It prints the score's arithmetic, the headline and the snapshot ID.

### `evaluate <snapshot.json>`

Evaluates a stored snapshot without touching the network and writes `report.json` and `report.md` (default directory: the current one). The configuration is part of the report (`meta.config` and `meta.config_hash`), so to reproduce a scan's `report.json` byte for byte, pass the same configuration flags you scanned with:

```bash
ground-truth-seo scan https://www.example.com --max-pages 3 --out a
ground-truth-seo evaluate a/snapshot.json --max-pages 3 --out b
cmp a/report.json b/report.json    # identical
```

Changing a flag, for example `--engines google`, re-scores the same snapshot under a different configuration.

### `review <snapshot.json>`

Runs the advisory content and AI-answer review (`docs/PRODUCT.md` §17) on a stored snapshot and writes `review.json` and `review.md` beside it (or to `--out`). The review suggests rewrites for titles, meta descriptions and main headings, lists the searches each page should answer and the questions it leaves open, drafts FAQ entries and checks llms.txt. It never enters the score or `report.json`. Its instructions are the guidelines in `docs/KNOWLEDGE.md` §11, quoted from Google, Microsoft and the llms.txt proposal. It needs `AI_GATEWAY_API_KEY`; without one, the command stops with a message before doing any work. `scan --review` runs it right after a scan.

### `diff <before> <after>`

Compares two `report.json` files and prints, as canonical JSON, both snapshot IDs and overall scores, the new, resolved and changed findings, and whether the favicon changed.

### Options

| Flag | Commands | Effect |
| --- | --- | --- |
| `--out <dir>` | scan, evaluate, review | Output directory. Defaults: `scan-<host>` for scan, `.` for evaluate, the snapshot's directory for review. |
| `--max-pages <n>` | scan, evaluate | Pages to fetch: the link crawl plus sitemap-only pages (default 500). |
| `--max-depth <n>` | scan, evaluate | Link depth (default 20). |
| `--max-extra-fetches <n>` | scan, evaluate | Budget for extra fetches: canonical targets, alternates, redirect targets (default 500). |
| `--engines <list>` | scan, evaluate | Comma-separated search engines to evaluate for: `google`, `bing` (default both). Rules documented only by an unselected engine become not applicable. |
| `--include <patterns>` | scan, evaluate | Comma-separated path glob patterns that shape the set of pages you intend to be indexed. |
| `--exclude <patterns>` | scan, evaluate | Comma-separated path glob patterns to leave out of that set. |
| `--additional-origins <list>` | scan, evaluate | Comma-separated extra origins treated as in scope. |
| `--staging-hosts <list>` | scan, evaluate | Comma-separated staging hosts; enables `SEO-ROBOTS-09`. |
| `--indexnow-key <key>` | scan, evaluate | Your IndexNow key; enables `SEO-SITEMAP-06`. |
| `--house-conventions` | scan, evaluate | Enables the `-HC` house-convention rules, which carry zero weight. |
| `--third-party-resources` | scan, evaluate | Extends `SEO-ROBOTS-05B` to resources on other origins. |
| `--crux` | scan | Ask the Chrome UX Report API for field data for the origin and home page, on phones and desktops, judged by `SEO-PERF-01`. Needs `CRUX_API_KEY`. |
| `--review` | scan | Run the advisory AI review after the scan. Needs `AI_GATEWAY_API_KEY`. |
| `--review-pages <n>` | scan, review | Pages to review (default 6, at most 20). |
| `--queries "<a;b>"` | scan, review | Searches the pages should answer, separated by `;`. |
| `--queries-file <file>` | scan, review | The same, one per line. |

The specification also describes a rendered mode (headless Chromium) and a mobile/desktop parity check. Neither is implemented in this release: there is no browser and no flag for them, and the rules that need them (marked in `docs/KNOWLEDGE.md`) are reported as not evaluated.

## Output files

| File | Contents |
| --- | --- |
| `report.json` | The report in RFC 8785 canonical JSON (UTF-8, sorted keys, no insignificant whitespace, LF). `meta` carries the scanner version, ruleset version, knowledge cutoff, `snapshot_id`, `config_hash` and the full configuration. Then the headline score with its arithmetic, category scores, every finding with what was observed, the reason, the fix and the source quoted word for word, recommendations, the manual checklist and the myth guard. `docs/PRODUCT.md` §10 describes every field. |
| `report.md` | A readable view rendered from `report.json`. |
| `snapshot.json` | Everything the scan fetched: every request and response, content-addressed bodies (SHA-256, base64), DNS and TLS records, and the single clock reading. Its `snapshot_id` is the SHA-256 of its canonical manifest, so two reports can be compared knowing whether their inputs differed. API keys never enter it. |
| `review.json`, `review.md` | Only with `--review` or `review`: the advisory review. Never part of the report or the score. |

## Determinism

`evaluate(snapshot, ruleset, config)` is a pure function. It uses no network, clock, randomness, locale-dependent formatting or floating point in anything that reaches the output, and never calls a model. Given the same snapshot, the same ruleset version and the same configuration, it produces a byte-identical `report.json` across runs, processes, machines, operating systems, time zones and locales (`docs/PRODUCT.md` §6). The test suite proves it with golden reports (`fixtures/golden/`), idempotence and order-independence tests, and CI runs the golden reports again under other time zones and locales and on Linux and macOS.

Acquisition cannot be fully deterministic, because sites and networks change. That is why the scan freezes its input into `snapshot.json` first.

## Environment variables

The command line reads plain environment variables. It does not load `.env` files.

| Variable | Effect |
| --- | --- |
| `CRUX_API_KEY` | A Chrome UX Report API key, required by `--crux`. |
| `AI_GATEWAY_API_KEY` | A [Vercel AI Gateway](https://vercel.com/ai-gateway) API key, required by `--review` and `review`. It works anywhere; no Vercel project or deployment is needed. |
| `AI_REVIEW_MODEL` | The Gateway model ID for the review (default `anthropic/claude-sonnet-5.5`). |
| `AI_REVIEW_DISABLED` | Set to `1` to turn the review off. |

Keys never enter a snapshot, a report, a review file or anything the command prints; as a last line of defense the command line redacts their values from its output.

A review costs one model call per sampled page plus one for the site (about $0.05 to $0.10 per page with the default model).

## Library

```ts
import { scan, evaluateSnapshot, diffReports, renderMarkdown, canonicalize } from "ground-truth-seo";

const result = await scan({ start_url: "https://www.example.com/", max_pages: 50 });
console.log(result.report.headline.arithmetic);

const again = evaluateSnapshot(result.snapshot, { start_url: "https://www.example.com/", max_pages: 50 });
again.reportJson === result.reportJson; // true
```

The root entry point exports:

- Scanning: `scan`, `evaluateSnapshot`, `evaluate`, `resolveConfig`, `configHash`, `CONFIG_DEFAULTS`, `ConfigError`, `HttpFetcher`, `cruxApiKey`, `cruxApiProvider`, `SCANNER_VERSION`.
- Reports: `renderMarkdown`, `diffReports`, `canonicalize`, `parseStoredReport`, `upgradeReport`, and the types `Report`, `Finding`, `Recommendation`, `ReportDiff`, `Snapshot`, `ScanConfig`, `ScanConfigInput`, `ScanResult`.
- The ruleset: `RULES`, `RULESET_VERSION`, `KNOWLEDGE_CUTOFF` (and everything in `ground-truth-seo/scanner/rules`: sources, crawlers, myths, the manual checklist).
- The security checker (`docs/PRODUCT.md` §20): `executeSecurityCheck`, `acquireForSecurity`, `securityInput`, `buildSecurityResult`, `normalizeSearchTerms` and the `SecurityResult` types. It looks for exposed Git files, `.env` and credential files, source maps and secrets in what a site serves, and reports what and where, never the value. It is not part of the SEO score.
- The content review: `extractContent`, `reviewContent`, `renderReviewMarkdown`, `aiReviewConfigured`, `reviewModel`, and the `ContentReview` types.

`ground-truth-seo/testing` holds the in-memory site used by the test suite (`baselineSite`, `snapshotOf`, `reportOf`, `MemoryFetcher`), for testing code that consumes reports. Deeper modules are importable as `ground-truth-seo/<path under src>` (for example `ground-truth-seo/scanner/report/types`); they are exported for the website and advanced use, and may change between minor versions while the package is below 1.0.

The package version is independent of the ruleset version. Reports carry the scanner and ruleset versions they were produced with.

## The specification

| File | Role |
| --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | How a scan runs, the determinism contract, scoring, finding and report formats, configuration, acceptance criteria |
| [`docs/KNOWLEDGE.md`](docs/KNOWLEDGE.md) | The rule catalog: every check, class, detection, reason template, fix and verbatim citation; shared algorithms; manual checklist; myth guard; review guidance; exposure checks |
| [`docs/SOURCES.md`](docs/SOURCES.md) | Every primary source the scanner may cite |

`docs/PRODUCT.md` also describes the website built on this package (history, private links, benchmarks, the research corpus); those parts live in the website, not here.

## Layout

```
src/
  scanner/
    rules/          the compiled ruleset: KNOWLEDGE.md and SOURCES.md transcribed, one file per category
    acquire/        the only code that touches the network: fetcher, SSRF guard, phased crawler, CrUX
    snapshot/       manifest, content-addressed bodies, canonical JSON, snapshot id
    evaluate/       pure evaluation: shared algorithms (core/), evaluation context, one evaluator per category
    report/         exact-rational scoring, recommendations, report.json, Markdown view, diff
  checkers/         the focused single-question checks (PRODUCT.md §19)
  security/         the security checker (PRODUCT.md §20, KNOWLEDGE.md §12)
  content-review/   the advisory AI review (PRODUCT.md §17, KNOWLEDGE.md §11)
  testing/          the in-memory site the fixtures run against
  cli/              the command line
fixtures/           acceptance, rule coverage, determinism and golden-report tests
docs/               the specification
```

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test        # ruleset integrity (every quote checked against KNOWLEDGE.md), core algorithms,
                 # acceptance criteria (PRODUCT.md §15), rule coverage fixtures, golden reports, determinism
pnpm build       # dist/: ESM and type declarations
node dist/cli.js scan https://www.example.com --max-pages 3 --out /tmp/example
```

Read [AGENTS.md](AGENTS.md) before changing anything. In short: code must not contain SEO knowledge that is absent from `docs/KNOWLEDGE.md`; new checks start with a registered source and a verbatim quote; rule IDs, condition codes and source IDs are stable; reasons are filled templates and quotes are emitted exactly as stored; nothing in the myth guard may ever produce a fail.

## License

Code: [Apache-2.0](LICENSE). The prose in `docs/`: [CC BY 4.0](docs/LICENSE). The verbatim quotations in `docs/KNOWLEDGE.md` and in the ruleset belong to their publishers, named in `docs/SOURCES.md`, and are reproduced as attributed quotations; they are not licensed by this project. See [NOTICE](NOTICE).
