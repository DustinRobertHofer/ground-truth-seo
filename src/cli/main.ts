/**
 * The command line: scan a site, evaluate a stored snapshot, review its content,
 * or diff two reports.
 *
 *   ground-truth-seo scan <url> [--max-pages 50] [--out dir] [--review] [--crux]
 *   ground-truth-seo evaluate <snapshot.json> [--out dir] [--engines google]
 *   ground-truth-seo review <snapshot.json> [--review-pages 6] [--queries "a;b"] [--queries-file f]
 *   ground-truth-seo diff <before/report.json> <after/report.json>
 *   ground-truth-seo skill [--out .claude/skills/ground-truth-seo]
 *
 * Configuration comes from flags and plain environment variables only:
 * CRUX_API_KEY for --crux, AI_GATEWAY_API_KEY and AI_REVIEW_MODEL for --review,
 * and AI_REVIEW_DISABLED=1 to turn the review off. No .env file is read. Keys
 * never enter a snapshot, a report or anything this command prints.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractContent } from "../content-review/extract.js";
import { renderReviewMarkdown } from "../content-review/markdown.js";
import { aiReviewConfigured, reviewContent } from "../content-review/review.js";
import { cruxApiKey, cruxApiProvider, evaluateSnapshot, scan, type ScanConfigInput, type ScanResult } from "../scanner/index.js";
import { resolveConfig, type ScanConfig } from "../scanner/config.js";
import { SCANNER_VERSION } from "../scanner/evaluate/index.js";
import { diffReports } from "../scanner/report/diff.js";
import { renderMarkdown } from "../scanner/report/markdown.js";
import type { Report } from "../scanner/report/types.js";
import { KNOWLEDGE_CUTOFF, RULESET_VERSION } from "../scanner/rules/index.js";
import { canonicalize } from "../scanner/snapshot/canonical-json.js";
import type { Snapshot } from "../scanner/snapshot/types.js";
import { SKILL_DEFAULT_DIR, SKILL_FILE, skillMarkdown } from "../skill/skill.js";
import { usageText } from "./options.js";

/** Environment variables whose values must never be printed or written. */
export const SECRET_ENV = ["CRUX_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"] as const;

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export class UsageError extends Error {}

export const USAGE = usageText();

export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i += 1;
      } else flags[name] = true;
    } else positional.push(arg);
  }
  return { positional, flags };
}

export function configFromFlags(startUrl: string, flags: Record<string, string | true>): ScanConfigInput {
  const str = (name: string) => (typeof flags[name] === "string" ? (flags[name] as string) : undefined);
  const num = (name: string) => (str(name) !== undefined ? Number(str(name)) : undefined);
  const list = (name: string) => str(name)?.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    start_url: startUrl,
    engines: list("engines") as ScanConfigInput["engines"],
    max_pages: num("max-pages"),
    max_depth: num("max-depth"),
    max_extra_fetches: num("max-extra-fetches"),
    include: list("include"),
    exclude: list("exclude"),
    additional_origins: list("additional-origins"),
    staging_hosts: list("staging-hosts"),
    indexnow_key: str("indexnow-key") ?? null,
    house_conventions: flags["house-conventions"] === true,
    check_third_party_resources: flags["third-party-resources"] === true,
    crux: flags.crux === true,
  };
}

/** Replaces every configured secret value in `text`; a key that leaks into an error message stays out of the output. */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of SECRET_ENV) {
    const value = env[name]?.trim();
    if (value && value.length >= 4) out = out.split(value).join(`[${name}]`);
  }
  return out;
}

function write(dir: string, report: Report, reportJson: string, snapshot?: Snapshot): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "report.json"), `${reportJson}\n`);
  writeFileSync(join(dir, "report.md"), renderMarkdown(report));
  if (snapshot) writeFileSync(join(dir, "snapshot.json"), canonicalize(snapshot));
}

function queriesFromFlags(flags: Record<string, string | true>): string[] {
  const inline = typeof flags.queries === "string" ? flags.queries.split(";") : [];
  const file = typeof flags["queries-file"] === "string" ? readFileSync(flags["queries-file"], "utf8").split(/\r?\n/) : [];
  return [...inline, ...file];
}

/** Throws a clear message when the review cannot run, before any time is spent scanning. */
export function assertReviewAvailable(): void {
  if (process.env.AI_REVIEW_DISABLED === "1") throw new UsageError("The AI review is turned off (AI_REVIEW_DISABLED=1). Unset it to use --review.");
  if (!aiReviewConfigured()) {
    throw new UsageError(
      "The AI review needs a Vercel AI Gateway API key. Set AI_GATEWAY_API_KEY in the environment (and optionally AI_REVIEW_MODEL), or run without --review.",
    );
  }
}

