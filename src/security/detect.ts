/**
 * Pure detection for the security checker (KNOWLEDGE.md §12.3 and §12.4).
 * Every function reads text from the snapshot and returns positions and the
 * redacted facts §12.2 allows. A matched value never leaves this module: the
 * detectors return where a secret starts and what kind it is, never the secret.
 */

import { attr, baseUrl, elements, relTokens, type ParsedHtml } from "../scanner/evaluate/core/html.js";
import { sortBytes } from "../scanner/evaluate/core/text.js";
import { comparisonKey } from "../scanner/evaluate/core/url.js";
import { base64Decode, isHtmlMediaType } from "../scanner/snapshot/access.js";
import {
  ACCESS_CODE_WORDS,
  ACCESS_WORDS,
  DETECTION_LIMITS,
  GITHUB_TOKEN_TYPES,
  HTPASSWD_HASH_PREFIXES,
  PLACEHOLDER_HOST_SUFFIXES,
  PLACEHOLDER_HOSTS,
  PLACEHOLDER_PASSWORD_FRAGMENTS,
  PLACEHOLDER_PASSWORDS,
  PASSWORD_HASH_PREFIXES,
  PASSWORD_NAME_MARKERS,
  SECRET_NAME_MARKERS,
  VALUE_PLACEHOLDERS,
  type ValueKind,
} from "./knowledge.js";

const LINE_BREAK = /\r\n|\r|\n/;

// ------------------------------------------------------------------- text

/** UTF-8 with invalid bytes replaced and a leading byte order mark dropped (§12.3 Served text). */
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** §12.3 HTML body: an HTML media type, or `<` as the first character other than whitespace and a BOM. */
export function isHtmlBody(contentType: string | null, text: string): boolean {
  if (isHtmlMediaType(contentType)) return true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === "\uFEFF" || ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f") continue;
    return ch === "<";
  }
  return false;
}

export interface Position {
  line: number;
  column: number;
}

/** Line and column of a string index: lines split at LF, CRLF and CR; both count from 1; columns in UTF-16 code units. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code === 10) this.starts.push(i + 1);
      else if (code === 13) {
        if (text.charCodeAt(i + 1) === 10) i += 1;
        this.starts.push(i + 1);
      }
    }
  }

  position(index: number): Position {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.starts[mid]! <= index) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: index - this.starts[low]! + 1 };
  }
}

function distinctCount(value: string): number {
  return new Set(value).size;
}

// ------------------------------------------------------------ quoted data

/**
 * §12.3 Quoted string: an opening quote, double, single or backtick, after
 * any run of backslashes (JSON inside a JavaScript string, such as the data a
 * page embeds for its scripts) or written as `&quot;` (JSON inside an HTML
 * attribute). A pattern closes it with a backreference, so the closing quote
 * is written exactly as the opening one.
 */
const QUOTE = "\\\\*(?:[\"'`]|&quot;)";
const QUOTE_AT = new RegExp(`^${QUOTE}`);

/** A character of a quoted name in the SEC-DATA checks: anything but a line break, tab, quote, backslash, `&`, `<` or `>`. */
const QUOTED_NAME_CHAR = "[^\\r\\n\\t\"'`\\\\<>&]";

/**
 * SEC-DATA-01 and SEC-DATA-02: a name followed by `:` or `=`, either a quoted
 * string (groups 1 and 2) or an identifier (group 3), then `value`, whose
 * first group is group 4.
 */
function assignmentPattern(value: string): RegExp {
  const max = DETECTION_LIMITS.nameMax;
  return new RegExp(`(?:(${QUOTE})(${QUOTED_NAME_CHAR}{1,${max}})\\1|(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]{0,${max - 1}}))\\s*[:=]\\s*${value}`, "g");
}

const NAME_SEPARATORS = new Set(["_", "-", ".", "$", " "]);
const isUpper = (ch: string | undefined) => ch !== undefined && ch >= "A" && ch <= "Z";
const isLower = (ch: string | undefined) => ch !== undefined && ch >= "a" && ch <= "z";
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= "0" && ch <= "9";

