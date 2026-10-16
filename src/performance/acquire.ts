/**
 * Acquisition for the home page performance diagnostics (PRODUCT.md §22.2,
 * KNOWLEDGE.md §13.2): the Chrome UX Report record of the home page (or the
 * origin) on phones and desktops, and one PageSpeed Insights lab run per
 * strategy. Everything is normalized to integers here, so the diagnosis never
 * sees a floating point value. Keys go into request URLs only: never into a
 * stored input, an error or anything returned.
 */

import type { FieldMetricId, SubpartKey } from "./knowledge.js";
import { BFCACHE_ACTIONABLE, CLS_CAUSES, METRICS } from "./knowledge.js";
import type {
  FieldInput,
  FieldMetric,
  FieldRecord,
  FormFactor,
  HistogramBin,
  InputError,
  LabInput,
  LabNode,
  LabRun,
  PerformanceInput,
  Strategy,
} from "./types.js";

export const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
export const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const FORM_FACTORS: readonly FormFactor[] = ["PHONE", "DESKTOP"];
const STRATEGIES: readonly Strategy[] = ["mobile", "desktop"];

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The PageSpeed Insights key: PAGESPEED_API_KEY, else CRUX_API_KEY (KNOWLEDGE.md §13.2). */
export function pagespeedApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.PAGESPEED_API_KEY?.trim() || env.CRUX_API_KEY?.trim();
  return key ? key : null;
}

// ---------------------------------------------------------------------------
// Number normalization (acquisition only)
// ---------------------------------------------------------------------------

function int(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** A decimal ("0.05", 0.0512 or "1") as integer units of 10^-digits, without floating point arithmetic on the digits. */
function scaled(value: unknown, digits: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = typeof value === "number" ? value.toString() : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (match) {
    const frac = (match[2] ?? "").padEnd(digits + 1, "0");
    const head = Number(match[1]) * 10 ** digits + Number(frac.slice(0, digits));
    // Round half up on the first dropped digit.
    return Number(frac[digits]) >= 5 ? head + 1 : head;
  }
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10 ** digits) : null;
}

const thousandths = (value: unknown) => scaled(value, 3);
const basisPoints = (value: unknown) => scaled(value, 4);

// ---------------------------------------------------------------------------
// Chrome UX Report
// ---------------------------------------------------------------------------

interface CruxDate {
  year?: number;
  month?: number;
  day?: number;
}

interface CruxApiMetric {
  histogram?: { start?: number | string; end?: number | string; density?: number | string }[];
  percentiles?: { p75?: number | string };
  fractions?: Record<string, number | string>;
}

export interface CruxApiResponse {
  record?: {
    key?: { origin?: string; url?: string; formFactor?: string };
    metrics?: Record<string, CruxApiMetric | undefined>;
    collectionPeriod?: { firstDate?: CruxDate; lastDate?: CruxDate };
  };
}

