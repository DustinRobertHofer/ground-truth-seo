/**
 * Builds a security check's result from a snapshot (PRODUCT.md §20.2). A pure
 * function of (snapshot, config, search terms), like an evaluation: no network,
 * clock, randomness or model calls. Bodies are read here and nowhere else, and
 * only positions and the redacted facts of KNOWLEDGE.md §12.2 leave this module.
 */

import { reachOf } from "../checkers/run.js";
import type { CheckCitation } from "../checkers/types.js";
import type { ScanConfig } from "../scanner/config.js";
import { EvaluationContext } from "../scanner/evaluate/context.js";
import { compareBytes, formatInt, sortBytes } from "../scanner/evaluate/core/text.js";
import { fillTemplate } from "../scanner/evaluate/findings.js";
import type { Observed } from "../scanner/report/types.js";
import { SOURCES_BY_ID } from "../scanner/rules/index.js";
import { header, isHtmlMediaType, outcomeLabel } from "../scanner/snapshot/access.js";
import type { Exchange, Snapshot } from "../scanner/snapshot/types.js";
import { scriptsToRead } from "./acquire.js";
import {
  decodeUtf8,
  findAccessCodes,
  findGithubTokens,
  findNamedSecrets,
  findPasswordHashes,
  findPrivateKeys,
  findTerm,
  findUrlPasswords,
  isGitConfig,
  isGitHead,
  isHtmlBody,
  isSameSite,
  LineIndex,
  literalPattern,
  parseEnvFile,
  parseGitCredentials,
  parseHtpasswd,
  parseNpmrc,
  parseSourceMap,
  propertyKindAfter,
  siteBaseOf,
  sourceMapRef,
  type MapRef,
  type ParsedSourceMap,
} from "./detect.js";
import {
  citationsFor,
  DETECTION_LIMITS,
  EXPOSES_ORDER,
  EXPOSURE_CHECKS_VERSION,
  PROBES,
  SEARCH_LIMITS,
  SECURITY_CHECKS,
  securityCheck,
  securityCondition,
  securityStatement,
  valueKindText,
  type Exposes,
  type Probe,
} from "./knowledge.js";
import type { FileRow, ScriptRow, SearchOccurrence, SecurityCheckRow, SecurityFinding, SecurityIssue, SecurityResult, SecuritySearch } from "./types.js";

/** Findings listed per issue; the count is always complete. */
export const MAX_FINDINGS_PER_ISSUE = 50;

/** Text the SEC-SECRET checks search, and where it came from. */
interface ServedText {
  url: string;
  /** The source file inside a source map. */
  source: string | null;
  text: string;
}

/** A finding before it is grouped, with the observed fields its template needs. */
interface Draft {
  check_id: string;
  condition: string;
  url: string;
  source: string | null;
  line: number | null;
  column: number | null;
  label: string;
  names: string[];
  namesTotal: number;
  observed: Observed;
}

/** §12.3 Lists: the first ten members, then " and <n> more" counting everything not shown. */
export function formatList(shown: readonly string[], total = shown.length): string {
  const head = shown.slice(0, DETECTION_LIMITS.listShown);
  const rest = total - head.length;
  return rest > 0 ? `${head.join(", ")} and ${formatInt(rest)} more` : head.join(", ");
}

function citationOut(c: { source_id: string; section: string; quote: string }): CheckCitation {
  const source = SOURCES_BY_ID.get(c.source_id);
  return { source_id: c.source_id, section: c.section, quote: c.quote, title: source?.title ?? c.source_id, url: source?.url ?? null, last_updated: source?.last_updated ?? "not stated" };
}

function bodyText(ctx: EvaluationContext, exchange: Exchange): string {
  return decodeUtf8(ctx.body(exchange) ?? new Uint8Array(0));
}