/** §12.3 Name words: the folded name, and for each of its characters whether it starts a word of the name. */
export function foldName(name: string): { folded: string; starts: boolean[] } {
  let folded = "";
  const starts: boolean[] = [];
  let afterSeparator = true;
  for (let i = 0; i < name.length; i += 1) {
    const ch = name[i]!;
    if (NAME_SEPARATORS.has(ch)) {
      afterSeparator = true;
      continue;
    }
    const prev = name[i - 1];
    const start = afterSeparator || (isUpper(ch) && (isLower(prev) || isDigit(prev) || (isUpper(prev) && isLower(name[i + 1]))));
    const lower = ch.toLowerCase();
    for (let j = 0; j < lower.length; j += 1) starts.push(start && j === 0);
    folded += lower;
    afterSeparator = false;
  }
  return { folded, starts };
}

/** §12.3 Name words, without word starts: lowercased with `_`, `-`, `.`, `$` and spaces removed. */
function folded(value: string): string {
  return foldName(value).folded;
}

// ------------------------------------------------------------- same site

/** §12.3 Site base: the preferred origin's host without a leading `www.`. */
export function siteBaseOf(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, "");
}

export function isSameSite(url: string, base: string): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    host = parsed.hostname;
  } catch {
    return false;
  }
  return host === base || host.endsWith(`.${base}`);
}

/** §12.3 Scripts: script src, modulepreload and preload-as-script hrefs on a page, same-site, sorted. */
export function scriptUrlsOf(parsed: ParsedHtml, pageUrl: string, base: string): string[] {
  const documentBase = baseUrl(parsed, pageUrl);
  const out = new Set<string>();
  const add = (raw: string | null) => {
    if (raw === null || raw.trim() === "") return;
    const key = comparisonKey(raw, documentBase);
    if (key && isSameSite(key, base)) out.add(key);
  };
  for (const script of elements(parsed.document, "script")) add(attr(script, "src"));
  for (const link of elements(parsed.document, "link")) {
    const rel = relTokens(link);
    const asScript = (attr(link, "as") ?? "").trim().toLowerCase() === "script";
    if (rel.includes("modulepreload") || (rel.includes("preload") && asScript)) add(attr(link, "href"));
  }
  return sortBytes(out);
}

// ------------------------------------------------------------ source maps

export type MapVia = "header" | "comment" | "convention" | "data";

/** Where a script's source map is: a URL to fetch, or the JSON text of a `data:` URL. */
export type MapRef = { via: Exclude<MapVia, "data">; url: string } | { via: "data"; text: string | null };

