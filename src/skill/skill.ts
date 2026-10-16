/**
 * The agent skill: one SKILL.md, in the Agent Skills format, that teaches a
 * coding agent (Claude Code and others) how to get answers about a site from the
 * command line and how to present them, on a canvas, without adding claims of
 * its own. Setup is not its job: it points to the documentation for that.
 *
 * The commands, options and output files are rendered from ../cli/options.ts and
 * the report areas from the ruleset's category list, so the skill cannot drift
 * from what the command line accepts. The copy in skills/ground-truth-seo/SKILL.md
 * is checked against skillMarkdown() by skill.test.ts; regenerate it with
 * `pnpm skill`.
 *
 * It holds no SEO knowledge: every finding, reason, fix and quote it points the
 * agent to comes from the report, which comes from docs/KNOWLEDGE.md.
 *
 * Safe to import from browser code: it holds strings only.
 */

import { CLI_BIN, CLI_COMMANDS, CLI_OPTIONS, CLI_OUTPUTS } from "../cli/options.js";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "../scanner/rules/types.js";

export const SKILL_NAME = "ground-truth-seo";

/** Where `ground-truth-seo skill` writes SKILL.md: Claude Code's project skills directory. */
export const SKILL_DEFAULT_DIR = `.claude/skills/${SKILL_NAME}`;

export const SKILL_FILE = "SKILL.md";

const SITE = "https://www.seoscanner.app";
const REPO = "https://github.com/DustinRobertHofer/ground-truth-seo";

/** Installation, API keys and every option, for the agent to read when setup is needed. */
export const SETUP_DOCS_URL = `${SITE}/command-line`;

/** Text for a Markdown table cell: whitespace collapsed, pipes escaped. */
function cell(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}