/** Why an exchange could not be read, as §12.5 states it, or null when it answered. */
function notCheckedNote(url: string, exchange: Exchange | null): string | null {
  // Nothing recorded: the request was skipped because the read budget was spent (lib/security/acquire.ts).
  if (exchange === null) return fillTemplate(securityStatement("not_checked_budget"), { url });
  if (exchange.outcome === "blocked_by_robots_policy") return fillTemplate(securityStatement("not_checked_robots"), { url });
  if (exchange.outcome !== "response") return fillTemplate(securityStatement("not_checked_failed"), { url, outcome: outcomeLabel(exchange) });
  return null;
}

// ------------------------------------------------------------------ pages

/** Final URLs of the crawled pages that answered 200 HTML on the site itself, in byte order. */
function loadedPages(ctx: EvaluationContext): string[] {
  const base = siteBaseOf(ctx.preferredOrigin);
  const out = new Set<string>();
  for (const entry of ctx.snapshot.crawl) {
    const chain = ctx.chain(entry.url);
    const final = chain.final;
    if (isSameSite(chain.finalUrl, base) && final && final.outcome === "response" && final.status === 200 && isHtmlMediaType(header(final, "content-type")) && ctx.page(chain.finalUrl)) out.add(chain.finalUrl);
  }
  return sortBytes(out);
}

// ------------------------------------------------------------------ files

function probeFinding(probe: Probe, url: string, text: string): Draft | null {
  const base = { check_id: probe.check, condition: probe.condition, url, source: null, line: null, column: null, names: [] as string[], namesTotal: 0 };
  switch (probe.condition) {
    case "head":
      return isGitHead(text) ? { ...base, label: "Git HEAD file", observed: { url } } : null;
    case "config":
      return isGitConfig(text) ? { ...base, label: "Git configuration file", observed: { url } } : null;
    case "served": {
      const env = parseEnvFile(text);
      if (!env) return null;
      const names = env.names.slice(0, DETECTION_LIMITS.envNamesListed);
      return { ...base, label: `Environment file, ${formatInt(env.count)} variables`, names, namesTotal: env.count, observed: { url, count: env.count, names: formatList(env.names, env.count) } };
    }
    case "git_credentials": {
      const file = parseGitCredentials(text);
      return file ? { ...base, label: `Git credential store, ${formatInt(file.count)} saved`, names: file.hosts, namesTotal: file.hosts.length, observed: { url, count: file.count, hosts: file.hosts.join(", ") } } : null;
    }
    case "npmrc": {
      const file = parseNpmrc(text);
      return file ? { ...base, label: `npm registry credentials, ${formatInt(file.count)}`, names: file.hosts, namesTotal: file.hosts.length, observed: { url, count: file.count, hosts: file.hosts.join(", ") } } : null;
    }
    case "htpasswd": {
      const file = parseHtpasswd(text);
      return file ? { ...base, label: `Password file, ${formatInt(file.count)} entries`, observed: { url, count: file.count } } : null;
    }
  }
  return null;
}

function readFiles(ctx: EvaluationContext, drafts: Draft[], served: ServedText[]): FileRow[] {
  return PROBES.map((probe): FileRow => {
    const url = `${ctx.preferredOrigin}${probe.path}`;
    const exchange = ctx.primaryExchange(url);
    const row: FileRow = { url, path: probe.path, check_id: probe.check, outcome: outcomeLabel(exchange), verdict: "not_served", html: false, note: null };
    const note = notCheckedNote(url, exchange);
    if (note !== null) return { ...row, verdict: "not_checked", note };
    if (exchange!.status !== 200) return row;
    const text = bodyText(ctx, exchange!);
    if (isHtmlBody(header(exchange, "content-type"), text)) return { ...row, html: true };
    const finding = probeFinding(probe, url, text);
    if (finding === null) {
      return exchange!.truncated ? { ...row, verdict: "not_checked", note: fillTemplate(securityStatement("not_checked_truncated"), { url }) } : row;
    }
    drafts.push(finding);
    if (probe.condition === "config") served.push({ url, source: null, text });
    return { ...row, verdict: "found" };
  });
}

// ---------------------------------------------------------------- scripts

