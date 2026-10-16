/**
 * Private, loopback, link-local and cloud metadata address blocking (PRODUCT.md §13).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip;
  const tail: number[] = [];
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const parts = dotted[2]!.split(".").map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p > 255)) return null;
    tail.push((parts[0]! << 8) | parts[1]!, (parts[2]! << 8) | parts[3]!);
    text = dotted[1]!.endsWith("::") ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const known = head.length + rest.length + tail.length;
  if ([...head, ...rest].some(Number.isNaN)) return null;
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  return [...head, ...new Array<number>(8 - known).fill(0), ...rest, ...tail];
}

/**
 * The IPv4 address an IPv6 address carries in its last 32 bits when it is
 * IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) or NAT64 (64:ff9b::/96),
 * in any notation: Node writes ::ffff:127.0.0.1 as ::ffff:7f00:1.
 */
function embeddedIpv4(groups: number[]): string | null {
  const prefix = groups.slice(0, 6);
  const zeros = (n: number) => prefix.slice(0, n).every((g) => g === 0);
  const mapped = zeros(5) && prefix[5] === 0xffff;
  const compatible = zeros(6);
  const nat64 = prefix[0] === 0x64 && prefix[1] === 0xff9b && prefix.slice(2).every((g) => g === 0);
  if (!mapped && !compatible && !nat64) return null;
  const [hi, lo] = [groups[6]!, groups[7]!];
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

export function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  let value = ip;
  if (ip.includes(":")) {
    const groups = ipv6Groups(ip);
    // Not a parseable IPv6 address: refuse rather than guess.
    if (!groups) return true;
    if (groups.every((g) => g === 0) || (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1)) return true;
    value = embeddedIpv4(groups) ?? ip;
  }
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
