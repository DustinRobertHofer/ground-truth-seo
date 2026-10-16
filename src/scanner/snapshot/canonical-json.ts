/**
 * RFC 8785 JSON Canonicalization Scheme, restricted to the value types the
 * scanner emits: objects, arrays, strings, integers, booleans and null.
 * Non-integer numbers are rejected so floating point can never reach a report.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function escapeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const ch = value[i]!;
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
        else out += ch;
    }
  }
  return `${out}"`;
}

/** RFC 8785 sorts object keys by their UTF-16 code units. */
function compareKeys(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`canonical JSON: non-integer number ${value}`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new Error(`canonical JSON: integer out of safe range ${value}`);
    }
    return value === 0 ? "0" : value.toString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") return escapeString(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item === undefined ? null : item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareKeys);
    return `{${keys.map((key) => `${escapeString(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  throw new Error(`canonical JSON: unsupported value of type ${typeof value}`);
}
