/**
 * The agent skill: one SKILL.md, in the Agent Skills format, that teaches a
 * coding agent (Claude Code and others) how to install and run the command line,
 * set up its keys, and read report.json without adding claims of its own.
 *
 * The commands, options, variables and files are rendered from ../cli/options.ts,
 * so the skill cannot drift from what the command line accepts. The copy in
 * skills/ground-truth-seo/SKILL.md is checked against skillMarkdown() by
 * skill.test.ts; regenerate it with `pnpm skill`.
 *
 * It holds no SEO knowledge: every finding, reason, fix and quote it points the
 * agent to comes from the report, which comes from docs/KNOWLEDGE.md.
 *
 * Safe to import from browser code: it holds strings only.
 */

import { CLI_BIN, CLI_COMMANDS, CLI_ENV, CLI_OPTIONS, CLI_OUTPUTS } from "../cli/options.js";

export const SKILL_NAME = "ground-truth-seo";

/** Where `ground-truth-seo skill` writes SKILL.md: Claude Code's project skills directory. */
export const SKILL_DEFAULT_DIR = `.claude/skills/${SKILL_NAME}`;

export const SKILL_FILE = "SKILL.md";

const SITE = "https://www.seoscanner.app";
const REPO = "https://github.com/DustinRobertHofer/ground-truth-seo";

/** Text for a Markdown table cell: whitespace collapsed, pipes escaped. */
function cell(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}

function commandUsage(name: string, args: string): string {
  return args ? `${name} ${args}` : name;
}

