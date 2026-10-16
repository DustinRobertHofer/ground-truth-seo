---
name: ground-truth-seo
description: Run and interpret ground-truth-seo, an open-source command line that audits a website's SEO and AI crawler access and cites a primary source, quoted word for word, for every finding. Use when the user asks to audit or scan a site's SEO, check robots.txt, sitemaps, canonical tags, redirects, indexing, structured data or AI crawler access, fix the findings of an SEO report, compare two scans or re-check a site after a deploy, or set up CRUX_API_KEY or AI_GATEWAY_API_KEY for the scanner.
---

# Ground-Truth SEO

`ground-truth-seo` is an open-source (Apache-2.0) SEO scanner and the engine behind https://www.seoscanner.app. It crawls a site, freezes everything it fetched into a snapshot, and evaluates that snapshot against rules taken from what search engines, web standards bodies and AI crawler operators have documented. Every finding names its rule, what was observed, the documented fix and the source passage, quoted word for word with its date. Evaluating the same snapshot with the same flags gives a byte-identical `report.json`.

Source and specification: https://github.com/DustinRobertHofer/ground-truth-seo. Rule pages: https://www.seoscanner.app/methodology/rules/<RULE-ID>.

## Ground rules for the agent

- **Report what the report says.** Every finding, reason, fix and quote comes from `report.json`. Do not add SEO advice, thresholds or best practices that the report does not contain, and do not fill gaps from memory. The scanner deliberately leaves out common folklore; `not_scored` in the report lists those claims and why.
- **Quote exactly.** When you cite a source, copy `citations[].quote` verbatim with its `source_id` and `source_last_updated`. Never present a paraphrase as a quote.
- **The score is not a ranking prediction.** It measures how much of the best documented setup is in place. Say so if the user reads it as a forecast.
- **Keys stay out of the conversation.** Never ask the user to paste an API key into the chat, never write a key into a file in the repository, and never print one. Tell the user how to set it in their shell or CI secrets instead.
- **Scan sites the user is responsible for.** The scanner identifies itself, obeys robots.txt and never requests private or reserved addresses, so it cannot scan `localhost` or a private network: scan a deployed or preview URL.

## Install

Needs Node.js 22 or later (`node --version`). Nothing else: no account, database or browser.

```bash
npx ground-truth-seo --version                 # run without installing
npm install --global ground-truth-seo          # or keep the `ground-truth-seo` command around
ground-truth-seo --help                        # every command and option
ground-truth-seo skill                         # write this skill to .claude/skills/ground-truth-seo/SKILL.md
```

## Workflows

### First audit

```bash
ground-truth-seo scan https://www.example.com --max-pages 50 --out scans/example
```

Start with a small `--max-pages` for a first look; the default is 500. The command prints the score with its arithmetic and writes `report.json`, `report.md` and `snapshot.json`. Read `report.md` for a summary, and `report.json` for anything you act on. Tell the user the headline (`headline.arithmetic` and `headline.summary`), then the first recommendations in the order the report gives them.

### Fix what the report found

1. Work through `recommendations` in order; the report already ranks them. `kind: "fix"` is something broken, `kind: "add"` is a documented practice the site has not adopted yet.
2. For each one, read `action`, `reason`, `affected_units` and `verify`, then find the code, template, configuration or server rule in the user's project that produces the affected URLs. Make the change the `action` describes, nothing broader.
3. After the change is deployed, scan again into a new directory and compare:

```bash
ground-truth-seo scan https://www.example.com --max-pages 50 --out scans/after
ground-truth-seo diff scans/example/report.json scans/after/report.json
```

`diff` prints canonical JSON with the new, resolved and changed findings keyed by rule, condition and URL. Use the same flags for both scans, or the comparison mixes two configurations.

### Re-evaluate a stored snapshot

`evaluate` needs no network. With the same configuration flags as the scan it reproduces `report.json` byte for byte; with different flags (for example `--engines google`) it judges the same snapshot under the new configuration.

```bash
ground-truth-seo evaluate scans/example/snapshot.json --max-pages 50 --out scans/example-again
```

### Field data and the AI review (optional, needs keys)

```bash
ground-truth-seo scan https://www.example.com --max-pages 50 --crux --out scans/example     # Chrome UX Report field data
ground-truth-seo review scans/example/snapshot.json --queries "first search;second search"  # advisory content review
```

The review is advisory: it writes `review.json` and `review.md` and never changes the score or `report.json`. It costs one model call per page it reads plus one for the site.

### In CI