const VIA_CLAUSE = {
  header: " at {map}, named by its sourcemap header,",
  comment: " at {map}, named by its sourceMappingURL comment,",
  convention: " at {map}, found by adding .map to its URL,",
  data: ", embedded in it as a data: URL,",
} as const;

function mapFinding(script: string, mapUrl: string | null, ref: MapRef, map: ParsedSourceMap): Draft {
  const content = map.contents.filter((c) => c !== null).length;
  const condition = content > 0 ? "sources_content" : "paths_only";
  const viaClause = VIA_CLAUSE[ref.via].replace("{map}", mapUrl ?? "");
  const paths = map.sources.slice(0, DETECTION_LIMITS.listShown);
  return {
    check_id: "SEC-MAP-01",
    condition,
    url: mapUrl ?? script,
    source: null,
    line: null,
    column: null,
    label: content > 0 ? `Source map with the original text of ${formatInt(content)} files` : `Source map naming ${formatInt(map.sources.length)} files`,
    names: paths,
    namesTotal: map.sources.length,
    observed: { script, via_clause: viaClause, sources: map.sources.length, content, paths: formatList(map.sources) },
  };
}

function readScripts(ctx: EvaluationContext, pages: string[], drafts: Draft[], served: ServedText[]): ScriptRow[] {
  const base = siteBaseOf(ctx.preferredOrigin);
  const parsedPages = pages.map((url) => [url, ctx.page(url)!.parsed] as const);
  return scriptsToRead(parsedPages, ctx.preferredOrigin).map((url): ScriptRow => {
    const chain = ctx.chain(url);
    const final = chain.final;
    const last = final ?? chain.exchanges[chain.exchanges.length - 1] ?? null;
    const row: ScriptRow = { url, outcome: last ? outcomeLabel(last) : "not requested", bytes: final?.size_uncompressed ?? 0, truncated: final?.truncated ?? false, map: null };
    if (!final || final.outcome !== "response" || final.status !== 200) return row;
    const text = bodyText(ctx, final);
    served.push({ url: chain.finalUrl, source: null, text });
    const ref = sourceMapRef(chain.finalUrl, { sourcemap: header(final, "sourcemap"), xSourcemap: header(final, "x-sourcemap") }, text);
    if (ref === null) return row;
    if (ref.via === "data") {
      const map = ref.text === null ? null : parseSourceMap(ref.text);
      if (map === null) return { ...row, map: { url: null, via: "data", outcome: null, verdict: "not_a_map", sources: 0, note: null } };
      return { ...row, map: readMap(drafts, served, url, chain.finalUrl, null, ref, map) };
    }
    if (!isSameSite(ref.url, base)) return { ...row, map: { url: ref.url, via: ref.via, outcome: null, verdict: "other_site", sources: 0, note: null } };
    const mapChain = ctx.chain(ref.url);
    const mapFinal = mapChain.final;
    const mapLast = mapFinal ?? mapChain.exchanges[mapChain.exchanges.length - 1] ?? null;
    const note = notCheckedNote(ref.url, mapLast);
    const entry = { url: ref.url, via: ref.via, outcome: mapLast ? outcomeLabel(mapLast) : null, sources: 0, note: null };
    if (note !== null) return { ...row, map: { ...entry, verdict: "not_checked", note } };
    if (!mapFinal || mapFinal.status !== 200) return { ...row, map: { ...entry, verdict: "not_found" } };
    const map = parseSourceMap(bodyText(ctx, mapFinal));
    if (map === null) {
      return mapFinal.truncated
        ? { ...row, map: { ...entry, verdict: "not_checked", note: fillTemplate(securityStatement("not_checked_truncated"), { url: ref.url }) } }
        : { ...row, map: { ...entry, verdict: "not_a_map" } };
    }
    return { ...row, map: { ...readMap(drafts, served, url, mapChain.finalUrl, ref.url, ref, map), outcome: entry.outcome } };
  });
}

