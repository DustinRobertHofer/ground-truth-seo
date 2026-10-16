/**
 * Collects exchanges during acquisition and freezes them into a Snapshot.
 */

import { comparisonKey } from "../evaluate/core/url.js";
import { compareBytes } from "../evaluate/core/text.js";
import { base64Encode } from "./access.js";
import { canonicalize } from "./canonical-json.js";
import { sha256Hex } from "./sha256.js";
import type { DnsRecord, Exchange, ExchangePurpose, SitemapSource, Snapshot, TlsRecord } from "./types.js";

export interface RecordedExchange {
  phase: number;
  purpose: ExchangePurpose;
  url: string;
  requestHeaders: [string, string][];
  outcome: Exchange["outcome"];
  status: number | null;
  headers: [string, string][];
  body: Uint8Array | null;
  sizeCompressed: number | null;
  truncated: boolean;
  errorCode: string | null;
  attempt: number;
}

export class SnapshotBuilder {
  private readonly exchanges: RecordedExchange[] = [];
  private readonly bodies = new Map<string, string>();
  private readonly hashes = new Map<RecordedExchange, string | null>();
  readonly tls: Record<string, TlsRecord> = {};
  readonly dns: Record<string, DnsRecord> = {};
  readonly sitemaps: SitemapSource[] = [];
  readonly crawl: { url: string; depth: number }[] = [];
  readonly truncationLimits: string[] = [];
  variantOrigins: string[] = [];
  startFinalUrl: string | null = null;
  preferredOrigin = "";
  probe404Url = "";
  ownerVerified = false;
  rendered: Record<string, string> | null = null;
  crux: Record<string, unknown> | null = null;

  record(exchange: RecordedExchange): void {
    this.exchanges.push(exchange);
    let hash: string | null = null;
    if (exchange.body !== null) {
      hash = sha256Hex(exchange.body);
      if (!this.bodies.has(hash)) this.bodies.set(hash, base64Encode(exchange.body));
    }
    this.hashes.set(exchange, hash);
  }

  /** Attempts already recorded for a URL in a phase. */
  attemptsFor(url: string, phase: number): number {
    const key = comparisonKey(url) ?? url;
    return this.exchanges.filter((e) => e.phase === phase && (comparisonKey(e.url) ?? e.url) === key).length;
  }

  finalize(input: {
    scannerVersion: string;
    startUrl: string;
    robotsMode: "respect" | "owner";
    completedAt: string;
    truncated: boolean;
    caBundleVersion: string;
    fetchPolicy: Snapshot["fetch_policy"];
  }): Snapshot {
    const sorted = [...this.exchanges].sort((a, b) => {
      if (a.phase !== b.phase) return a.phase - b.phase;
      const ka = comparisonKey(a.url) ?? a.url;
      const kb = comparisonKey(b.url) ?? b.url;
      const c = compareBytes(ka, kb);
      if (c !== 0) return c;
      if (a.attempt !== b.attempt) return a.attempt - b.attempt;
      return compareBytes(a.purpose, b.purpose);
    });
    const exchanges: Exchange[] = sorted.map((e, index) => ({
      seq: index + 1,
      phase: e.phase,
      purpose: e.purpose,
      request: { url: e.url, method: "GET", headers: e.requestHeaders },
      outcome: e.outcome,
      status: e.status,
      headers: e.headers,
      size_compressed: e.sizeCompressed,
      size_uncompressed: e.body ? e.body.length : null,
      truncated: e.truncated,
      body_sha256: this.hashes.get(e) ?? null,
      error_code: e.errorCode,
      attempt: e.attempt,
    }));
    const manifest: Omit<Snapshot, "snapshot_id" | "bodies"> = {
      format: 1,
      scanner_version: input.scannerVersion,
      start_url: input.startUrl,
      preferred_origin: this.preferredOrigin,
      start_final_url: this.startFinalUrl,
      robots_mode: input.robotsMode,
      owner_verified: this.ownerVerified,
      completed_at: input.completedAt,
      truncated: input.truncated,
      truncation_limits: [...this.truncationLimits].sort(),
      variant_origins: [...this.variantOrigins].sort(compareBytes),
      probe_404_url: this.probe404Url,
      sitemaps: [...this.sitemaps].sort((a, b) => compareBytes(a.url, b.url)),
      crawl: [...this.crawl].sort((a, b) => compareBytes(a.url, b.url)),
      exchanges,
      tls: sortRecord(this.tls),
      dns: sortRecord(this.dns),
      rendered: this.rendered,
      crux: this.crux,
      ca_bundle_version: input.caBundleVersion,
      fetch_policy: input.fetchPolicy,
    };
    const snapshot_id = sha256Hex(canonicalize(manifest));
    const bodies: Record<string, string> = {};
    for (const key of [...this.bodies.keys()].sort()) bodies[key] = this.bodies.get(key)!;
    return { ...manifest, bodies, snapshot_id };
  }
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort(compareBytes)) out[key] = record[key]!;
  return out;
}

/** Recompute a snapshot's id from its manifest (used by tests). */
export function snapshotIdOf(snapshot: Snapshot): string {
  const { snapshot_id, bodies, ...manifest } = snapshot;
  void snapshot_id;
  void bodies;
  return sha256Hex(canonicalize(manifest));
}
