/**
 * URL normalization and the comparison key (KNOWLEDGE.md §3.1), plus the
 * origin helpers of §3.2.
 */

import { compareBytes } from "./text.js";

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/** Uppercase percent-encoding hex digits and decode unreserved octets. */
export function normalizePercentEncoding(component: string): string {
  return component.replace(/%([0-9A-Fa-f]{2})/g, (match, hex: string) => {
    const code = parseInt(hex, 16);
    const char = String.fromCharCode(code);
    if (code < 0x80 && UNRESERVED.test(char)) return char;
    return `%${hex.toUpperCase()}`;
  });
}

/**
 * Resolve a raw attribute value against a base and return the comparison
 * key, or null when the value does not parse as an http(s) URL.
 */
export function comparisonKey(raw: string, base?: string): string | null {
  const trimmed = raw.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
  let url: URL;
  try {
    url = base === undefined ? new URL(trimmed) : new URL(trimmed, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return keyOfUrl(url);
}

/** The comparison key of an already parsed URL. */
export function keyOfUrl(url: URL): string {
  const copy = new URL(url.toString());
  copy.hash = "";
  const path = normalizePercentEncoding(copy.pathname);
  const query = copy.search ? `?${normalizePercentEncoding(copy.search.slice(1))}` : copy.search;
  // Preserve an empty query ("?") exactly as serialized.
  const hasEmptyQuery = copy.search === "" && copy.href.endsWith("?") && !copy.hash;
  return `${copy.protocol}//${copy.host}${path}${query}${hasEmptyQuery ? "?" : ""}`;
}

/** Parse a key back into a URL (keys are always valid URLs). */
export function parseKey(key: string): URL {
  return new URL(key);
}

export function originOf(key: string): string {
  return new URL(key).origin;
}

export function hostOf(key: string): string {
  return new URL(key).host;
}

/** The home page of an origin: the origin followed by "/". */
export function homePageOf(origin: string): string {
  return `${origin}/`;
}

/** Path plus "?" and query when present, normalized (robots.txt target form). */
export function pathAndQuery(key: string): string {
  const url = new URL(key);
  return `${url.pathname}${url.search}`;
}

/** The host without a leading "www." label. */
export function registrableHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * The http/https × www/non-www combinations of the preferred origin's
 * registrable host, excluding the preferred origin itself (§3.2).
 */
export function variantOrigins(preferredOrigin: string): string[] {
  const url = new URL(preferredOrigin);
  const bare = registrableHost(url.hostname);
  const port = url.port ? `:${url.port}` : "";
  const hosts = [bare, `www.${bare}`];
  const out: string[] = [];
  for (const scheme of ["http:", "https:"]) {
    for (const host of hosts) {
      const origin = `${scheme}//${host}${port}`;
      if (origin !== preferredOrigin) out.push(origin);
    }
  }
  return out.sort(compareBytes);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** True when the raw string has a URL scheme (RFC 3986 scheme syntax). */
export function hasScheme(raw: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw.trim());
}

/** Lowercase path and query for case-duplicate grouping (SEO-URL-05). */
export function caseFoldedKey(key: string): string {
  const url = new URL(key);
  return `${url.protocol}//${url.host}${url.pathname.toLowerCase()}${url.search.toLowerCase()}`;
}

/** Directory of a URL: everything up to and including the last "/" of the path. */
export function directoryOf(key: string): string {
  const url = new URL(key);
  const path = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
  return `${url.protocol}//${url.host}${path}`;
}

/** Simple glob match for include/exclude path patterns: `*` matches within a segment, `**` across segments. */
export function matchesPathGlob(pattern: string, path: string): boolean {
  let regex = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        regex += ".*";
        i += 1;
      } else {
        regex += "[^/]*";
      }
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      regex += `\\${ch}`;
    } else {
      regex += ch;
    }
  }
  return new RegExp(`^${regex}$`).test(path);
}