function readMap(drafts: Draft[], served: ServedText[], script: string, servedAt: string, mapUrl: string | null, ref: MapRef, map: ParsedSourceMap): NonNullable<ScriptRow["map"]> {
  const finding = mapFinding(script, mapUrl, ref, map);
  drafts.push(finding);
  // Scripts can share one map; its original source is searched once.
  if (!served.some((item) => item.url === servedAt && item.source !== null)) {
    map.contents.forEach((content, i) => {
      if (content !== null) served.push({ url: servedAt, source: map.sources[i] || `source ${i + 1}`, text: content });
    });
  }
  return { url: mapUrl, via: ref.via, outcome: null, verdict: finding.condition as "sources_content" | "paths_only", sources: map.sources.length, note: null };
}

// ---------------------------------------------------------------- secrets

/**
 * Searches served text; adds each matched value to `matched`, which only the
 * final scrub reads, and each access code to `codes`, which only the search
 * terms are scrubbed of (§12.2 rule 6).
 */
function searchSecrets(served: ServedText[], drafts: Draft[], matched: Set<string>, codes: Set<string>): void {
  for (const item of served) {
    const tokens = findGithubTokens(item.text);
    const keys = findPrivateKeys(item.text);
    const urls = findUrlPasswords(item.text);
    const named = findNamedSecrets(item.text, new Set(tokens.map((t) => t.index)));
    const accessCodes = findAccessCodes(item.text, new Set([...tokens.map((t) => t.index), ...named.map((n) => n.index)]));
    const hashes = findPasswordHashes(item.text);
    if (tokens.length + keys.length + urls.length + named.length + accessCodes.length + hashes.length === 0) continue;
    for (const t of tokens) matched.add(item.text.slice(t.index, t.end));
    for (const u of urls) matched.add(item.text.slice(u.passwordStart, u.passwordEnd));
    for (const n of named) matched.add(item.text.slice(n.index, n.end));
    // Access codes are scrubbed from search terms only (§12.2 rule 6): a short code can match a date or an ID by chance, and redacting it there would reveal it.
    for (const c of accessCodes) codes.add(item.text.slice(c.index, c.end));
    for (const h of hashes) matched.add(item.text.slice(h.index, h.end));
    const lines = new LineIndex(item.text);
    const at = (index: number) => {
      const { line, column } = lines.position(index);
      const where = `line ${formatInt(line)}, column ${formatInt(column)}`;
      const location = item.source === null ? `${item.url}, ${where}` : `${item.source} in the source map ${item.url}, ${where}`;
      return { url: item.url, source: item.source, line, column, names: [] as string[], namesTotal: 0, location };
    };
    for (const t of tokens) {
      const { location, ...where } = at(t.index);
      drafts.push({ check_id: "SEC-SECRET-01", condition: "github_token", ...where, label: `GitHub ${t.type}`, observed: { location, type: t.type, prefix: t.prefix } });
    }
    for (const k of keys) {
      const { location, ...where } = at(k.index);
      drafts.push({ check_id: "SEC-SECRET-02", condition: "private_key", ...where, label: `PEM ${k.label}`, observed: { location, label: k.label } });
    }
    for (const u of urls) {
      const { location, ...where } = at(u.index);
      drafts.push({ check_id: "SEC-SECRET-03", condition: "url_password", ...where, label: `${u.scheme} URL with a password for ${u.host}`, observed: { location, scheme: u.scheme, host: u.host } });
    }
    for (const n of named) {
      const { location, ...where } = at(n.index);
      drafts.push({ check_id: "SEC-SECRET-04", condition: "named_value", ...where, label: `Value assigned to ${n.name}`, observed: { location, name: n.name } });
    }
    for (const c of accessCodes) {
      const { location, ...where } = at(c.index);
      drafts.push({ check_id: "SEC-DATA-01", condition: "access_code", ...where, label: `Access code assigned to ${c.name}`, observed: { location, name: c.name } });
    }
    for (const h of hashes) {
      const { location, ...where } = at(h.index);
      drafts.push({ check_id: "SEC-DATA-02", condition: "password_hash", ...where, label: `Password hash assigned to ${h.name}`, observed: { location, name: h.name, prefix: h.prefix } });
    }
  }
}

