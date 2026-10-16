/**
 * Text normalization (KNOWLEDGE.md §3.5) and the fixed number formats of §1.5.
 * Nothing here depends on locale.
 */

const ASCII_WS = /[\t\n\f\r ]+/g;

/** NFC, then strip and collapse ASCII whitespace as the HTML Standard defines it. */
export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(ASCII_WS, " ").replace(/^ | $/g, "");
}

/** Equality key for duplicates: normalized text with Unicode default case folding (approximated by toLowerCase + toUpperCase round trip for stability). */
export function foldText(value: string): string {
  // Unicode default case folding is closely approximated by lower-casing
  // the upper-cased form; this is locale-independent in JavaScript.
  return normalizeText(value).toUpperCase().toLowerCase();
}

/** Decimal digits with a comma every three digits: 2140512 → "2,140,512". */
export function formatInt(value: number | bigint): string {
  const negative = typeof value === "bigint" ? value < 0n : value < 0;
  const digits = (typeof value === "bigint" ? (negative ? -value : value) : Math.abs(Math.trunc(value))).toString();
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ",";
  }
  return negative ? `-${out}` : out;
}

/** Integer with thousands separators and the suffix " ms". */
export function formatMs(value: number): string {
  return `${formatInt(value)} ms`;
}

/** Integer thousandths rendered with three decimals: 105 → "0.105". */
export function formatThousandths(value: number): string {
  const whole = Math.trunc(value / 1000);
  const frac = Math.abs(value % 1000).toString().padStart(3, "0");
  return `${whole}.${frac}`;
}

/** The first three members in sort order, comma-separated, followed by " and <n> more". */
export function formatExamples(sorted: readonly string[]): string {
  const head = sorted.slice(0, 3).join(", ");
  const rest = sorted.length - 3;
  return rest > 0 ? `${head} and ${formatInt(rest)} more` : head;
}

/** Ascending UTF-8 byte order comparison of two strings. */
export function compareBytes(a: string, b: string): number {
  if (a === b) return 0;
  const ea = encoder.encode(a);
  const eb = encoder.encode(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i += 1) {
    if (ea[i] !== eb[i]) return ea[i]! - eb[i]!;
  }
  return ea.length - eb.length;
}

const encoder = new TextEncoder();

export function sortBytes<T extends string>(values: Iterable<T>): T[] {
  return [...values].sort(compareBytes);
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return sortBytes(new Set(values));
}

/** Strict UTF-8 validation. Returns the byte offset of the first invalid sequence, or -1. */
export function firstInvalidUtf8(bytes: Uint8Array): number {
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b = bytes[i]!;
    if (b < 0x80) {
      i += 1;
      continue;
    }
    let need = 0;
    let min = 0;
    let cp = 0;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      cp = b & 0x1f;
      min = 0x80;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      cp = b & 0x0f;
      min = 0x800;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      cp = b & 0x07;
      min = 0x10000;
    } else {
      return i;
    }
    for (let k = 1; k <= need; k += 1) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return i;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return i;
    i += need + 1;
  }
  return -1;
}

/** 1-based line number of a byte offset, counting LF, CR and CRLF line breaks. */
export function lineOfOffset(bytes: Uint8Array, offset: number): number {
  let line = 1;
  const end = Math.min(offset, bytes.length);
  for (let i = 0; i < end; i += 1) {
    const b = bytes[i];
    if (b === 0x0a) line += 1;
    else if (b === 0x0d) {
      line += 1;
      if (bytes[i + 1] === 0x0a) i += 1;
    }
  }
  return line;
}
