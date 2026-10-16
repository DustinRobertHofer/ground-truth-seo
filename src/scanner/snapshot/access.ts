/**
 * Read access to snapshot bodies and headers. Bodies are base64 in the
 * serialized snapshot; decoding is cached per snapshot object.
 */

import type { Exchange, Snapshot } from "./types.js";

const cache = new WeakMap<Snapshot, Map<string, Uint8Array>>();

export function base64Decode(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(value, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function bodyOf(snapshot: Snapshot, exchange: Exchange | null): Uint8Array | null {
  if (!exchange || !exchange.body_sha256) return null;
  let bodies = cache.get(snapshot);
  if (!bodies) {
    bodies = new Map();
    cache.set(snapshot, bodies);
  }
  const hit = bodies.get(exchange.body_sha256);
  if (hit) return hit;
  const encoded = snapshot.bodies[exchange.body_sha256];
  if (encoded === undefined) return null;
  const bytes = base64Decode(encoded);
  bodies.set(exchange.body_sha256, bytes);
  return bytes;
}

/** First header value by lowercase name, or null. */
export function header(exchange: Exchange | null, name: string): string | null {
  if (!exchange) return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of exchange.headers) if (key === wanted) return value;
  return null;
}

/** Every header value by lowercase name, in order. */
export function headers(exchange: Exchange | null, name: string): string[] {
  if (!exchange) return [];
  const wanted = name.toLowerCase();
  return exchange.headers.filter(([key]) => key === wanted).map(([, value]) => value);
}

export function isHtmlMediaType(contentType: string | null): boolean {
  if (!contentType) return false;
  const essence = contentType.split(";")[0]!.trim().toLowerCase();
  return essence === "text/html" || essence === "application/xhtml+xml";
}

/** The {outcome} fill of KNOWLEDGE.md §1.5. */
export function outcomeLabel(exchange: Exchange | null): string {
  if (!exchange) return "no response";
  switch (exchange.outcome) {
    case "response":
      return `HTTP ${exchange.status}`;
    case "dns_error":
      return "a DNS error";
    case "tls_error":
      return `a TLS error (${exchange.error_code ?? "handshake_failed"})`;
    case "timeout":
      return "a timeout";
    case "connection_error":
      return "a connection error";
    case "blocked_by_robots_policy":
      return "not fetched (blocked by the scanner's robots policy)";
  }
}
