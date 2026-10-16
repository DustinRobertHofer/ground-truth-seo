/**
 * The snapshot: the boundary between the unpredictable world and the
 * deterministic evaluator (PRODUCT.md §5.4).
 */

export type ExchangeOutcome =
  | "response"
  | "dns_error"
  | "tls_error"
  | "timeout"
  | "connection_error"
  | "blocked_by_robots_policy";

/**
 * Why a request was made. Used to pick the primary exchange for a URL and to
 * keep diagnostic re-requests (conditional, parity) out of redirect chains.
 */
export type ExchangePurpose =
  | "robots"
  | "start"
  | "variant_probe"
  | "probe_404"
  | "sitemap"
  | "crawl"
  | "sitemap_url"
  | "extra"
  | "variant_sample"
  | "favicon"
  | "logo"
  | "image"
  | "resource"
  | "llms"
  | "conditional"
  | "indexnow"
  | "staging"
  | "parity_mobile"
  | "parity_desktop"
  /** Security checker only (PRODUCT.md §20): fixed file paths, same-site scripts and their source maps. */
  | "exposure"
  | "script"
  | "source_map";

export interface Exchange {
  /** Sequence number assigned after acquisition by (phase, normalized URL, attempt). */
  seq: number;
  phase: number;
  purpose: ExchangePurpose;
  request: {
    url: string;
    method: "GET";
    headers: [string, string][];
  };
  outcome: ExchangeOutcome;
  status: number | null;
  /** Response header names lowercased, original order preserved. */
  headers: [string, string][];
  size_compressed: number | null;
  size_uncompressed: number | null;
  truncated: boolean;
  body_sha256: string | null;
  /** A value from the versioned error enumeration, for non-response outcomes. */
  error_code: string | null;
  attempt: number;
}

export interface TlsRecord {
  valid: boolean;
  /** Versioned enumeration: expired, not_yet_valid, hostname_mismatch, untrusted_chain, handshake_failed. */
  error: string | null;
  not_before: string | null;
  not_after: string | null;
  subject: string | null;
  issuer: string | null;
}

export interface DnsRecord {
  resolves: boolean;
  addresses: string[];
  txt: string[];
}

export interface SitemapSource {
  url: string;
  /** Where the sitemap URL came from. */
  found_by: "robots" | "config" | "convention" | "index";
  /** For index children, the index that listed them. */
  parent: string | null;
}

export interface Snapshot {
  format: 1;
  scanner_version: string;
  start_url: string;
  preferred_origin: string;
  /** Final URL of the start URL after redirects, if it resolved. */
  start_final_url: string | null;
  robots_mode: "respect" | "owner";
  owner_verified: boolean;
  /** The single clock reading, ISO 8601 UTC. */
  completed_at: string;
  truncated: boolean;
  truncation_limits: string[];
  /** Variant origins that resolved in DNS (probed, never crawled). */
  variant_origins: string[];
  probe_404_url: string;
  sitemaps: SitemapSource[];
  /** Pages the link crawl reached, with the depth at which each was first seen. */
  crawl: { url: string; depth: number }[];
  exchanges: Exchange[];
  /** Bodies, content-addressed by SHA-256, base64 encoded. */
  bodies: Record<string, string>;
  tls: Record<string, TlsRecord>;
  dns: Record<string, DnsRecord>;
  /** Rendered DOM per URL when rendering was enabled. */
  rendered: Record<string, string> | null;
  /** CrUX API responses per (origin or url) when configured. */
  crux: Record<string, unknown> | null;
  ca_bundle_version: string;
  fetch_policy: {
    user_agent: string;
    connect_timeout_ms: number;
    total_timeout_ms: number;
    body_caps: Record<string, number>;
  };
  /** SHA-256 of the canonical serialization of the manifest (everything above except snapshot_id). */
  snapshot_id: string;
}
