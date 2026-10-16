/**
 * Date parsing without the platform's locale-dependent Date parser.
 * Everything returns integer milliseconds since the Unix epoch, in UTC.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function utcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number | null {
  const value = Date.UTC(y, mo, d, h, mi, s, ms);
  // Reject out-of-range components that Date.UTC would silently roll over.
  const check = new Date(value);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) return null;
  if (check.getUTCHours() !== h || check.getUTCMinutes() !== mi || check.getUTCSeconds() !== s) return null;
  return value;
}

function zoneOffsetMs(zone: string | undefined): number | null {
  if (zone === undefined || zone === "" ) return 0;
  const z = zone.trim().toUpperCase();
  if (z === "Z" || z === "GMT" || z === "UT" || z === "UTC") return 0;
  const named: Record<string, number> = {
    EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7,
  };
  if (z in named) return named[z]! * 3_600_000;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(z);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

/** ISO 8601 / W3C Datetime with a time; returns the instant or null. */
export function parseIso8601(value: string): number | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|z|[+-]\d{2}:?\d{2})?)?$/.exec(
      value.trim(),
    );
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  const offset = zoneOffsetMs(zone ?? "Z");
  if (offset === null) return null;
  const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000) : 0;
  const base = utcMs(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms);
  return base === null ? null : base - offset;
}

/** RFC 822 (as updated by RFC 5322) and RFC 850 dates: "Wed, 03 Oct 2026 10:00:00 GMT", "Wednesday, 03-Oct-26 10:00:00 GMT", "3 Oct 2026 10:00 +0000". */
export function parseRfc822or850(value: string): number | null {
  const text = value.trim().replace(/^[A-Za-z]+,\s*/, "");
  const m =
    /^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([A-Za-z]+|[+-]\d{4})?$/.exec(
      text,
    );
  if (!m) return null;
  const [, d, mon, yRaw, h, mi, s, zone] = m;
  const month = MONTHS[mon!.toLowerCase()];
  if (month === undefined) return null;
  let year = Number(yRaw);
  if (yRaw!.length === 2) year += year < 50 ? 2000 : 1900;
  const offset = zoneOffsetMs(zone);
  if (offset === null) return null;
  const base = utcMs(year, month, Number(d), Number(h), Number(mi), Number(s ?? 0));
  return base === null ? null : base - offset;
}

/** Google's accepted formats for unavailable_after (§3.7 step 4). A date without a zone is read as UTC. */
export function parseUnavailableAfter(value: string): number | null {
  return parseIso8601(value) ?? parseRfc822or850(value);
}

/** W3C Datetime forms accepted for sitemap lastmod (SEO-SITEMAP-04A). */
export type LastmodParse =
  | { valid: true; hasTime: boolean; /** Earliest possible instant (UTC+14 for date-only values). */ earliest: number; raw: string }
  | { valid: false; raw: string };

export function parseLastmod(value: string): LastmodParse {
  const raw = value.trim();
  let m = /^(\d{4})$/.exec(raw);
  if (m) {
    const base = utcMs(Number(m[1]), 0, 1);
    return base === null ? { valid: false, raw } : { valid: true, hasTime: false, earliest: base - 14 * 3_600_000, raw };
  }
  m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) {
    const base = utcMs(Number(m[1]), Number(m[2]) - 1, 1);
    return base === null ? { valid: false, raw } : { valid: true, hasTime: false, earliest: base - 14 * 3_600_000, raw };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const base = utcMs(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return base === null ? { valid: false, raw } : { valid: true, hasTime: false, earliest: base - 14 * 3_600_000, raw };
  }
  // With a time, the W3C Datetime profile requires a time zone designator.
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (m) {
    const instant = parseIso8601(raw);
    return instant === null ? { valid: false, raw } : { valid: true, hasTime: true, earliest: instant, raw };
  }
  return { valid: false, raw };
}

/** Parse the snapshot's completed_at (ISO 8601 UTC) into milliseconds. */
export function parseCompletedAt(value: string): number {
  const ms = parseIso8601(value);
  if (ms === null) throw new Error(`invalid completed_at: ${value}`);
  return ms;
}
