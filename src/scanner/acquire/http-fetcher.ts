/**
 * The network fetcher: fixed headers, manual redirects (the acquirer follows
 * hops), body caps, timeouts, TLS outcomes and SSRF protection.
 */

import { resolveTxt } from "node:dns/promises";
import type { DnsRecord, TlsRecord } from "../snapshot/types.js";
import { resolvePublic } from "./ssrf.js";
import { FIXED_ACCEPT, FIXED_ACCEPT_ENCODING, TOTAL_TIMEOUT_MS, scannerUserAgent, type FetchRequest, type FetchResult, type Fetcher } from "./types.js";

function tlsErrorCode(error: unknown): string {
  const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code ?? "";
  switch (code) {
    case "CERT_HAS_EXPIRED":
      return "expired";
    case "CERT_NOT_YET_VALID":
      return "not_yet_valid";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "hostname_mismatch";
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
    case "CERT_UNTRUSTED":
      return "untrusted_chain";
    default:
      return "handshake_failed";
  }
}

function isTlsError(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code ?? "";
  return /CERT|TLS|SSL|ALTNAME/i.test(code) || /certificate|SSL|TLS/i.test(String((error as Error)?.cause ?? (error as Error)?.message ?? ""));
}

async function readCapped(response: Response, maxBytes: number): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!response.body) return { body: new Uint8Array(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (received + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - received));
        received = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, truncated };
}

export class HttpFetcher implements Fetcher {
  private readonly userAgent: string;
  private readonly tlsByOrigin = new Map<string, TlsRecord>();

  constructor(scannerVersion: string, private readonly timeoutMs = TOTAL_TIMEOUT_MS) {
    this.userAgent = scannerUserAgent(scannerVersion);
  }

  async resolve(hostname: string): Promise<DnsRecord> {
    const resolved = await resolvePublic(hostname);
    let txt: string[] = [];
    try {
      txt = (await resolveTxt(hostname)).map((parts) => parts.join("")).sort();
    } catch {
      txt = [];
    }
    return { resolves: resolved.ok, addresses: resolved.ok ? resolved.addresses : [], txt };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    const url = new URL(request.url);
    const resolved = await resolvePublic(url.hostname);
    if (!resolved.ok) {
      return { outcome: resolved.reason === "blocked" ? "connection_error" : "dns_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: resolved.reason === "blocked" ? "address_blocked" : "dns_error" };
    }
    const headers: Record<string, string> = {
      "user-agent": request.userAgent ?? this.userAgent,
      accept: FIXED_ACCEPT,
      "accept-encoding": FIXED_ACCEPT_ENCODING,
    };
    for (const [name, value] of request.extraHeaders ?? []) headers[name] = value;
    let response: Response;
    try {
      response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(this.timeoutMs), headers });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return { outcome: "timeout", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: "timeout" };
      if (url.protocol === "https:" && isTlsError(error)) {
        const code = tlsErrorCode(error);
        const tls: TlsRecord = { valid: false, error: code, not_before: null, not_after: null, subject: null, issuer: null };
        this.tlsByOrigin.set(url.origin, tls);
        return { outcome: "tls_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: code, tls };
      }
      const code = (error as { cause?: { code?: string } })?.cause?.code ?? "";
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { outcome: "dns_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: "dns_error" };
      return { outcome: "connection_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: code ? code.toLowerCase() : "connection_error" };
    }
    const headerList: [string, string][] = [];
    response.headers.forEach((value, name) => headerList.push([name.toLowerCase(), value]));
    // The timeout covers the whole request (PRODUCT.md §5.2), so it can expire while the
    // body streams. That is this URL's timeout, retried once like any other, never the scan's.
    let body: Uint8Array;
    let truncated: boolean;
    try {
      ({ body, truncated } = await readCapped(response, request.maxBytes));
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return { outcome: "timeout", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: "timeout" };
      const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code ?? (error as { code?: string })?.code ?? "";
      return { outcome: "connection_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: code ? code.toLowerCase() : "connection_error" };
    }
    const contentLength = response.headers.get("content-length");
    const tls: TlsRecord | undefined = url.protocol === "https:" ? this.tlsByOrigin.get(url.origin) ?? { valid: true, error: null, not_before: null, not_after: null, subject: null, issuer: null } : undefined;
    if (tls) this.tlsByOrigin.set(url.origin, tls);
    return {
      outcome: "response",
      status: response.status,
      headers: headerList,
      body,
      sizeCompressed: contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : null,
      truncated,
      errorCode: null,
      tls,
    };
  }
}