function isoDate(d: CruxDate | undefined): string {
  if (!d || d.year === undefined || d.month === undefined || d.day === undefined) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

function fieldMetric(metric: CruxApiMetric | undefined, cls: boolean): FieldMetric | null {
  if (!metric) return null;
  const read = cls ? thousandths : int;
  const bins: HistogramBin[] = [];
  for (const bin of metric.histogram ?? []) {
    const start = read(bin.start ?? 0);
    const density = basisPoints(bin.density ?? 0);
    if (start === null || density === null) continue;
    bins.push({ start, end: bin.end === undefined ? null : read(bin.end), density_bp: density });
  }
  return { p75: read(metric.percentiles?.p75), bins };
}

const SUBPART_METRICS: Record<SubpartKey, string> = {
  ttfb: "largest_contentful_paint_image_time_to_first_byte",
  load_delay: "largest_contentful_paint_image_resource_load_delay",
  load_duration: "largest_contentful_paint_image_resource_load_duration",
  render_delay: "largest_contentful_paint_image_element_render_delay",
};

/** One CrUX API answer as a FieldRecord, or null when it carries no metrics. */
export function normalizeCruxRecord(scope: "url" | "origin", target: string, formFactor: FormFactor, body: CruxApiResponse): FieldRecord | null {
  const record = body.record;
  if (!record?.metrics) return null;
  const m = record.metrics;
  const metrics = {} as Record<FieldMetricId, FieldMetric | null>;
  for (const def of METRICS) {
    if (def.id === "TBT" || def.fieldInput === null) continue;
    metrics[def.id] = fieldMetric(m[def.fieldInput], def.id === "CLS");
  }
  const lcp_subparts = {} as Record<SubpartKey, number | null>;
  for (const [key, name] of Object.entries(SUBPART_METRICS) as [SubpartKey, string][]) lcp_subparts[key] = int(m[name]?.percentiles?.p75);
  const fractions = m.largest_contentful_paint_resource_type?.fractions;
  let lcp_resource_type: Record<string, number> | null = null;
  if (fractions) {
    lcp_resource_type = {};
    for (const key of Object.keys(fractions).sort()) {
      const bp = basisPoints(fractions[key]);
      if (bp !== null) lcp_resource_type[key] = bp;
    }
  }
  return {
    scope,
    target,
    form_factor: formFactor,
    first_date: isoDate(record.collectionPeriod?.firstDate),
    last_date: isoDate(record.collectionPeriod?.lastDate),
    metrics,
    lcp_subparts,
    lcp_resource_type,
  };
}

function errorOf(error: unknown): InputError {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { kind: "timeout" };
  return { kind: "network" };
}

async function queryCrux(fetchImpl: FetchLike, key: string, body: object, timeoutMs: number, signal?: AbortSignal): Promise<{ status: number; json: CruxApiResponse | null }> {
  const response = await fetchImpl(`${CRUX_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return { status: response.status, json: null };
  try {
    return { status: response.status, json: (await response.json()) as CruxApiResponse };
  } catch {
    return { status: response.status, json: null };
  }
}

/** The home page's record per form factor, else the origin's (KNOWLEDGE.md §13.2). A 404 means no data. */
export async function acquireField(homeUrl: string, origin: string, key: string, options: { fetch?: FetchLike; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<FieldInput[]> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return Promise.all(
    FORM_FACTORS.map(async (formFactor): Promise<FieldInput> => {
      try {
        for (const [scope, target] of [["url", homeUrl], ["origin", origin]] as const) {
          const { status, json } = await queryCrux(fetchImpl, key, scope === "url" ? { url: target, formFactor } : { origin: target, formFactor }, timeoutMs, options.signal);
          if (status === 404) continue;
          if (status < 200 || status > 299) return { form_factor: formFactor, status: "failed", record: null, error: { kind: "http", status } };
          const record = json ? normalizeCruxRecord(scope, target, formFactor, json) : null;
          if (!record) return { form_factor: formFactor, status: "failed", record: null, error: { kind: "invalid" } };
          return { form_factor: formFactor, status: "ok", record, error: null };
        }
        return { form_factor: formFactor, status: "none", record: null, error: null };
      } catch (error) {
        return { form_factor: formFactor, status: "failed", record: null, error: errorOf(error) };
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// PageSpeed Insights (Lighthouse)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- Lighthouse results are read defensively, field by field. */
type Json = any;

function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function arr(value: unknown): Json[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nodeOf(value: unknown): LabNode | null {
  const node = obj(value);
  if (!node || node.type !== "node") return null;
  const selector = str(node.selector) ?? str(node.nodeLabel);
  return selector ? { selector, snippet: str(node.snippet) ?? "" } : null;
}

/** An audit that produced a result: present, not an error, and applicable. */
function auditOf(lhr: Json, id: string): Json | null {
  const audit = obj(obj(lhr.audits)?.[id]);
  if (!audit) return null;
  if (audit.scoreDisplayMode === "error" || audit.scoreDisplayMode === "notApplicable") return null;
  return audit;
}

function tableItems(lhr: Json, id: string): Json[] | null {
  const audit = auditOf(lhr, id);
  if (!audit) return null;
  return arr(obj(audit.details)?.items);
}

const SUBPART_LAB: Record<string, SubpartKey> = {
  timeToFirstByte: "ttfb",
  resourceLoadDelay: "load_delay",
  resourceLoadDuration: "load_duration",
  elementRenderDelay: "render_delay",
};

function lcpBreakdown(lhr: Json): { breakdown: Record<SubpartKey, number> | null; element: LabNode | null } {
  const audit = auditOf(lhr, "lcp-breakdown-insight");
  if (!audit) return { breakdown: null, element: null };
  let breakdown: Record<SubpartKey, number> | null = null;
  let element: LabNode | null = null;
  for (const item of arr(obj(audit.details)?.items)) {
    if (item?.type === "table") {
      breakdown = { ttfb: 0, load_delay: 0, load_duration: 0, render_delay: 0 };
      for (const row of arr(item.items)) {
        const key = SUBPART_LAB[str(row?.subpart) ?? ""];
        const ms = int(row?.duration);
        if (key && ms !== null) breakdown[key] = ms;
      }
    } else element = element ?? nodeOf(item);
  }
  return { breakdown, element };
}

function lcpDiscovery(lhr: Json): LabRun["lcp_discovery"] {
  const audit = auditOf(lhr, "lcp-discovery-insight");
  if (!audit) return null;
  const checklist = arr(obj(audit.details)?.items).find((i) => i?.type === "checklist");
  const items = obj(checklist?.items);
  if (!items) return null;
  return {
    eagerly_loaded: bool(obj(items.eagerlyLoaded)?.value),
    discoverable: bool(obj(items.requestDiscoverable)?.value),
    priority_hinted: bool(obj(items.priorityHinted)?.value),
  };
}

function documentLatency(lhr: Json): LabRun["document_latency"] {
  const audit = auditOf(lhr, "document-latency-insight");
  const details = obj(audit?.details);
  if (!details) return null;
  const items = obj(details.items) ?? {};
  const debug = obj(details.debugData) ?? {};
  return {
    no_redirects: bool(obj(items.noRedirects)?.value),
    redirect_ms: int(debug.redirectDuration),
    server_fast: bool(obj(items.serverResponseIsFast)?.value),
    server_ms: int(debug.serverResponseTime),
  };
}

function sourceLocation(value: unknown): string | null {
  const source = obj(value);
  if (!source || source.type !== "source-location") return null;
  const url = str(source.url);
  if (!url) return null;
  const line = int(source.line);
  const column = int(source.column);
  return line === null ? url : `${url}:${line + 1}:${(column ?? 0) + 1}`;
}

function forcedReflow(lhr: Json): LabRun["forced_reflow"] {
  const audit = auditOf(lhr, "forced-reflow-insight");
  if (!audit) return null;
  // The list holds an optional top-function table, then the bottom-up table by source.
  const tables = arr(obj(audit.details)?.items).filter((i) => i?.type === "table");
  const table = tables[tables.length - 1];
  const out: { source: string; reflow_ms: number | null }[] = [];
  for (const row of arr(table?.items)) {
    const source = sourceLocation(row?.source);
    if (source) out.push({ source, reflow_ms: int(row?.reflowTime) });
  }
  return out;
}

function layoutShifts(lhr: Json): LabRun["layout_shifts"] {
  const audit = auditOf(lhr, "cls-culprits-insight");
  if (!audit) return null;
  const elements: (LabNode & { score_thousandths: number })[] = [];
  const causes: Record<string, number> = {};
  for (const table of arr(obj(audit.details)?.items)) {
    if (table?.type !== "table") continue;
    for (const row of arr(table.items)) {
      const node = nodeOf(row?.node);
      if (!node) continue;
      elements.push({ ...node, score_thousandths: thousandths(row?.score) ?? 0 });
      for (const sub of arr(obj(row?.subItems)?.items)) {
        const cause = str(sub?.cause);
        if (cause && CLS_CAUSES.some((c) => c.cause === cause)) causes[cause] = (causes[cause] ?? 0) + 1;
      }
    }
  }
  return { elements, causes };
}

/** One Lighthouse result (`lighthouseResult` of a PageSpeed Insights answer) as a LabRun. */
export function normalizeLighthouse(lhr: Json, strategy: Strategy, requestedUrl: string): LabRun {
  const numeric = (id: string) => int(auditOf(lhr, id)?.numericValue);
  const { breakdown, element } = lcpBreakdown(lhr);
  const renderBlocking = auditOf(lhr, "render-blocking-insight");
  return {
    strategy,
    lighthouse_version: str(lhr.lighthouseVersion) ?? "",
    requested_url: requestedUrl,
    final_url: str(lhr.finalDisplayedUrl) ?? str(lhr.finalUrl) ?? requestedUrl,
    fetch_time: str(lhr.fetchTime) ?? "",
    metrics: {
      fcp_ms: numeric("first-contentful-paint"),
      lcp_ms: numeric("largest-contentful-paint"),
      tbt_ms: numeric("total-blocking-time"),
      cls_thousandths: thousandths(auditOf(lhr, "cumulative-layout-shift")?.numericValue),
      speed_index_ms: numeric("speed-index"),
    },
    lcp_element: element ?? nodeOf(arr(obj(auditOf(lhr, "lcp-discovery-insight")?.details)?.items).find((i) => i?.type === "node")),
    lcp_breakdown: breakdown,
    lcp_discovery: lcpDiscovery(lhr),
    render_blocking: renderBlocking
      ? {
          items: arr(obj(renderBlocking.details)?.items)
            .filter((i) => str(i?.url))
            .map((i) => ({ url: i.url as string, bytes: int(i.totalBytes), wasted_ms: int(i.wastedMs) })),
          fcp_saving_ms: int(obj(renderBlocking.metricSavings)?.FCP),
        }
      : null,
    font_display: tableItems(lhr, "font-display-insight")?.filter((i) => str(i?.url)).map((i) => ({ url: i.url as string, wasted_ms: int(i.wastedMs) })) ?? null,
    document_latency: documentLatency(lhr),
    long_tasks:
      tableItems(lhr, "long-tasks")
        ?.filter((i) => str(i?.url) && int(i?.duration) !== null)
        .map((i) => ({ url: i.url as string, duration_ms: int(i.duration)!, start_ms: int(i.startTime) })) ?? null,
    unused_javascript:
      tableItems(lhr, "unused-javascript")
        ?.filter((i) => str(i?.url) && int(i?.wastedBytes) !== null)
        .map((i) => ({ url: i.url as string, total_bytes: int(i.totalBytes), wasted_bytes: int(i.wastedBytes)! })) ?? null,
    image_delivery:
      tableItems(lhr, "image-delivery-insight")
        ?.filter((i) => str(i?.url) && int(i?.wastedBytes) !== null)
        .map((i) => ({ url: i.url as string, total_bytes: int(i.totalBytes), wasted_bytes: int(i.wastedBytes)! })) ?? null,
    forced_reflow: forcedReflow(lhr),
    layout_shifts: layoutShifts(lhr),
    unsized_images: tableItems(lhr, "unsized-images")?.filter((i) => str(i?.url)).map((i) => ({ url: i.url as string, selector: nodeOf(i.node)?.selector ?? null })) ?? null,
    bfcache: (() => {
      const audit = auditOf(lhr, "bf-cache");
      if (!audit) return null;
      const reasons = arr(obj(audit.details)?.items)
        .filter((i) => str(i?.failureType) === BFCACHE_ACTIONABLE && str(i?.reason))
        .map((i) => i.reason as string);
      return { actionable: reasons };
    })(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "Lighthouse returned error: NO_FCP ..." in a PageSpeed Insights error message, as a code only. */
function lighthouseCode(text: unknown): string | null {
  const match = typeof text === "string" ? /Lighthouse returned error: ([A-Z0-9_]+)/.exec(text) : null;
  return match ? match[1]! : null;
}

function safeCode(code: unknown): string | null {
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : null;
}

interface PagespeedBody {
  lighthouseResult?: { runtimeError?: { code?: string } } & Record<string, unknown>;
  error?: { message?: string };
}

/** One PageSpeed Insights run of `url`. Never throws: failures are returned as an InputError. */
export async function runPagespeed(url: string, strategy: Strategy, key: string, options: { fetch?: FetchLike; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<LabInput> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const params = new URLSearchParams({ url, strategy, category: "performance", locale: "en", key });
  const failed = (error: InputError): LabInput => ({ strategy, status: "failed", run: null, error });
  let response: Response;
  try {
    response = await fetchImpl(`${PAGESPEED_ENDPOINT}?${params.toString()}`, {
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return failed(errorOf(error));
  }
  let body: PagespeedBody | null = null;
  try {
    body = (await response.json()) as PagespeedBody;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const code = lighthouseCode(body?.error?.message);
    return failed(code ? { kind: "lighthouse", code } : { kind: "http", status: response.status });
  }
  const lhr = body?.lighthouseResult;
  if (!lhr || typeof lhr !== "object") return failed({ kind: "invalid" });
  if (lhr.runtimeError?.code) return failed({ kind: "lighthouse", code: safeCode(lhr.runtimeError.code) });
  return { strategy, status: "ok", run: normalizeLighthouse(lhr, strategy, url), error: null };
}

export interface AcquirePerformanceOptions {
  /** Chrome UX Report key; null leaves field data out. */
  cruxKey: string | null;
  /** PageSpeed Insights key; null leaves the lab run out. */
  pagespeedKey: string | null;
  fetch?: FetchLike;
  signal?: AbortSignal;
  /** Per lab run (default 120 s). */
  labTimeoutMs?: number;
  onProgress?: (message: string) => void;
}

/**
 * Field data and both lab runs for the home page, concurrently. `homeUrl` is
 * the home page the scan resolved: the preferred origin followed by "/".
 */
export async function acquirePerformance(homeUrl: string, options: AcquirePerformanceOptions): Promise<PerformanceInput> {
  const origin = new URL(homeUrl).origin;
  const progress = options.onProgress ?? (() => {});
  const field = options.cruxKey
    ? (progress("Reading Chrome UX Report field data for the home page."), acquireField(homeUrl, origin, options.cruxKey, { fetch: options.fetch, signal: options.signal }))
    : Promise.resolve([]);
  const lab = options.pagespeedKey
    ? (progress("Running Lighthouse on the home page through PageSpeed Insights (mobile and desktop)."),
      Promise.all(STRATEGIES.map((s) => runPagespeed(homeUrl, s, options.pagespeedKey!, { fetch: options.fetch, signal: options.signal, timeoutMs: options.labTimeoutMs }))))
    : Promise.resolve([]);
  const [devices, runs] = await Promise.all([field, lab]);
  return {
    home_url: homeUrl,
    origin,
    acquired_at: new Date().toISOString(),
    field: { requested: options.cruxKey !== null, devices },
    lab: { requested: options.pagespeedKey !== null, runs },
  };
}
