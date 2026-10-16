/**
 * Private, loopback, link-local and cloud metadata address blocking (PRODUCT.md §13).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::1" || ip === "::") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  const value = mapped?.[1] ?? ip;
  if (value.includes(":")) {
    const head = value.split(":")[0] ?? "";
    if (head.startsWith("fc") || head.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(head)) return true;
    if (value.startsWith("2001:db8")) return true;
    return false;
  }
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b, c] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") return true;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  return false;
}

export type ResolveResult = { ok: true; addresses: string[] } | { ok: false; reason: "dns_error" | "blocked" };

/** Resolve a host and refuse any that maps to a blocked address. */
export async function resolvePublic(hostname: string): Promise<ResolveResult> {
  if (isBlockedHostname(hostname)) return { ok: false, reason: "blocked" };
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isBlockedAddress(host) ? { ok: false, reason: "blocked" } : { ok: true, addresses: [host] };
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "dns_error" };
  }
  if (records.length === 0) return { ok: false, reason: "dns_error" };
  if (records.some((r) => isBlockedAddress(r.address))) return { ok: false, reason: "blocked" };
  return { ok: true, addresses: records.map((r) => r.address).sort() };
}