// ----------------------------------------------------------------- search

/** §12.2 rule 6: each access code in a search term, compared without case, becomes [redacted]. */
function redactCodes(term: string, codes: ReadonlySet<string>): string {
  const longestFirst = [...codes].sort((a, b) => b.length - a.length || compareBytes(a, b));
  return longestFirst.reduce((text, code) => text.replace(literalPattern(code), "[redacted]"), term);
}

/**
 * KNOWLEDGE.md §12.7: where each term appears in the served text, in
 * location order, with the kind of value when a term ends a property name.
 * Positions and kinds only: no text around an occurrence leaves this function.
 */
function searchServed(served: ServedText[], terms: readonly string[], notes: string[], codes: ReadonlySet<string>): SecuritySearch {
  // Location order: by URL and source file, then position, as findings are sorted.
  const order = served.map((_, i) => i).sort((a, b) => compareBytes(served[a]!.url, served[b]!.url) || compareBytes(served[a]!.source ?? "", served[b]!.source ?? "") || a - b);
  const results = terms.map((term) => {
    let count = 0;
    const occurrences: SearchOccurrence[] = [];
    for (const i of order) {
      const item = served[i]!;
      const found = findTerm(item.text, term, SEARCH_LIMITS.listed - occurrences.length);
      count += found.count;
      if (found.first.length === 0) continue;
      const lines = new LineIndex(item.text);
      for (const o of found.first) {
        const kind = propertyKindAfter(item.text, o.end);
        occurrences.push({
          url: item.url,
          source: item.source,
          ...lines.position(o.index),
          property: kind === null ? null : fillTemplate(securityStatement("search_property"), { kind: valueKindText(kind) }),
        });
      }
    }
    return { term: redactCodes(term, codes), count, occurrences };
  });
  return { terms: results, notes, scope: securityStatement("search_scope"), none: securityStatement("search_none") };
}

// ----------------------------------------------------------------- result

function compareFindings(a: SecurityFinding, b: SecurityFinding): number {
  return compareBytes(a.url, b.url) || compareBytes(a.source ?? "", b.source ?? "") || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0);
}

function finalize(draft: Draft): SecurityFinding {
  const condition = securityCondition(draft.check_id, draft.condition);
  return {
    check_id: draft.check_id,
    condition: draft.condition,
    exposes: condition.exposes,
    url: draft.url,
    source: draft.source,
    line: draft.line,
    column: draft.column,
    label: draft.label,
    names: draft.names,
    namesTotal: draft.namesTotal,
    reason: fillTemplate(condition.reason, draft.observed),
  };
}

