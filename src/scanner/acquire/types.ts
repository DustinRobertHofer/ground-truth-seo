import type { DnsRecord, ExchangeOutcome, ExchangePurpose, TlsRecord } from "../snapshot/types.js";

export interface FetchRequest {
  url: string;
  purpose: ExchangePurpose;
  maxBytes: number;
  /** Extra request headers beyond the fixed set (conditional requests, parity UAs). */
  extraHeaders?: [string, string][];
  userAgent?: string;
}

export interface FetchResult {
  outcome: ExchangeOutcome;
  status: number | null;
  /** Lowercased names, original order. */
  headers: [string, string][];
  body: Uint8Array | null;
  sizeCompressed: number | null;
  truncated: boolean;
  errorCode: string | null;
  /** TLS validation result for the origin, when the fetcher knows it. */
  tls?: TlsRecord;
}

/** The only component allowed to touch the network. Fixtures implement it in memory. */
export interface Fetcher {
  fetch(request: FetchRequest): Promise<FetchResult>;
  resolve(hostname: string): Promise<DnsRecord>;
}

export const BODY_CAPS = {
  html: 10 * 1024 * 1024,
  sitemap: 60 * 1024 * 1024,
  robots: 1024 * 1024,
  image: 512 * 1024,
  text: 1024 * 1024,
} as const;

export const SCANNER_INFO_URL = "https://github.com/DustinRobertHofer/seo-scanner";
export const SCANNER_TOKEN = "GroundTruthSEOScanner";

export function scannerUserAgent(version: string): string {
  return `${SCANNER_TOKEN}/${version} (+${SCANNER_INFO_URL})`;
}

export const FIXED_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
export const FIXED_ACCEPT_ENCODING = "gzip, deflate, br";
export const CONNECT_TIMEOUT_MS = 10_000;
export const TOTAL_TIMEOUT_MS = 30_000;
