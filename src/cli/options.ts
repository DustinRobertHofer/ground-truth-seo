/**
 * The command line's commands, options, environment variables and output files,
 * as data. `--help` is printed from it, and the website's command-line page
 * renders it, so the two cannot drift from what the command line accepts.
 *
 * Safe to import from browser code: it holds strings only.
 */

export type CliCommandName = "scan" | "evaluate" | "review" | "diff";

export interface CliCommand {
  name: CliCommandName;
  /** The arguments, as printed after the command name. */
  args: string;
  /** One line for --help. */
  summary: string;
  /** A fuller description for documentation. */
  description: string;
  /** Output files the command writes, by name (see CLI_OUTPUTS). */
  writes: readonly string[];
}

export interface CliOption {
  flag: `--${string}`;
  /** The value placeholder, or null for a switch. */
  value: string | null;
  commands: readonly CliCommandName[];
  /** One line for --help. */
  help: string;
  /** A fuller description for documentation. */
  description: string;
  /** The environment variable the option needs, if any. */
  needs?: string;
}

export interface CliEnvVar {
  name: string;
  description: string;
  /** Holds a credential: never printed or written, and redacted from output. */
  secret: boolean;
}

export interface CliOutput {
  file: string;
  description: string;
}

export const CLI_BIN = "ground-truth-seo";

export const CLI_COMMANDS: readonly CliCommand[] = [
  {
    name: "scan",
    args: "<url>",
    summary: "Crawl a site, then write report.json, report.md and snapshot.json",
    description:
      "Fetches the site (robots.txt, sitemaps, a link crawl, host and scheme variants, a 404 probe, icons, images, llms.txt), freezes everything it fetched into a snapshot, evaluates it, and writes the report and the snapshot. It prints the score with its arithmetic, the headline and the snapshot ID.",
    writes: ["report.json", "report.md", "snapshot.json"],
  },
  {
    name: "evaluate",
    args: "<snapshot.json>",
    summary: "Evaluate a stored snapshot again and write report.json and report.md",
    description:
      "Evaluates a stored snapshot without touching the network. With the same configuration flags as the scan, the new report.json is byte-identical to the scan's; with different flags, for example another --engines value, the same snapshot is judged under the new configuration.",
    writes: ["report.json", "report.md"],
  },
  {
    name: "review",
    args: "<snapshot.json>",
    summary: "Run the advisory AI review of a stored snapshot (review.json, review.md)",
    description:
      "Runs the advisory content and AI-answer review on a stored snapshot. It suggests titles, meta descriptions and main headings, lists the searches each page should answer and the questions it leaves open, drafts FAQ entries and checks llms.txt. It never changes the score or report.json.",
    writes: ["review.json", "review.md"],
  },
  {
    name: "diff",
    args: "<before/report.json> <after/report.json>",
    summary: "Compare two report.json files; prints canonical JSON",
    description:
      "Compares two reports and prints, as canonical JSON, both snapshot IDs and scores, the new, resolved and changed findings keyed by rule, condition and URL, and whether the favicon changed.",
    writes: [],
  },
];