export function skillMarkdown(): string {
  const commands = CLI_COMMANDS.filter((c) => c.name !== "skill")
    .map((c) => `| \`${cell(c.args ? `${c.name} ${c.args}` : c.name)}\` | ${cell(c.summary)} |`)
    .join("\n");
  const options = CLI_OPTIONS.map(
    (o) => `| \`${cell(o.value ? `${o.flag} ${o.value}` : o.flag)}\` | ${o.commands.join(", ")} | ${cell(o.help)}${o.needs ? ` Needs \`${o.needs}\`.` : ""} |`,
  ).join("\n");
  const outputs = CLI_OUTPUTS.filter((o) => o.file !== SKILL_FILE)
    .map((o) => `| \`${o.file}\` | ${cell(o.description)} |`)
    .join("\n");
  const areas = CATEGORY_ORDER.map((key) => `\`${key}\` (${CATEGORY_LABEL[key]})`).join(", ");
  const keyed = CLI_OPTIONS.filter((o) => o.needs).map((o) => `\`${o.flag}\` needs \`${o.needs}\``);

  return `---
name: ${SKILL_NAME}
description: Get answers about a website from ${CLI_BIN}, an open-source SEO scanner that cites a primary source, quoted word for word, for every finding, and present them on a canvas. Use when the user asks how a site is doing in search, why a page is not indexed, whether AI crawlers can read the site, what to fix first, what changed since the last scan or deploy, or wants an SEO report explained, compared or shared.
---

# Ground-Truth SEO

\`${CLI_BIN}\` crawls a site, freezes what it fetched into a snapshot, and evaluates the snapshot against rules taken from what search engines, web standards bodies and AI crawler operators have documented. Every finding names its rule, what was observed, the documented fix and the source passage, quoted word for word with its date. This skill is about two things: getting the right information out of the scanner, and presenting it to the user.

## Setup is documented elsewhere

If \`${CLI_BIN} --version\` fails, a key is missing, or the user asks how to install or configure anything, read ${SETUP_DOCS_URL} (installation, API keys, every option) or the README at ${REPO}, and follow it there. Do not guess at setup steps. ${keyed.join(" and ")}; without the keys, everything else still runs. Never ask the user to paste a key into the conversation.

## Getting information about a site

### Start from what already exists

Look for earlier output before scanning again: directories holding \`report.json\` and \`snapshot.json\` (often under \`scans/\` or named \`scan-<host>\`). A stored snapshot answers most follow-up questions without touching the network:

- Same question, another configuration (for example one search engine): \`${CLI_BIN} evaluate <snapshot.json> --engines google --out <dir>\`.
- What changed: \`${CLI_BIN} diff <before/report.json> <after/report.json>\` lists new, resolved and changed findings keyed by rule, condition and URL.

Scan again only when the site has changed, the user asks for fresh data, or no report exists.

### Scanning

\`\`\`bash
${CLI_BIN} scan https://www.example.com --max-pages 50 --out scans/example-com
\`\`\`

Use a small \`--max-pages\` for a first look and raise it when the user needs coverage of the whole site. Scan a deployed URL: the scanner never requests \`localhost\` or private addresses, and it obeys robots.txt. Keep the configuration flags the same between scans you intend to compare.

### Where each answer lives in report.json

| The user asks | Read |
| --- | --- |
| How is the site doing overall? | \`headline\`: \`overall\`, \`arithmetic\`, \`summary\`, the failure counts, \`opportunities\` and \`statements\` (what the score means and does not mean) |
| What should we fix first? | \`recommendations\`, already ranked: \`kind\` (\`fix\` for something broken, \`add\` for a documented practice not adopted yet), \`action\`, \`reason\`, \`affected_count\`, \`affected_units\`, \`verify\`, \`citations\` |
| Why is this page not indexed, or what is wrong with this URL? | \`findings\` whose \`unit\` is that URL, with their \`status\`, \`reason\`, \`observed\` and \`expected\` |
| How is one area doing? | \`categories\` (score and arithmetic per area) and \`findings\` with that \`category\` |
| Can AI crawlers read the site? Will it show up in AI answers? | \`ai_access_matrix\` (what robots.txt allows each crawler) and \`ai_readiness\` (never scored) |
| Is the site eligible for a search feature? | \`features\`, with the failing conditions |
| What can the scan not tell us? | \`manual_review\`, and findings with status \`not_evaluated\` |
| Why isn't some common advice scored? | \`not_scored\`, with the evidence |
| Where does a rule come from? | \`methodology.rules\` and \`methodology.sources\`; the full rule at ${SITE}/methodology/rules/<RULE-ID> |
| How fast is the site for real users? | Field data from a scan with \`--crux\`, judged under the \`performance\` area |
| How should the copy change? | \`review.json\` from \`${CLI_BIN} review <snapshot.json>\`; advisory only, never part of the score |

The areas, as \`category\` keys: ${areas}.

Finding statuses: \`fail\` (broken against what a source documents), \`opportunity\` (a documented practice not adopted yet; it counts against the score like a fail), \`info\`, \`pass\`, \`manual\` (needs a person), \`not_evaluated\` (needs data this scan did not have) and \`not_applicable\`.

If \`jq\` is installed:

\`\`\`bash
jq '.headline | {overall, arithmetic, summary}' report.json
jq '.recommendations[] | {rule_id, kind, action, affected_count}' report.json
jq '.categories[] | {key, label, score}' report.json
jq --arg u "https://www.example.com/page" '.findings[] | select(.unit == $u and .status != "pass")' report.json
jq '.findings[] | select(.category == "robots" and (.status == "fail" or .status == "opportunity"))' report.json
\`\`\`

## Presenting it

### Ground rules

- **Say only what the report says.** Every finding, reason, fix and quote comes from the scanner's files. Do not add SEO advice, thresholds or best practices they do not contain, and do not fill gaps from memory.
- **Quote exactly.** Copy \`citations[].quote\` verbatim with its \`source_id\` and \`source_last_updated\`. A paraphrase is never shown as a quote.
- **Keep the report's words for status.** A \`fail\` is something broken, an \`opportunity\` is something to add, \`not_evaluated\` is unknown. Do not upgrade one to another or call an opportunity an error.
- **The score is not a ranking prediction.** Show \`headline.arithmetic\` beside it and the \`statements\` that say what it measures.
- **Be plain about limits.** Name what the scan could not decide (\`manual_review\`, \`not_evaluated\`) instead of leaving it out.

### Describe outcomes on a canvas

Present results on a canvas: a visual surface beside the conversation, such as an artifact, a canvas or a rendered page, whichever your environment offers. Build it from the report, then keep the chat reply to a few sentences that point to it. If no canvas is available, write the same page as a self-contained HTML file next to the report (for example \`scans/example-com/summary.html\`) and tell the user where it is.

Lay the canvas out in this order, and leave out any section the question does not need:

1. **Headline.** The overall score, its arithmetic, the site and scan date (\`meta.start_url\`, \`meta.completed_at\`), the ruleset version, and the statement of what the score means.
2. **What to do first.** The top recommendations as cards: the action, fix or add, how many URLs it affects, the verify steps, and the quoted source with its ID and date. Link each rule ID to ${SITE}/methodology/rules/<RULE-ID>.
3. **Areas.** Each category's score as a bar or row, so the weak areas stand out; let the reader open an area to see its findings.
4. **The answer to the question asked,** when it was specific: the findings for that URL, the AI crawler matrix as a table of crawler by outcome, or the feature eligibility.
5. **What changed,** after a \`diff\`: resolved, new and changed findings side by side, with both snapshot IDs and scores.
6. **What the scan could not decide.** The manual checks and not-evaluated rules, each with the reason the report gives.

Put every number and sentence on the canvas from the report, unchanged. When the user asks for a fix, make the change in their project, scan the deployed result again, and update the canvas with the \`diff\`.

## Reference

### Commands

| Command | What it does |
| --- | --- |
${commands}

### Options

| Option | Commands | What it does |
| --- | --- | --- |
${options}

### Output files

| File | Contents |
| --- | --- |
${outputs}
`;
}