/** PRODUCT.md §17: the advisory review, written beside the report and never into it. */
async function writeReview(dir: string, snapshot: Snapshot, config: ScanConfig, flags: Record<string, string | true>, io: CliIo): Promise<void> {
  assertReviewAvailable();
  const pages = typeof flags["review-pages"] === "string" ? Number(flags["review-pages"]) : undefined;
  const content = extractContent(snapshot, config, { pages });
  const review = await reviewContent(content, {
    queries: queriesFromFlags(flags),
    deadline: Date.now() + 600_000,
    onProgress: (m) => io.stderr(`${m}\n`),
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "review.json"), redactSecrets(`${JSON.stringify(review, null, 2)}\n`));
  writeFileSync(join(dir, "review.md"), redactSecrets(renderReviewMarkdown(review)));
  const reviewed = review.pages.filter((p) => p.status === "reviewed").length;
  io.stdout(`AI review of ${reviewed} of ${review.pages.length} pages written to ${dir}/review.md (${review.usage.inputTokens} input and ${review.usage.outputTokens} output tokens)\n`);
}

export interface RunHooks {
  /** Called after a scan's files are written; the website uses it to record research observations. */
  afterScan?: (result: ScanResult) => Promise<void>;
  /** The package version printed by --version. */
  version?: string;
}

export async function run(argv: string[], io: CliIo, hooks: RunHooks = {}): Promise<void> {
  const [command, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  if (command === undefined || command === "help" || command === "--help" || command === "-h" || flags.help === true) {
    io.stdout(USAGE);
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    io.stdout(`ground-truth-seo ${hooks.version ?? "unknown"} (scanner ${SCANNER_VERSION}, ruleset ${RULESET_VERSION}, knowledge cutoff ${KNOWLEDGE_CUTOFF})\n`);
    return;
  }
  if (command === "scan") {
    const url = positional[0];
    if (!url) throw new UsageError("usage: scan <url> [--max-pages N] [--out dir] [--review] [--crux]");
    const config = configFromFlags(url, flags);
    const cruxKey = cruxApiKey();
    if (config.crux && !cruxKey) throw new UsageError("--crux needs CRUX_API_KEY in the environment");
    if (flags.review === true) assertReviewAvailable();
    const result = await scan(config, { onProgress: (m) => io.stderr(`${m}\n`), crux: config.crux && cruxKey ? cruxApiProvider(cruxKey) : undefined });
    const dir = typeof flags.out === "string" ? flags.out : `scan-${new URL(result.config.start_url).hostname}`;
    write(dir, result.report, result.reportJson, result.snapshot);
    io.stdout(`${result.report.headline.arithmetic}\n${result.report.headline.summary}\nWritten to ${dir}/ (snapshot ${result.snapshot.snapshot_id})\n`);
    if (hooks.afterScan) await hooks.afterScan(result);
    if (flags.review === true) await writeReview(dir, result.snapshot, result.config, flags, io);
    return;
  }
  if (command === "review") {
    const file = positional[0];
    if (!file) throw new UsageError('usage: review <snapshot.json> [--review-pages N] [--queries "a;b"] [--queries-file f] [--out dir]');
    assertReviewAvailable();
    const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
    const config = resolveConfig(configFromFlags(snapshot.start_url, flags));
    await writeReview(typeof flags.out === "string" ? flags.out : dirname(file), snapshot, config, flags, io);
    return;
  }
  if (command === "evaluate") {
    const file = positional[0];
    if (!file) throw new UsageError("usage: evaluate <snapshot.json> [--out dir]");
    const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
    const { report, reportJson } = evaluateSnapshot(snapshot, configFromFlags(snapshot.start_url, flags));
    const dir = typeof flags.out === "string" ? flags.out : ".";
    write(dir, report, reportJson);
    io.stdout(`${report.headline.arithmetic}\n`);
    return;
  }
  if (command === "diff") {
    const [a, b] = positional;
    if (!a || !b) throw new UsageError("usage: diff <before/report.json> <after/report.json>");
    const diff = diffReports(JSON.parse(readFileSync(a, "utf8")) as Report, JSON.parse(readFileSync(b, "utf8")) as Report);
    io.stdout(`${canonicalize(diff)}\n`);
    return;
  }
  if (command === "skill") {
    const dir = typeof flags.out === "string" ? flags.out : SKILL_DEFAULT_DIR;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, SKILL_FILE), skillMarkdown());
    io.stdout(`Agent skill written to ${join(dir, SKILL_FILE)}\n`);
    return;
  }
  throw new UsageError("commands: scan <url>, evaluate <snapshot.json>, review <snapshot.json>, diff <a.json> <b.json>, skill (--help for options)");
}

/** Runs the command line against process.argv and exits with 1 on failure, printing only the (redacted) message. */
export function main(hooks: RunHooks = {}): void {
  const io: CliIo = {
    stdout: (text) => process.stdout.write(redactSecrets(text)),
    stderr: (text) => process.stderr.write(redactSecrets(text)),
  };
  run(process.argv.slice(2), io, hooks).catch((error: unknown) => {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
