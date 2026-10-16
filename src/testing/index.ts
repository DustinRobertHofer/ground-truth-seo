/**
 * In-memory sites for fixtures: the real acquirer runs against a fake fetcher,
 * so fixtures exercise acquisition and evaluation alike.
 */

import { acquire, type AcquireFocus } from "../scanner/acquire/crawl.js";
import type { FetchRequest, FetchResult, Fetcher } from "../scanner/acquire/types.js";
import { resolveConfig, type ScanConfig, type ScanConfigInput } from "../scanner/config.js";
import { evaluate, SCANNER_VERSION } from "../scanner/evaluate/index.js";
import type { Report } from "../scanner/report/types.js";
import type { DnsRecord, Snapshot, TlsRecord } from "../scanner/snapshot/types.js";

export interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** A non-response outcome. */
  outcome?: "dns_error" | "tls_error" | "timeout" | "connection_error";
  errorCode?: string;
}

export interface FakeSite {
  /** Responses by absolute URL (comparison-key form). */
  responses: Record<string, FakeResponse | string>;
  /** Hostnames that resolve; defaults to every host in `responses`. */
  hosts?: Record<string, Partial<DnsRecord>>;
  tls?: Record<string, TlsRecord>;
  /** Default status for unknown URLs. */
  fallbackStatus?: number;
}

export const FIXED_NOW = "2026-10-03T12:00:00Z";

export function html(head: string, body = "<h1>Page</h1><p>Hello.</p>"): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

export function page(title: string, extraHead = "", body?: string): FakeResponse {
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: html(`<title>${title}</title>${extraHead}`, body) };
}

export function redirect(to: string, status = 301): FakeResponse {
  return { status, headers: { location: to }, body: "" };
}

export function text(body: string, contentType = "text/plain; charset=utf-8", status = 200): FakeResponse {
  return { status, headers: { "content-type": contentType }, body };
}

export function xml(body: string): FakeResponse {
  return { status: 200, headers: { "content-type": "application/xml" }, body };
}

/** A minimal valid 16×16 PNG (header only is enough for dimension reading). */
export function png(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  out[24] = 8;
  out[25] = 6;
  return out;
}

export function image(bytes: Uint8Array, contentType = "image/png"): FakeResponse {
  return { status: 200, headers: { "content-type": contentType }, body: bytes };
}

export class MemoryFetcher implements Fetcher {
  constructor(private readonly site: FakeSite) {}

  async resolve(hostname: string): Promise<DnsRecord> {
    const hosts = this.site.hosts;
    if (hosts) {
      const record = hosts[hostname];
      if (!record) return { resolves: false, addresses: [], txt: [] };
      return { resolves: record.resolves ?? true, addresses: record.addresses ?? ["93.184.216.34"], txt: record.txt ?? [] };
    }
    const known = new Set(Object.keys(this.site.responses).map((u) => new URL(u).hostname));
    return known.has(hostname) ? { resolves: true, addresses: ["93.184.216.34"], txt: [] } : { resolves: false, addresses: [], txt: [] };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const dns = await this.resolve(hostname);
    if (!dns.resolves) return { outcome: "dns_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: "dns_error" };
    const tls = url.protocol === "https:" ? this.site.tls?.[url.origin] ?? { valid: true, error: null, not_before: null, not_after: null, subject: null, issuer: null } : undefined;
    if (tls && !tls.valid) return { outcome: "tls_error", status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: tls.error ?? "handshake_failed", tls };
    const raw = this.site.responses[request.url] ?? this.site.responses[request.url.replace(/\/$/, "")];
    const response: FakeResponse = raw === undefined ? { status: this.site.fallbackStatus ?? 404, headers: { "content-type": "text/html" }, body: "<html><head><title>Not found</title></head><body>Not found</body></html>" } : typeof raw === "string" ? { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: raw } : raw;
    if (response.outcome) return { outcome: response.outcome, status: null, headers: [], body: null, sizeCompressed: null, truncated: false, errorCode: response.errorCode ?? response.outcome, tls };
    const bodyBytes = typeof response.body === "string" ? new TextEncoder().encode(response.body) : response.body ?? new Uint8Array(0);
    const truncated = bodyBytes.length > request.maxBytes;
    const body = truncated ? bodyBytes.subarray(0, request.maxBytes) : bodyBytes;
    const headers: [string, string][] = Object.entries(response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]);
    return { outcome: "response", status: response.status ?? 200, headers, body, sizeCompressed: null, truncated, errorCode: null, tls };
  }
}