function issuesOf(findings: SecurityFinding[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  for (const check of SECURITY_CHECKS) {
    for (const condition of check.conditions) {
      const own = findings.filter((f) => f.check_id === check.id && f.condition === condition.code).sort(compareFindings);
      if (own.length === 0) continue;
      issues.push({
        check_id: check.id,
        check_title: check.title,
        condition: condition.code,
        exposes: condition.exposes,
        fix: check.fix,
        citations: citationsFor(check.id, condition.code).map(citationOut),
        findings: own.slice(0, MAX_FINDINGS_PER_ISSUE),
        count: own.length,
      });
    }
  }
  const rank = (e: Exposes) => EXPOSES_ORDER.indexOf(e);
  // Stable: within one exposure, checks keep their §12.4 order.
  return issues.sort((a, b) => rank(a.exposes) - rank(b.exposes));
}

/**
 * Found when anything matched; otherwise clear only when every input the check
 * needed was read in full (PRODUCT.md §20.2). `unread` names the inputs it
 * could not read; `info` notes do not make a check incomplete.
 */
function checkRow(id: string, found: number, unread: string[], info: string[] = []): SecurityCheckRow {
  const check = securityCheck(id);
  const status = found > 0 ? "found" : unread.length > 0 ? "not_checked" : "clear";
  return { id, title: check.title, exposesText: check.exposesText, status, found, notes: [...new Set([...unread, ...info])] };
}

/**
 * §12.2 rule 6: every matched value of DETECTION_LIMITS.scrubMin characters or
 * more is replaced wherever it appears in the result, longest first, so a
 * secret that also sits in a URL or path never reaches the browser.
 */
export function scrubResult<T>(value: T, matched: Iterable<string>): T {
  const secrets = [...new Set(matched)].filter((s) => s.length >= DETECTION_LIMITS.scrubMin).sort((a, b) => b.length - a.length || compareBytes(a, b));
  if (secrets.length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** `terms` are search terms already checked by normalizeSearchTerms (./search.ts). */
export function buildSecurityResult(snapshot: Snapshot, config: ScanConfig, terms: readonly string[] = []): SecurityResult {
  const ctx = new EvaluationContext(snapshot, config);
  const pages = loadedPages(ctx);
  const drafts: Draft[] = [];
  const served: ServedText[] = pages.map((url) => ({ url, source: null, text: ctx.page(url)!.parsed.decoded.text }));
  const files = readFiles(ctx, drafts, served);
  const scripts = readScripts(ctx, pages, drafts, served);
  const matched = new Set<string>();
  const codes = new Set<string>();
  searchSecrets(served, drafts, matched, codes);

  const findings = drafts.map(finalize);
  const count = (id: string) => findings.filter((f) => f.check_id === id).length;

  // Inputs read only in part or not at all. Answers with any HTTP status count as read.
  const partly = (url: string) => fillTemplate(securityStatement("searched_partly"), { url });
  const pagesUnread = pages.filter((url) => ctx.page(url)!.exchange.truncated).map(partly);
  const scriptsUnread = scripts.flatMap((s) => {
    if (s.truncated) return [partly(s.url)];
    if (s.outcome.startsWith("HTTP ")) return [];
    const chain = ctx.chain(s.url);
    const note = notCheckedNote(s.url, chain.exchanges[chain.exchanges.length - 1] ?? null);
    return note ? [note] : [];
  });
  const mapsUnread = scripts.flatMap((s) => (s.map?.verdict === "not_checked" && s.map.note ? [s.map.note] : []));

  const checks = SECURITY_CHECKS.map((check) => {
    if (check.id === "SEC-VCS-01" || check.id === "SEC-FILE-01" || check.id === "SEC-FILE-02") {
      return checkRow(check.id, count(check.id), files.filter((f) => f.check_id === check.id && f.note !== null).map((f) => f.note!));
    }
    if (pages.length === 0) return checkRow(check.id, 0, [securityStatement("no_pages")]);
    if (check.id === "SEC-MAP-01") {
      if (scripts.length === 0) return checkRow(check.id, 0, [], [securityStatement("no_scripts")]);
      return checkRow(check.id, count(check.id), [...scriptsUnread, ...mapsUnread]);
    }
    return checkRow(check.id, count(check.id), [...pagesUnread, ...scriptsUnread, ...mapsUnread]);
  });

  const unreadText = pages.length === 0 ? [securityStatement("no_pages")] : [...new Set([...pagesUnread, ...scriptsUnread, ...mapsUnread])];
  const search = terms.length === 0 ? null : searchServed(served, terms, unreadText, codes);

  const byExposes = { credentials: 0, "source code": 0, "file paths": 0 } as Record<Exposes, number>;
  for (const f of findings) byExposes[f.exposes] += 1;
  const reach = reachOf(ctx, snapshot);

  return scrubResult<SecurityResult>({
    version: 1,
    checker: "security-checker",
    startUrl: snapshot.start_url,
    origin: ctx.preferredOrigin,
    completedAt: snapshot.completed_at,
    snapshotId: snapshot.snapshot_id,
    exposureVersion: EXPOSURE_CHECKS_VERSION,
    reach: { ...reach, pagesFetched: pages.length },
    pages,
    files,
    scripts,
    checks,
    issues: issuesOf(findings),
    findingCount: findings.length,
    byExposes,
    search,
    statements: { redaction: securityStatement("redaction"), scope: securityStatement("scope") },
  }, matched);
}
