/**
 * Chrome UX Report field data (PRODUCT.md §5.1 step 10, KNOWLEDGE.md SEO-PERF-01).
 *
 * Acquisition asks the CrUX API for the origin and the home page, on phones and
 * desktops, and stores each answer normalized as a CruxRecord in the snapshot.
 * The API key never enters the snapshot or the report (PRODUCT.md §13). A scope
 * the report has no data for is simply absent, which the evaluator reports as
 * not evaluated rather than as a failure.
 */

import type { CruxRecord } from "../evaluate/rules/performance.js";

export type CruxProvider = (origin: string, urls: string[]) => Promise<Record<string, CruxRecord> | null>;

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const FORM_FACTORS = ["PHONE", "DESKTOP"] as const;

interface CruxDate {
  year: number;
  month: number;
  day: number;
}

interface CruxResponse {
  record?: {
    key?: { origin?: string; url?: string; formFactor?: string };
    metrics?: Record<string, { percentiles?: { p75?: number | string } }>;
    collectionPeriod?: { firstDate?: CruxDate; lastDate?: CruxDate };
  };
}

function isoDate(d: CruxDate | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

function integerMs(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** CLS arrives as a decimal string ("0.05"); stored as integer thousandths without floating point. */
function thousandths(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const text = typeof value === "number" ? value.toString() : value;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = (match[2] ?? "").padEnd(3, "0").slice(0, 3);
  return whole * 1000 + Number(frac);
}

/** The record key the evaluator uses as the finding's unit. */
export function cruxKey(scope: "origin" | "url", target: string, formFactor: string): string {
  return scope === "origin" ? `origin|${formFactor}` : `url|${formFactor}|${target}`;
}

export function normalizeCruxResponse(scope: "origin" | "url", target: string, formFactor: "PHONE" | "DESKTOP", body: CruxResponse): CruxRecord | null {
  const record = body.record;
  if (!record?.metrics) return null;
  const m = record.metrics;
  return {
    scope,
    target,
    form_factor: formFactor,
    first_date: isoDate(record.collectionPeriod?.firstDate),
    last_date: isoDate(record.collectionPeriod?.lastDate),
    lcp_p75_ms: integerMs(m.largest_contentful_paint?.percentiles?.p75),
    inp_p75_ms: integerMs(m.interaction_to_next_paint?.percentiles?.p75),
    cls_p75_thousandths: thousandths(m.cumulative_layout_shift?.percentiles?.p75),
  };
}

/**
 * A provider backed by the public CrUX API. One request per (scope, form factor);
 * a 404 means the dataset has no record for that scope. Any other failure leaves
 * that scope out rather than failing the scan.
 */
export function cruxApiProvider(apiKey: string, options: { timeoutMs?: number } = {}): CruxProvider {
  const timeoutMs = options.timeoutMs ?? 10_000;
  return async (origin, urls) => {
    const records: Record<string, CruxRecord> = {};
    const targets: { scope: "origin" | "url"; target: string }[] = [{ scope: "origin", target: origin }, ...urls.map((url) => ({ scope: "url" as const, target: url }))];
    for (const { scope, target } of targets) {
      for (const formFactor of FORM_FACTORS) {
        const body = scope === "origin" ? { origin: target, formFactor } : { url: target, formFactor };
        try {
          const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (response.status === 404) continue;
          if (!response.ok) continue;
          const parsed = (await response.json()) as CruxResponse;
          const record = normalizeCruxResponse(scope, target, formFactor, parsed);
          if (record) records[cruxKey(scope, target, formFactor)] = record;
        } catch {
          // Field data is optional input: a network failure leaves the scope out.
        }
      }
    }
    return Object.keys(records).length > 0 ? records : null;
  };
}

/** Whether a CrUX key is configured for this process. The key itself never leaves the environment. */
export function cruxApiKey(): string | null {
  const key = process.env.CRUX_API_KEY?.trim();
  return key ? key : null;
}