export async function snapshotOf(site: FakeSite, input: ScanConfigInput, now = FIXED_NOW, focus?: AcquireFocus): Promise<{ snapshot: Snapshot; config: ScanConfig }> {
  const config = resolveConfig(input);
  const snapshot = await acquire(config, { fetcher: new MemoryFetcher(site), now: () => new Date(now), scannerVersion: SCANNER_VERSION, caBundleVersion: "fixture", focus });
  return { snapshot, config };
}

export async function reportOf(site: FakeSite, input: ScanConfigInput, now = FIXED_NOW): Promise<{ report: Report; snapshot: Snapshot; config: ScanConfig }> {
  const { snapshot, config } = await snapshotOf(site, input, now);
  return { report: evaluate(snapshot, config), snapshot, config };
}

/** Findings of one rule, optionally filtered by status. */
export function findingsOf(report: Report, ruleId: string, status?: string) {
  return report.findings.filter((f) => f.rule_id === ruleId && (status === undefined || f.status === status));
}

/** Fail and opportunity condition codes of one rule: everything that counts against the score. */
export function conditionsOf(report: Report, ruleId: string): string[] {
  return [...new Set(report.findings.filter((f) => f.rule_id === ruleId && (f.status === "fail" || f.status === "opportunity")).map((f) => f.condition!))].sort();
}

/** A small, fully conforming site used as the baseline of many fixtures. */
export function baselineSite(origin = "https://www.example.com"): FakeSite {
  const home = `${origin}/`;
  const favicon = png(96, 96);
  const responses: Record<string, FakeResponse | string> = {
    [`${origin}/robots.txt`]: text(`User-agent: *\nDisallow: /private/\nSitemap: ${origin}/sitemap.xml\n`),
    [`${origin}/sitemap.xml`]: xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${home}</loc><lastmod>2026-09-01T10:00:00+00:00</lastmod></url>\n<url><loc>${origin}/about</loc><lastmod>2026-09-02T10:00:00+00:00</lastmod></url>\n<url><loc>${origin}/contact</loc><lastmod>2026-09-03T10:00:00+00:00</lastmod></url>\n</urlset>\n`),
    [home]: page("Example Home", `<link rel="canonical" href="${home}"><link rel="icon" href="/favicon.png"><meta name="description" content="The example home page."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"${home}"}</script>`, `<h1>Example</h1><p>Welcome.</p><a href="/about">About the company</a> <a href="/contact">Contact us</a> <img src="/photo.png" alt="Office" width="100" height="100">`),
    [`${origin}/about`]: page("About Example", `<link rel="canonical" href="${origin}/about"><meta name="description" content="About the example company."><meta name="viewport" content="width=device-width">`, `<h1>About</h1><p>Text.</p><a href="/">Home page</a> <a href="/contact">Contact us</a>`),
    [`${origin}/contact`]: page("Contact Example", `<link rel="canonical" href="${origin}/contact"><meta name="description" content="How to contact the example company."><meta name="viewport" content="width=device-width">`, `<h1>Contact</h1><p>Text.</p><a href="/">Home page</a> <a href="/about">About the company</a>`),
    [`${origin}/favicon.png`]: image(favicon),
    [`${origin}/photo.png`]: image(png(100, 100)),
  };
  // Every other scheme/host variant redirects to the preferred origin.
  const bare = new URL(origin).hostname.replace(/^www\./, "");
  for (const variant of [`http://${bare}`, `http://www.${bare}`, `https://${bare}`, `https://www.${bare}`]) {
    if (variant === origin) continue;
    responses[`${variant}/`] = redirect(home);
    responses[`${variant}/about`] = redirect(`${origin}/about`);
    responses[`${variant}/robots.txt`] = text("User-agent: *\nAllow: /\n");
  }
  return { responses };
}