export const CLI_OPTIONS: readonly CliOption[] = [
  {
    flag: "--out",
    value: "<dir>",
    commands: ["scan", "evaluate", "review"],
    help: "Output directory (scan: scan-<host>, evaluate: ., review: beside the snapshot)",
    description: "Where to write the files. Defaults: scan-<host> for scan, the current directory for evaluate, the snapshot's directory for review.",
  },
  {
    flag: "--max-pages",
    value: "<n>",
    commands: ["scan", "evaluate"],
    help: "Page budget: link crawl plus sitemap-only pages (default 500)",
    description: "How many pages to fetch: the link crawl plus pages found only in sitemaps (default 500).",
  },
  { flag: "--max-depth", value: "<n>", commands: ["scan", "evaluate"], help: "Link depth (default 20)", description: "How many links deep the crawl goes from the home page (default 20)." },
  {
    flag: "--max-extra-fetches",
    value: "<n>",
    commands: ["scan", "evaluate"],
    help: "Canonical, alternate and redirect targets (default 500)",
    description: "Budget for extra fetches: canonical targets, alternates and redirect targets (default 500).",
  },
  {
    flag: "--engines",
    value: "<list>",
    commands: ["scan", "evaluate"],
    help: "Comma-separated: google,bing (default both)",
    description: "The search engines to audit for, comma-separated: google, bing (default both). Rules documented only by an engine you leave out become not applicable.",
  },
  {
    flag: "--include",
    value: "<patterns>",
    commands: ["scan", "evaluate"],
    help: "Comma-separated path globs that shape the intended pages",
    description: "Comma-separated path glob patterns that shape the set of pages you intend to be indexed.",
  },
  { flag: "--exclude", value: "<patterns>", commands: ["scan", "evaluate"], help: "Comma-separated path globs to leave out", description: "Comma-separated path glob patterns to leave out of that set." },
  {
    flag: "--additional-origins",
    value: "<list>",
    commands: ["scan", "evaluate"],
    help: "Extra origins treated as in scope",
    description: "Comma-separated extra origins that belong to the site and are treated as in scope.",
  },
  {
    flag: "--staging-hosts",
    value: "<list>",
    commands: ["scan", "evaluate"],
    help: "Staging hosts (enables SEO-ROBOTS-09)",
    description: "Comma-separated staging hosts, which should require authentication. Enables SEO-ROBOTS-09.",
  },
  { flag: "--indexnow-key", value: "<key>", commands: ["scan", "evaluate"], help: "Your IndexNow key (enables SEO-SITEMAP-06)", description: "Your IndexNow key, so its key file is checked. Enables SEO-SITEMAP-06." },
  {
    flag: "--house-conventions",
    value: null,
    commands: ["scan", "evaluate"],
    help: "Enable the zero-weight house-convention rules",
    description: "Also reports the house-convention (-HC) rules. They carry zero weight, so the score does not move.",
  },
  {
    flag: "--third-party-resources",
    value: null,
    commands: ["scan", "evaluate"],
    help: "Extend SEO-ROBOTS-05B to other origins",
    description: "Extends SEO-ROBOTS-05B (resources needed for rendering are crawlable) to resources served from other origins.",
  },
  {
    flag: "--crux",
    value: null,
    commands: ["scan"],
    help: "Ask the Chrome UX Report for field data (needs CRUX_API_KEY)",
    description:
      "Asks the Chrome UX Report API for field data for the origin and the home page, on phones and desktops, which SEO-PERF-01 judges against Google's thresholds. The key never enters the snapshot or the report.",
    needs: "CRUX_API_KEY",
  },
  {
    flag: "--review",
    value: null,
    commands: ["scan"],
    help: "Run the advisory AI review after the scan (needs AI_GATEWAY_API_KEY)",
    description: "Runs the advisory AI review right after the scan and writes review.json and review.md beside the report.",
    needs: "AI_GATEWAY_API_KEY",
  },
  { flag: "--review-pages", value: "<n>", commands: ["scan", "review"], help: "Pages to review (default 6, at most 20)", description: "How many pages the review reads (default 6, at most 20)." },
  { flag: "--queries", value: '"<a;b>"', commands: ["scan", "review"], help: "Searches the pages should answer, separated by ;", description: "Searches the pages should answer, separated by semicolons." },
  { flag: "--queries-file", value: "<file>", commands: ["scan", "review"], help: "The same, one per line", description: "The same, read from a file with one search per line." },
];

export const CLI_ENV: readonly CliEnvVar[] = [
  { name: "CRUX_API_KEY", description: "A Chrome UX Report API key, required by --crux.", secret: true },
  {
    name: "AI_GATEWAY_API_KEY",
    description: "A Vercel AI Gateway API key, required by --review and the review command. It works on any machine; no Vercel project is needed.",
    secret: true,
  },
  { name: "AI_REVIEW_MODEL", description: "The Gateway model ID the review uses (default anthropic/claude-sonnet-5.5).", secret: false },
  { name: "AI_REVIEW_DISABLED", description: "Set to 1 to turn the review off.", secret: false },
];

export const CLI_OUTPUTS: readonly CliOutput[] = [
  {
    file: "report.json",
    description:
      "The report as RFC 8785 canonical JSON: scanner and ruleset versions, snapshot ID, configuration and its hash, the score with its arithmetic, every finding with what was observed, the reason, the fix and the source quoted word for word, and the recommendations.",
  },
  { file: "report.md", description: "A readable report rendered from report.json." },
  {
    file: "snapshot.json",
    description: "Everything the scan fetched: requests, responses, content-addressed bodies, DNS and TLS records and the one clock reading. Its ID is the SHA-256 of its canonical manifest.",
  },
  { file: "review.json", description: "The advisory review (with --review or review). Never part of the report or the score." },
  { file: "review.md", description: "A readable view of the review." },
];

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text + " ".repeat(width - text.length);
}

/** The --help text. */
export function usageText(): string {
  const command = (c: CliCommand) => `  ${pad(`${c.name} ${c.args}`, 28)}${c.summary}`;
  const option = (o: CliOption) => `  ${pad(o.value ? `${o.flag} ${o.value}` : o.flag, 28)}${o.help}`;
  const config = CLI_OPTIONS.filter((o) => o.commands.includes("evaluate") || (o.commands.includes("scan") && !o.commands.includes("review") && o.flag !== "--review"));
  const review = CLI_OPTIONS.filter((o) => !config.includes(o));
  return [
    `Usage: ${CLI_BIN} <command> [options]`,
    "",
    "Commands:",
    ...CLI_COMMANDS.map(command),
    "",
    "Options (scan and evaluate; evaluate needs the same configuration flags as the scan to reproduce its report):",
    ...config.map(option),
    "",
    "Review options (scan --review, and review):",
    ...review.map(option),
    "",
    `  ${pad("--help", 28)}Show this help`,
    `  ${pad("--version", 28)}Show the package, scanner and ruleset versions`,
    "",
    "Environment:",
    ...CLI_ENV.map((e) => `  ${pad(e.name, 28)}${e.description}`),
    "",
  ].join("\n");
}