Run `scan` against a preview or staging deployment, keep `report.json`, `report.md` and `snapshot.json` as build artifacts, and `diff` against the last report from the main branch. Pass keys as CI secrets in environment variables.

## API keys

Both keys are optional; a scan without them still runs every rule that does not need them, and reports the rest as not evaluated. The command line reads plain environment variables and does not load `.env` files.

- **`CRUX_API_KEY`**: In the Google Cloud console, choose or create a project, enable the Chrome UX Report API, then create an API key under APIs & Services > Credentials and restrict it to that API. Provider documentation: https://developer.chrome.com/docs/crux/api
- **`AI_GATEWAY_API_KEY`**: In the Vercel dashboard, open AI Gateway, then API Keys, and choose Create key. Model calls are billed to that Vercel account. Provider documentation: https://vercel.com/docs/ai-gateway/authentication

Set a key in the user's shell profile (`export NAME=value` in `~/.zshrc` or `~/.bashrc`; `setx NAME value` on Windows) or as a CI secret, then open a new terminal. Give the user these steps; do not handle the key yourself. Keys never enter a snapshot, report or review file, and the command line redacts them from anything it prints.

## Reading report.json

| Field | What it holds |
| --- | --- |
| `headline` | `overall` score, `arithmetic` (how it was computed), `summary`, failure counts by severity, `opportunities` and the `statements` that say what the score means and does not mean |
| `recommendations` | The ranked plan: `rule_id`, `kind` (`fix` or `add`), `action`, `reason`, `affected_units`, `affected_count`, `outcome`, `verify` steps and `citations` |
| `findings` | Every finding: `rule_id`, `condition`, `status`, `class`, `weight`, `severity`, `unit` (usually a URL), `observed`, `expected`, `reason`, `recommendation`, `verify`, `citations` |
| `categories` | A score per area of the site, each with its arithmetic |
| `features` | Eligibility for search features, with the failing conditions |
| `ai_access_matrix` | Per AI crawler, what robots.txt allows on the home page and sampled URLs |
| `ai_readiness` | What the engines document for appearing in AI answers, and whether it is in place. Never scored |
| `manual_review` | Checks a scan cannot decide (they need Search Console, server logs or intent); hand these to the user |
| `not_scored` | Claims the scanner deliberately does not score, with the evidence |
| `methodology` | Classes, weights, formulas and every source the report cites |
| `meta` | Scanner and ruleset versions, `snapshot_id`, `config_hash` and the full configuration |

Finding statuses: `fail` (broken against what a source documents), `opportunity` (a documented practice not adopted yet; it counts against the score like a fail), `info`, `pass`, `manual` (needs a person), `not_evaluated` (needs data this scan did not have, such as a key or a rendered page) and `not_applicable`.

Useful queries, if `jq` is installed:

```bash
jq '.headline | {overall, arithmetic, summary}' report.json
jq '.recommendations[] | {rule_id, kind, action, affected_count}' report.json
jq '.findings[] | select(.status == "fail") | {rule_id, condition, unit, reason}' report.json
jq '.findings[] | select(.rule_id == "SEO-CANON-05") | .citations' report.json
```

The full rule text, for a rule ID the user asks about, is in `docs/KNOWLEDGE.md` inside the installed package (`$(npm root -g)/ground-truth-seo/docs/KNOWLEDGE.md` for a global install) and at https://www.seoscanner.app/methodology/rules/<RULE-ID>.

## Reference

### Commands

#### `ground-truth-seo scan <url>`

Fetches the site (robots.txt, sitemaps, a link crawl, host and scheme variants, a 404 probe, icons, images, llms.txt), freezes everything it fetched into a snapshot, evaluates it, and writes the report and the snapshot. It prints the score with its arithmetic, the headline and the snapshot ID. Writes `report.json`, `report.md`, `snapshot.json`.

#### `ground-truth-seo evaluate <snapshot.json>`

Evaluates a stored snapshot without touching the network. With the same configuration flags as the scan, the new report.json is byte-identical to the scan's; with different flags, for example another --engines value, the same snapshot is judged under the new configuration. Writes `report.json`, `report.md`.

#### `ground-truth-seo review <snapshot.json>`

Runs the advisory content and AI-answer review on a stored snapshot. It suggests titles, meta descriptions and main headings, lists the searches each page should answer and the questions it leaves open, drafts FAQ entries and checks llms.txt. It never changes the score or report.json. Writes `review.json`, `review.md`.

#### `ground-truth-seo diff <before/report.json> <after/report.json>`

Compares two reports and prints, as canonical JSON, both snapshot IDs and scores, the new, resolved and changed findings keyed by rule, condition and URL, and whether the favicon changed.

