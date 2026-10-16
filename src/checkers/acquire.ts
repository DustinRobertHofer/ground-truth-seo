import { acquire } from "../scanner/acquire/crawl.js";
import type { FetchRequest, FetchResult, Fetcher } from "../scanner/acquire/types.js";
import { resolveConfig, type ScanConfig } from "../scanner/config.js";
import { SCANNER_VERSION } from "../scanner/evaluate/index.js";
import type { DnsRecord, Snapshot } from "../scanner/snapshot/types.js";
import type { CheckerConfig } from "./config.js";
import { checkerInput } from "./run.js";

const STOPPED: FetchResult = { outcome: "timeout", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: "check_stopped" };

/**
 * A fetcher that stops touching the network once `signal` aborts: pending and
 * later requests answer at once, so the crawl winds down in moments instead of
 * running past the check's deadline. A stopped check's snapshot is discarded.
 */
export class StoppableFetcher implements Fetcher {
  private readonly stopped: Promise<FetchResult>;

  constructor(
    private readonly inner: Fetcher,
    private readonly signal: AbortSignal,
  ) {
    this.stopped = new Promise((resolve) => {
      if (signal.aborted) resolve(STOPPED);
      else signal.addEventListener("abort", () => resolve(STOPPED), { once: true });
    });
  }

  fetch(request: FetchRequest): Promise<FetchResult> {
    if (this.signal.aborted) return Promise.resolve(STOPPED);
    return Promise.race([this.inner.fetch(request), this.stopped]);
  }

  resolve(hostname: string): Promise<DnsRecord> {
    const none: DnsRecord = { resolves: false, addresses: [], txt: [] };
    if (this.signal.aborted) return Promise.resolve(none);
    return Promise.race([this.inner.resolve(hostname), this.stopped.then(() => none)]);
  }
}

export interface CheckAcquisition {
  config: ScanConfig;
  snapshot: Snapshot;
  /** The deadline passed or the client left before acquisition finished. */
  stopped: boolean;
}

/**
 * Acquisition for one check, bounded in time as well as in pages: after
 * `deadlineMs`, or when `signal` aborts, every remaining request is skipped.
 */
export async function acquireForCheck(
  checker: CheckerConfig,
  url: string,
  options: { fetcher: Fetcher; deadlineMs: number; signal?: AbortSignal; onProgress?: (message: string) => void; now?: () => Date },
): Promise<CheckAcquisition> {
  const config = resolveConfig(checkerInput(checker, url));
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), options.deadlineMs);
  const onAbort = () => stop.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const snapshot = await acquire(config, {
      fetcher: new StoppableFetcher(options.fetcher, stop.signal),
      now: options.now ?? (() => new Date()),
      scannerVersion: SCANNER_VERSION,
      onProgress: options.onProgress,
      focus: checker.focus,
    });
    return { config, snapshot, stopped: stop.signal.aborted };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