export function skillMarkdown(): string {
  const commands = CLI_COMMANDS.map((c) => `#### \`${CLI_BIN} ${commandUsage(c.name, c.args)}\`\n\n${c.description}${c.writes.length ? ` Writes ${c.writes.map((f) => `\`${f}\``).join(", ")}.` : ""}`).join("\n\n");
  const options = CLI_OPTIONS.map(
    (o) => `| \`${cell(o.value ? `${o.flag} ${o.value}` : o.flag)}\` | ${o.commands.join(", ")} | ${cell(o.description)}${o.needs ? ` Needs \`${o.needs}\`.` : ""} |`,
  ).join("\n");
  const outputs = CLI_OUTPUTS.map((o) => `| \`${o.file}\` | ${cell(o.description)} |`).join("\n");
  const env = CLI_ENV.map((e) => `| \`${e.name}\` | ${cell(e.description)} |`).join("\n");
  const keys = CLI_ENV.filter((e) => e.secret && e.obtain)
    .map((e) => `- **\`${e.name}\`**: ${e.obtain}${e.docsUrl ? ` Provider documentation: ${e.docsUrl}` : ""}`)
    .join("\n");

  return `---
name: ${SKILL_NAME}
description: Run and interpret ${CLI_BIN}, an open-source command line that audits a website's SEO and AI crawler access and cites a primary source, quoted word for word, for every finding. Use when the user asks to audit or scan a site's SEO, check robots.txt, sitemaps, canonical tags, redirects, indexing, structured data or AI crawler access, fix the findings of an SEO report, compare two scans or re-check a site after a deploy, or set up CRUX_API_KEY or AI_GATEWAY_API_KEY for the scanner.
---

# Ground-Truth SEO

\`${CLI_BIN}\` is an open-source (Apache-2.0) SEO scanner and the engine behind ${SITE}. It crawls a site, freezes everything it fetched into a snapshot, and evaluates that snapshot against rules taken from what search engines, web standards bodies and AI crawler operators have documented. Every finding names its rule, what was observed, the documented fix and the source passage, quoted word for word with its date. Evaluating the same snapshot with the same flags gives a byte-identical \`report.json\`.

Source and specification: ${REPO}. Rule pages: ${SITE}/methodology/rules/<RULE-ID>.

## Ground rules for the agent

- **Report what the report says.** Every finding, reason, fix and quote comes from \`report.json\`. Do not add SEO advice, thresholds or best practices that the report does not contain, and do not fill gaps from memory. The scanner deliberately leaves out common folklore; \`not_scored\` in the report lists those claims and why.
- **Quote exactly.** When you cite a source, copy \`citations[].quote\` verbatim with its \`source_id\` and \`source_last_updated\`. Never present a paraphrase as a quote.
- **The score is not a ranking prediction.** It measures how much of the best documented setup is in place. Say so if the user reads it as a forecast.
- **Keys stay out of the conversation.** Never ask the user to paste an API key into the chat, never write a key into a file in the repository, and never print one. Tell the user how to set it in their shell or CI secrets instead.
- **Scan sites the user is responsible for.** The scanner identifies itself, obeys robots.txt and never requests private or reserved addresses, so it cannot scan \`localhost\` or a private network: scan a deployed or preview URL.

## Install

Needs Node.js 22 or later (\`node --version\`). Nothing else: no account, database or browser.

\`\`\`bash
npx ${CLI_BIN} --version                 # run without installing
npm install --global ${CLI_BIN}          # or keep the \`${CLI_BIN}\` command around
${CLI_BIN} --help                        # every command and option
${CLI_BIN} skill                         # write this skill to ${SKILL_DEFAULT_DIR}/${SKILL_FILE}
\`\`\`

## Workflows

### First audit

\`\`\`bash
${CLI_BIN} scan https://www.example.com --max-pages 50 --out scans/example
\`\`\`

Start with a small \`--max-pages\` for a first look; the default is 500. The command prints the score with its arithmetic and writes \`report.json\`, \`report.md\` and \`snapshot.json\`. Read \`report.md\` for a summary, and \`report.json\` for anything you act on. Tell the user the headline (\`headline.arithmetic\` and \`headline.summary\`), then the first recommendations in the order the report gives them.

### Fix what the report found

1. Work through \`recommendations\` in order; the report already ranks them. \`kind: "fix"\` is something broken, \`kind: "add"\` is a documented practice the site has not adopted yet.
2. For each one, read \`action\`, \`reason\`, \`affected_units\` and \`verify\`, then find the code, template, configuration or server rule in the user's project that produces the affected URLs. Make the change the \`action\` describes, nothing broader.
3. After the change is deployed, scan again into a new directory and compare:

\`\`\`bash
${CLI_BIN} scan https://www.example.com --max-pages 50 --out scans/after
${CLI_BIN} diff scans/example/report.json scans/after/report.json
\`\`\`

\`diff\` prints canonical JSON with the new, resolved and changed findings keyed by rule, condition and URL. Use the same flags for both scans, or the comparison mixes two configurations.

### Re-evaluate a stored snapshot

\`evaluate\` needs no network. With the same configuration flags as the scan it reproduces \`report.json\` byte for byte; with different flags (for example \`--engines google\`) it judges the same snapshot under the new configuration.

\`\`\`bash
${CLI_BIN} evaluate scans/example/snapshot.json --max-pages 50 --out scans/example-again
\`\`\`

### Field data and the AI review (optional, needs keys)

\`\`\`bash
${CLI_BIN} scan https://www.example.com --max-pages 50 --crux --out scans/example     # Chrome UX Report field data
${CLI_BIN} review scans/example/snapshot.json --queries "first search;second search"  # advisory content review
\`\`\`

The review is advisory: it writes \`review.json\` and \`review.md\` and never changes the score or \`report.json\`. It costs one model call per page it reads plus one for the site.

### In CI

Run \`scan\` against a preview or staging deployment, keep \`report.json\`, \`report.md\` and \`snapshot.json\` as build artifacts, and \`diff\` against the last report from the main branch. Pass keys as CI secrets in environment variables.

## API keys

Both keys are optional; a scan without them still runs every rule that does not need them, and reports the rest as not evaluated. The command line reads plain environment variables and does not load \`.env\` files.

${keys}

Set a key in the user's shell profile (\`export NAME=value\` in \`~/.zshrc\` or \`~/.bashrc\`; \`setx NAME value\` on Windows) or as a CI secret, then open a new terminal. Give the user these steps; do not handle the key yourself. Keys never enter a snapshot, report or review file, and the command line redacts them from anything it prints.

## Reading report.json

| Field | What it holds |
| --- | --- |
| \`headline\` | \`overall\` score, \`arithmetic\` (how it was computed), \`summary\`, failure counts by severity, \`opportunities\` and the \`statements\` that say what the score means and does not mean |
| \`recommendations\` | The ranked plan: \`rule_id\`, \`kind\` (\`fix\` or \`add\`), \`action\`, \`reason\`, \`affected_units\`, \`affected_count\`, \`outcome\`, \`verify\` steps and \`citations\` |
| \`findings\` | Every finding: \`rule_id\`, \`condition\`, \`status\`, \`class\`, \`weight\`, \`severity\`, \`unit\` (usually a URL), \`observed\`, \`expected\`, \`reason\`, \`recommendation\`, \`verify\`, \`citations\` |
| \`categories\` | A score per area of the site, each with its arithmetic |
| \`features\` | Eligibility for search features, with the failing conditions |
| \`ai_access_matrix\` | Per AI crawler, what robots.txt allows on the home page and sampled URLs |
| \`ai_readiness\` | What the engines document for appearing in AI answers, and whether it is in place. Never scored |
| \`manual_review\` | Checks a scan cannot decide (they need Search Console, server logs or intent); hand these to the user |
| \`not_scored\` | Claims the scanner deliberately does not score, with the evidence |
| \`methodology\` | Classes, weights, formulas and every source the report cites |
| \`meta\` | Scanner and ruleset versions, \`snapshot_id\`, \`config_hash\` and the full configuration |

Finding statuses: \`fail\` (broken against what a source documents), \`opportunity\` (a documented practice not adopted yet; it counts against the score like a fail), \`info\`, \`pass\`, \`manual\` (needs a person), \`not_evaluated\` (needs data this scan did not have, such as a key or a rendered page) and \`not_applicable\`.

Useful queries, if \`jq\` is installed:

\`\`\`bash
jq '.headline | {overall, arithmetic, summary}' report.json
jq '.recommendations[] | {rule_id, kind, action, affected_count}' report.json
jq '.findings[] | select(.status == "fail") | {rule_id, condition, unit, reason}' report.json
jq '.findings[] | select(.rule_id == "SEO-CANON-05") | .citations' report.json
\`\`\`

The full rule text, for a rule ID the user asks about, is in \`docs/KNOWLEDGE.md\` inside the installed package (\`$(npm root -g)/${CLI_BIN}/docs/KNOWLEDGE.md\` for a global install) and at ${SITE}/methodology/rules/<RULE-ID>.

## Reference

### Commands

${commands}

### Options

| Option | Commands | What it does |
| --- | --- | --- |
${options}

### Output files

| File | Contents |
| --- | --- |
${outputs}

### Environment variables

| Variable | Effect |
| --- | --- |
${env}

## Limits

- No rendered mode yet: pages are not loaded in a browser, so rules that need rendering, and the phone and desktop parity check, report as not evaluated.
- No private or reserved addresses, so no \`localhost\`; scan a deployed URL.
- robots.txt is obeyed: pages it disallows for the scanner are not fetched.
- Reports and snapshots stay on the user's machine. With \`--crux\` the origin and home page URLs go to the Chrome UX Report API, and the review sends page text to the AI Gateway; nothing goes to ${SITE}.
`;
}