/** The payload of a `data:` URL as text, or null when it cannot be decoded. */
export function decodeDataUrl(value: string): string | null {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(value.trim());
  if (!match) return null;
  const meta = match[1]!.toLowerCase();
  const payload = match[2]!;
  try {
    return meta.split(";").includes("base64") ? decodeUtf8(base64Decode(payload)) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function refFrom(raw: string, scriptUrl: string, via: "header" | "comment"): MapRef | null {
  const value = raw.trim();
  if (/^data:/i.test(value)) return { via: "data", text: decodeDataUrl(value) };
  const url = comparisonKey(value, scriptUrl);
  return url ? { via, url } : null;
}

/**
 * §12.3 Source map discovery, first match wins: the `sourcemap` header, then
 * `x-sourcemap`, then the last sourceMappingURL comment, then the script URL
 * with `.map` appended to its path for .js, .mjs and .cjs files.
 */
export function sourceMapRef(scriptUrl: string, headers: { sourcemap: string | null; xSourcemap: string | null }, text: string): MapRef | null {
  const fromHeader = headers.sourcemap ?? headers.xSourcemap;
  if (fromHeader !== null && fromHeader.trim() !== "") return refFrom(fromHeader, scriptUrl, "header");
  let last: string | null = null;
  for (const match of text.matchAll(/\/\/[#@][ \t]*sourceMappingURL=([^\s'"`]+)/g)) last = match[1]!;
  if (last !== null) return refFrom(last, scriptUrl, "comment");
  const url = new URL(scriptUrl);
  if (!/\.(?:m|c)?js$/i.test(url.pathname)) return null;
  url.pathname = `${url.pathname}.map`;
  const key = comparisonKey(url.toString());
  return key ? { via: "convention", url: key } : null;
}

export interface ParsedSourceMap {
  /** The `sources` entries in map order (index maps flattened). */
  sources: string[];
  /** The `sourcesContent` entry for each source, or null. */
  contents: (string | null)[];
}

function flatten(value: unknown, depth: number): ParsedSourceMap | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const map = value as Record<string, unknown>;
  if (map.version !== 3) return null;
  if (Array.isArray(map.sections)) {
    if (depth > 0) return null;
    const out: ParsedSourceMap = { sources: [], contents: [] };
    for (const section of map.sections) {
      const inner = typeof section === "object" && section !== null ? flatten((section as Record<string, unknown>).map, depth + 1) : null;
      if (!inner) return null;
      out.sources.push(...inner.sources);
      out.contents.push(...inner.contents);
    }
    return out;
  }
  if (!Array.isArray(map.sources)) return null;
  const sources = map.sources.map((s) => (typeof s === "string" ? s : ""));
  const raw = Array.isArray(map.sourcesContent) ? map.sourcesContent : [];
  const contents = sources.map((_, i) => (typeof raw[i] === "string" ? (raw[i] as string) : null));
  return { sources, contents };
}

/** §12.3 Confirmed source map, or null. A leading line starting with `)]}'` is removed first. */
export function parseSourceMap(text: string): ParsedSourceMap | null {
  let body = text;
  if (body.startsWith(")]}'")) {
    const end = body.search(LINE_BREAK);
    body = end === -1 ? "" : body.slice(end);
  }
  try {
    return flatten(JSON.parse(body), 0);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- probes

/** SEC-VCS-01: the first line is `ref: refs/<name>` or a 40 or 64 character object name. */
export function isGitHead(text: string): boolean {
  const first = (text.split(LINE_BREAK, 1)[0] ?? "").trimEnd();
  return /^ref: refs\/\S+$/.test(first) || /^[0-9a-f]{40}$/.test(first) || /^[0-9a-f]{64}$/.test(first);
}

/** SEC-VCS-01: a line reads `[core]`. */
export function isGitConfig(text: string): boolean {
  return text.split(LINE_BREAK).some((line) => line.trim() === "[core]");
}

export interface EnvFile {
  /** Distinct variable names set. */
  count: number;
  /** Names that §12.2 rule 2 allows, in byte order. */
  names: string[];
}

/** SEC-FILE-01: an environment file, or null. Values are read only to find where a multi-line quoted value ends. */
export function parseEnvFile(text: string): EnvFile | null {
  const names = new Set<string>();
  let assignments = 0;
  let meaningful = 0;
  let open: string | null = null;
  for (const line of text.split(LINE_BREAK)) {
    if (open !== null) {
      if (line.includes(open)) open = null;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    meaningful += 1;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    assignments += 1;
    names.add(match[1]!);
    const value = match[2]!.trimStart();
    const quote = value[0];
    if ((quote === '"' || quote === "'" || quote === "`") && !value.slice(1).includes(quote)) open = quote;
  }
  if (assignments === 0 || assignments * 2 < meaningful) return null;
  return { count: names.size, names: sortBytes([...names].filter((n) => n.length <= DETECTION_LIMITS.envNameMax)) };
}

export interface CredentialFile {
  count: number;
  /** Hosts in byte order, as {hosts} shows them. */
  hosts: string[];
}

/** SEC-FILE-02 `git_credentials`: `scheme://user:password@host` lines, at least half of the non-blank lines. */
export function parseGitCredentials(text: string): CredentialFile | null {
  const hosts = new Set<string>();
  let count = 0;
  let nonBlank = 0;
  for (const line of text.split(LINE_BREAK)) {
    if (line.trim() === "") continue;
    nonBlank += 1;
    const match = /^\s*[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@]+@([^\s/?#:]+)/.exec(line);
    if (!match) continue;
    count += 1;
    hosts.add(match[1]!.toLowerCase());
  }
  if (count === 0 || count * 2 < nonBlank) return null;
  return { count, hosts: sortBytes(hosts) };
}

export const DEFAULT_NPM_REGISTRY = "the default registry";

/** SEC-FILE-02 `npmrc`: lines setting _authToken, _auth or _password to a literal value. */
export function parseNpmrc(text: string): CredentialFile | null {
  const hosts = new Set<string>();
  let count = 0;
  for (const line of text.split(LINE_BREAK)) {
    const match = /^\s*(?:\/\/([^\s=]*?):)?(_authToken|_auth|_password)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[3]!.trim();
    if (value === "" || value.startsWith("${")) continue;
    count += 1;
    const scope = match[1];
    hosts.add(scope ? scope.split("/")[0]!.toLowerCase() || DEFAULT_NPM_REGISTRY : DEFAULT_NPM_REGISTRY);
  }
  return count === 0 ? null : { count, hosts: sortBytes(hosts) };
}

/** SEC-FILE-02 `htpasswd`: `user:hash` lines with a known hash prefix, at least half of the meaningful lines. */
export function parseHtpasswd(text: string): { count: number } | null {
  let count = 0;
  let meaningful = 0;
  for (const line of text.split(LINE_BREAK)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    meaningful += 1;
    const match = /^([^:\s]+):(\S+)$/.exec(trimmed);
    if (match && HTPASSWD_HASH_PREFIXES.some((prefix) => match[2]!.startsWith(prefix))) count += 1;
  }
  return count === 0 || count * 2 < meaningful ? null : { count };
}

// --------------------------------------------------------------- secrets

export interface GithubTokenMatch {
  index: number;
  /** Where the token ends (exclusive); the caller scrubs it from the result and never emits it. */
  end: number;
  prefix: string;
  type: string;
}

const TYPE_BY_PREFIX = new Map(GITHUB_TOKEN_TYPES.map((t) => [t.prefix, t.type]));

/** SEC-SECRET-01. */
export function findGithubTokens(text: string): GithubTokenMatch[] {
  if (!text.includes("gh") && !text.includes("github_pat_")) return [];
  const found = new Map<number, GithubTokenMatch>();
  const stateless = /(?<![A-Za-z0-9_])ghs_([0-9]+_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;
  for (const match of text.matchAll(stateless)) {
    if (distinctCount(match[1]!) < DETECTION_LIMITS.tokenMinDistinct) continue;
    found.set(match.index, { index: match.index, end: match.index + match[0].length, prefix: "ghs_", type: TYPE_BY_PREFIX.get("ghs_")! });
  }
  const classic = new RegExp(`(?<![A-Za-z0-9_])(github_pat_|gh[pousr]_)([A-Za-z0-9_]{${DETECTION_LIMITS.tokenMinLength},})`, "g");
  for (const match of text.matchAll(classic)) {
    if (found.has(match.index) || distinctCount(match[2]!) < DETECTION_LIMITS.tokenMinDistinct) continue;
    const prefix = match[1]!;
    found.set(match.index, { index: match.index, end: match.index + match[0].length, prefix, type: TYPE_BY_PREFIX.get(prefix)! });
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

export interface PrivateKeyMatch {
  index: number;
  label: string;
}

/** SEC-SECRET-02: a complete PEM private key block. */
export function findPrivateKeys(text: string): PrivateKeyMatch[] {
  if (!text.includes("-----BEGIN ")) return [];
  const out: PrivateKeyMatch[] = [];
  for (const match of text.matchAll(/-----BEGIN (PRIVATE KEY|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|DSA PRIVATE KEY)-----/g)) {
    const label = match[1]!;
    const start = match.index + match[0].length;
    const end = text.indexOf(`-----END ${label}-----`, start);
    if (end === -1 || end - start > DETECTION_LIMITS.pemWindow) continue;
    const body = text
      .slice(start, end)
      .replace(/\\r\\n|\\n|\\r/g, "\n")
      .replace(/\\\//g, "/")
      .split(LINE_BREAK)
      .filter((line) => !line.includes(":"))
      .join("")
      .replace(/\s+/g, "");
    if (body.length >= DETECTION_LIMITS.pemMinBody && /^[A-Za-z0-9+/=]+$/.test(body)) out.push({ index: match.index, label });
  }
  return out;
}

export interface UrlPasswordMatch {
  index: number;
  /** The password's span (end exclusive), for scrubbing only. */
  passwordStart: number;
  passwordEnd: number;
  scheme: string;
  host: string;
}

function isPlaceholderHost(host: string): boolean {
  return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || PLACEHOLDER_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isPlaceholderPassword(password: string): boolean {
  const lower = password.toLowerCase();
  return (
    (PLACEHOLDER_PASSWORDS as readonly string[]).includes(lower) ||
    PLACEHOLDER_PASSWORD_FRAGMENTS.some((fragment) => password.includes(fragment)) ||
    /^[*xX.]+$/.test(password)
  );
}

/** SEC-SECRET-03: `scheme://user:password@host`. */
export function findUrlPasswords(text: string): UrlPasswordMatch[] {
  if (!text.includes("://")) return [];
  const out: UrlPasswordMatch[] = [];
  const pattern = /(?<![A-Za-z0-9+.-])([A-Za-z][A-Za-z0-9+.-]{1,19}):\/\/([^\s'"`<>\\/?#:@]+):([^\s'"`<>\\/?#@]+)@([^\s'"`<>\\/?#:@]+)/g;
  for (const match of text.matchAll(pattern)) {
    const host = match[4]!.toLowerCase();
    if (isPlaceholderHost(host) || isPlaceholderPassword(match[3]!)) continue;
    const passwordStart = match.index + match[1]!.length + 3 + match[2]!.length + 1;
    out.push({ index: match.index, passwordStart, passwordEnd: passwordStart + match[3]!.length, scheme: match[1]!.toLowerCase(), host });
  }
  return out;
}

export interface NamedSecretMatch {
  /** Where the value starts. */
  index: number;
  /** Where the value ends (exclusive), for scrubbing only. */
  end: number;
  name: string;
}

function marksSecret(name: string): boolean {
  const folded = name.toLowerCase().replace(/[_\-.$]/g, "");
  return SECRET_NAME_MARKERS.some((marker) => folded.includes(marker));
}

function isCandidateValue(value: string, name: string): boolean {
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return false;
  if (distinctCount(value) < DETECTION_LIMITS.valueMinDistinct) return false;
  if (value.startsWith("/") || value.startsWith(".")) return false;
  const lower = value.toLowerCase();
  if (VALUE_PLACEHOLDERS.some((p) => lower.includes(p))) return false;
  return !lower.includes(name.toLowerCase());
}

/** SEC-SECRET-04: a quoted value assigned to a name that marks a secret. `skip` holds value positions already reported. */
export function findNamedSecrets(text: string, skip: ReadonlySet<number> = new Set()): NamedSecretMatch[] {
  if (!/secret|passw|private[_\-.$]*key/i.test(text)) return [];
  const { nameMax, valueMin, valueMax } = DETECTION_LIMITS;
  const pattern = new RegExp(
    `(?:(${QUOTE})([A-Za-z_$][A-Za-z0-9_$.\\-]{0,${nameMax - 1}})\\1|(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]{0,${nameMax - 1}}))\\s*[:=]\\s*(${QUOTE})([A-Za-z0-9_\\-+/=.]{${valueMin},${valueMax}})\\4`,
    "g",
  );
  const out: NamedSecretMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const name = match[2] ?? match[3]!;
    const value = match[5]!;
    if (!marksSecret(name) || !isCandidateValue(value, name)) continue;
    // The closing quote is written like the opening one (group 4), so it may be longer than one character.
    const index = match.index + match[0].length - match[4]!.length - value.length;
    if (skip.has(index)) continue;
    out.push({ index, end: index + value.length, name });
  }
  return out;
}

// ----------------------------------------------------------- page data

export interface AccessCodeMatch {
  /** Where the value starts. */
  index: number;
  /** Where the value ends (exclusive). Never scrubbed or emitted (KNOWLEDGE.md §12.2 rule 6). */
  end: number;
  name: string;
}

/** Text without any code word cannot hold a SEC-DATA-01 name, so the full pattern is skipped. */
const ACCESS_CODE_HINT = new RegExp(ACCESS_CODE_WORDS.join("|"), "i");

/** SEC-DATA-01: the folded name ends with an access word and a code word, and the access word starts one of its words. */
export function marksAccessCode(name: string): boolean {
  const { folded: f, starts } = foldName(name);
  for (const word of ACCESS_WORDS) {
    for (const code of ACCESS_CODE_WORDS) {
      const tail = word + code;
      if (f.endsWith(tail) && starts[f.length - tail.length]) return true;
    }
  }
  return false;
}

function isPlaceholderCode(value: string, name: string): boolean {
  if (distinctCount(value) === 1) return true;
  const lower = value.toLowerCase();
  return VALUE_PLACEHOLDERS.some((p) => lower.includes(p)) || folded(value).includes(folded(name));
}

/**
 * SEC-DATA-01: a quoted code (group 5) or an unquoted integer (group 6)
 * assigned to a name that marks an access code. `skip` holds value positions
 * SEC-SECRET-01 and SEC-SECRET-04 already report.
 */
export function findAccessCodes(text: string, skip: ReadonlySet<number> = new Set()): AccessCodeMatch[] {
  if (!ACCESS_CODE_HINT.test(text)) return [];
  const { codeMin, codeMax, codeDigitsMin, codeDigitsMax } = DETECTION_LIMITS;
  const pattern = assignmentPattern(
    `(?:(${QUOTE})([^\\s"'\`\\\\&<>{}]{${codeMin},${codeMax}})\\4|([0-9]{${codeDigitsMin},${codeDigitsMax}})(?![A-Za-z0-9_.]))`,
  );
  const out: AccessCodeMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const name = match[2] ?? match[3]!;
    const quoted = match[5];
    const value = quoted ?? match[6]!;
    if (!marksAccessCode(name)) continue;
    if (quoted !== undefined && (!/[0-9]/.test(quoted) || quoted.startsWith("$"))) continue;
    if (isPlaceholderCode(value, name)) continue;
    const index = quoted !== undefined ? match.index + match[0].length - match[4]!.length - value.length : match.index + match[0].length - value.length;
    if (skip.has(index)) continue;
    out.push({ index, end: index + value.length, name });
  }
  return out;
}

export interface PasswordHashMatch {
  index: number;
  /** Where the hash ends (exclusive), for scrubbing only. */
  end: number;
  name: string;
  prefix: string;
}

/** SEC-DATA-02: a quoted password hash, recognized by its prefix, assigned to a name that marks a password. */
export function findPasswordHashes(text: string): PasswordHashMatch[] {
  if (!/passw/i.test(text) || !text.includes("$")) return [];
  const { hashMin, hashMax, hashMinDistinct } = DETECTION_LIMITS;
  const pattern = assignmentPattern(`(${QUOTE})(\\$[^\\s"'\`\\\\&<>]{${hashMin - 1},${hashMax - 1}})\\4`);
  const out: PasswordHashMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const name = match[2] ?? match[3]!;
    const value = match[5]!;
    const prefix = PASSWORD_HASH_PREFIXES.find((p) => value.startsWith(p));
    if (!prefix || !PASSWORD_NAME_MARKERS.some((m) => folded(name).includes(m))) continue;
    if (distinctCount(value.slice(prefix.length)) < hashMinDistinct) continue;
    const index = match.index + match[0].length - match[4]!.length - value.length;
    out.push({ index, end: index + value.length, name, prefix });
  }
  return out;
}

// ---------------------------------------------------------------- search

/** A literal pattern for a term (KNOWLEDGE.md §12.7): matched as written, without case. */
export function literalPattern(term: string): RegExp {
  return new RegExp(term.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"), "giu");
}

/** §12.7 value kinds: read from the first characters of the value at `index`. */
export function valueKindAt(text: string, index: number): ValueKind {
  const quote = QUOTE_AT.exec(text.slice(index, index + 16))?.[0];
  if (quote !== undefined) {
    const inside = index + quote.length;
    if (text.startsWith(quote, inside)) return "empty_string";
    if (text.startsWith(`$undefined${quote}`, inside)) return "undefined";
    return "string";
  }
  const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(index, index + 16))?.[0];
  if (word === "undefined") return "undefined";
  if (word === "true" || word === "false") return "boolean";
  if (word === "null") return "null";
  const ch = text[index];
  if (isDigit(ch) || (ch === "-" && isDigit(text[index + 1]))) return "number";
  if (ch === "{") return "object";
  if (ch === "[") return "array";
  return "other";
}

/**
 * §12.7: the kind of value a property holds when the text before `end` ends
 * its name, that is, when `end` is followed by a closing quote, if any, then
 * by optional whitespace and `:`, or `=` not followed by `=` or `>`. Null otherwise.
 */
export function propertyKindAfter(text: string, end: number): ValueKind | null {
  let i = end + (QUOTE_AT.exec(text.slice(end, end + 16))?.[0].length ?? 0);
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  if (text[i] === ":") i += 1;
  else if (text[i] === "=" && text[i + 1] !== "=" && text[i + 1] !== ">") i += 1;
  else return null;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  return valueKindAt(text, i);
}

export interface TermMatches {
  /** Every occurrence. */
  count: number;
  /** Where the first `limit` occurrences start and end, in text order. */
  first: { index: number; end: number }[];
}

/** §12.7 Matching: occurrences of a term, without case, left to right, none overlapping. */
export function findTerm(text: string, term: string, limit: number): TermMatches {
  const first: TermMatches["first"] = [];
  let count = 0;
  for (const match of text.matchAll(literalPattern(term))) {
    count += 1;
    if (first.length < limit) first.push({ index: match.index, end: match.index + match[0].length });
  }
  return { count, first };
}