#### `ground-truth-seo skill`

Writes SKILL.md, an Agent Skill that teaches a coding agent how to install and run this command line, set up its keys, and read report.json without adding claims of its own. The default directory, .claude/skills/ground-truth-seo, is where Claude Code finds project skills; pass --out to put it elsewhere. Writes `SKILL.md`.

### Options

| Option | Commands | What it does |
| --- | --- | --- |
| `--out <dir>` | scan, evaluate, review, skill | Where to write the files. Defaults: scan-<host> for scan, the current directory for evaluate, the snapshot's directory for review, .claude/skills/ground-truth-seo for skill. |
| `--max-pages <n>` | scan, evaluate | How many pages to fetch: the link crawl plus pages found only in sitemaps (default 500). |
| `--max-depth <n>` | scan, evaluate | How many links deep the crawl goes from the home page (default 20). |
| `--max-extra-fetches <n>` | scan, evaluate | Budget for extra fetches: canonical targets, alternates and redirect targets (default 500). |
| `--engines <list>` | scan, evaluate | The search engines to audit for, comma-separated: google, bing (default both). Rules documented only by an engine you leave out become not applicable. |
| `--include <patterns>` | scan, evaluate | Comma-separated path glob patterns that shape the set of pages you intend to be indexed. |
| `--exclude <patterns>` | scan, evaluate | Comma-separated path glob patterns to leave out of that set. |
| `--additional-origins <list>` | scan, evaluate | Comma-separated extra origins that belong to the site and are treated as in scope. |
| `--staging-hosts <list>` | scan, evaluate | Comma-separated staging hosts, which should require authentication. Enables SEO-ROBOTS-09. |
| `--indexnow-key <key>` | scan, evaluate | Your IndexNow key, so its key file is checked. Enables SEO-SITEMAP-06. |
| `--house-conventions` | scan, evaluate | Also reports the house-convention (-HC) rules. They carry zero weight, so the score does not move. |
| `--third-party-resources` | scan, evaluate | Extends SEO-ROBOTS-05B (resources needed for rendering are crawlable) to resources served from other origins. |
| `--crux` | scan | Asks the Chrome UX Report API for field data for the origin and the home page, on phones and desktops, which SEO-PERF-01 judges against Google's thresholds. The key never enters the snapshot or the report. Needs `CRUX_API_KEY`. |
| `--review` | scan | Runs the advisory AI review right after the scan and writes review.json and review.md beside the report. Needs `AI_GATEWAY_API_KEY`. |
| `--review-pages <n>` | scan, review | How many pages the review reads (default 6, at most 20). |
| `--queries "<a;b>"` | scan, review | Searches the pages should answer, separated by semicolons. |
| `--queries-file <file>` | scan, review | The same, read from a file with one search per line. |

### Output files

| File | Contents |
| --- | --- |
| `report.json` | The report as RFC 8785 canonical JSON: scanner and ruleset versions, snapshot ID, configuration and its hash, the score with its arithmetic, every finding with what was observed, the reason, the fix and the source quoted word for word, and the recommendations. |
| `report.md` | A readable report rendered from report.json. |
| `snapshot.json` | Everything the scan fetched: requests, responses, content-addressed bodies, DNS and TLS records and the one clock reading. Its ID is the SHA-256 of its canonical manifest. |
| `review.json` | The advisory review (with --review or review). Never part of the report or the score. |
| `review.md` | A readable view of the review. |
| `SKILL.md` | The agent skill (skill command): how a coding agent installs, runs and reads the command line. |

### Environment variables

| Variable | Effect |
| --- | --- |
| `CRUX_API_KEY` | A Chrome UX Report API key, required by --crux. |
| `AI_GATEWAY_API_KEY` | A Vercel AI Gateway API key, required by --review and the review command. It works on any machine; no Vercel project is needed. |
| `AI_REVIEW_MODEL` | The Gateway model ID the review uses (default anthropic/claude-sonnet-5.5). |
| `AI_REVIEW_DISABLED` | Set to 1 to turn the review off. |

## Limits

- No rendered mode yet: pages are not loaded in a browser, so rules that need rendering, and the phone and desktop parity check, report as not evaluated.
- No private or reserved addresses, so no `localhost`; scan a deployed URL.
- robots.txt is obeyed: pages it disallows for the scanner are not fetched.
- Reports and snapshots stay on the user's machine. With `--crux` the origin and home page URLs go to the Chrome UX Report API, and the review sends page text to the AI Gateway; nothing goes to https://www.seoscanner.app.
