import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../scanner/snapshot/canonical-json.js";
import { normalizeCruxRecord, normalizeLighthouse, type CruxApiResponse } from "./acquire.js";
import { diagnosePerformance, fillTemplate } from "./diagnose.js";
import { DIAGNOSTICS, PERFORMANCE_STATEMENTS } from "./knowledge.js";
import { renderPerformanceMarkdown } from "./markdown.js";
import type { FieldRecord, LabRun, PerformanceInput, PerformanceResult } from "./types.js";

const CRUX_HOME_PHONE = JSON.parse(readFileSync(new URL("../../fixtures/performance/crux-home-phone.json", import.meta.url), "utf8")) as CruxApiResponse;
const HOME = "https://www.example.com/";
const ORIGIN = "https://www.example.com";

function field(overrides: Partial<Record<"LCP" | "INP" | "CLS" | "FCP" | "TTFB", number | null>> = {}, scope: "url" | "origin" = "url", formFactor: "PHONE" | "DESKTOP" = "PHONE"): FieldRecord {
  const record = normalizeCruxRecord(scope, scope === "url" ? HOME : ORIGIN, formFactor, CRUX_HOME_PHONE)!;
  for (const [id, p75] of Object.entries(overrides)) {
    const metric = record.metrics[id as keyof typeof record.metrics];
    if (p75 === null) record.metrics[id as keyof typeof record.metrics] = null;
    else if (metric) metric.p75 = p75;
  }
  return record;
}

/** A lab run in which nothing is wrong. */
function cleanRun(strategy: "mobile" | "desktop" = "mobile"): LabRun {
  return {
    strategy,
    lighthouse_version: "13.5.0",
    requested_url: HOME,
    final_url: HOME,
    fetch_time: "2026-10-16T12:00:00.000Z",
    metrics: { fcp_ms: 900, lcp_ms: 1500, tbt_ms: 40, cls_thousandths: 10, speed_index_ms: 1200 },
    lcp_element: { selector: "main > img.hero", snippet: '<img class="hero" src="/hero.webp">' },
    lcp_breakdown: { ttfb: 600, load_delay: 100, load_duration: 700, render_delay: 100 },
    lcp_discovery: { eagerly_loaded: true, discoverable: true, priority_hinted: true },
    render_blocking: { items: [], fcp_saving_ms: 0 },
    font_display: [],
    document_latency: { no_redirects: true, redirect_ms: 0, server_fast: true, server_ms: 90 },
    long_tasks: [],
    unused_javascript: [],
    image_delivery: [],
    forced_reflow: [],
    layout_shifts: { elements: [], causes: {} },
    unsized_images: [],
    bfcache: { actionable: [] },
  };
}

/** A lab run in which every lab condition holds. */
function troubledRun(strategy: "mobile" | "desktop" = "mobile"): LabRun {
  return {
    ...cleanRun(strategy),
    requested_url: "https://example.com/",
    metrics: { fcp_ms: 3400, lcp_ms: 5200, tbt_ms: 900, cls_thousandths: 320, speed_index_ms: 4800 },
    lcp_breakdown: { ttfb: 1000, load_delay: 1500, load_duration: 1200, render_delay: 1500 },
    lcp_discovery: { eagerly_loaded: false, discoverable: false, priority_hinted: false },
    render_blocking: { items: [{ url: `${ORIGIN}/a.css`, bytes: 90000, wasted_ms: 600 }, { url: `${ORIGIN}/b.js`, bytes: 40000, wasted_ms: null }], fcp_saving_ms: 600 },
    font_display: [{ url: `${ORIGIN}/f.woff2`, wasted_ms: 120 }],
    document_latency: { no_redirects: false, redirect_ms: 350, server_fast: false, server_ms: 1400 },
    long_tasks: [{ url: `${ORIGIN}/app.js`, duration_ms: 180, start_ms: 2000 }, { url: `${ORIGIN}/vendor.js`, duration_ms: 420, start_ms: 1200 }],
    unused_javascript: [{ url: `${ORIGIN}/vendor.js`, total_bytes: 300000, wasted_bytes: 210000 }],
    image_delivery: [{ url: `${ORIGIN}/hero.jpg`, total_bytes: 900000, wasted_bytes: 600000 }, { url: `${ORIGIN}/logo.png`, total_bytes: 40000, wasted_bytes: 0 }],
    forced_reflow: [{ source: `${ORIGIN}/app.js:10:5`, reflow_ms: 30 }],
    layout_shifts: {
      elements: [
        { selector: "footer", snippet: "<footer>", score_thousandths: 20 },
        { selector: "main > section", snippet: "<section>", score_thousandths: 300 },
      ],
      causes: { "Unsized image element": 2, "Web font": 1 },
    },
    unsized_images: [{ url: `${ORIGIN}/banner.png`, selector: "header > img" }],
    bfcache: { actionable: ["Pages whose main resource has cache-control:no-store cannot enter back/forward cache."] },
  };
}

function input(parts: { phoneField?: FieldRecord | null; desktopField?: FieldRecord | null; mobile?: LabRun | null; desktop?: LabRun | null; fieldRequested?: boolean; labRequested?: boolean } = {}): PerformanceInput {
  const fieldRequested = parts.fieldRequested ?? true;
  const labRequested = parts.labRequested ?? true;
  const device = (form_factor: "PHONE" | "DESKTOP", record: FieldRecord | null | undefined) =>
    record ? { form_factor, status: "ok" as const, record, error: null } : { form_factor, status: "none" as const, record: null, error: null };
  const run = (strategy: "mobile" | "desktop", r: LabRun | null | undefined) =>
    r ? { strategy, status: "ok" as const, run: r, error: null } : { strategy, status: "failed" as const, run: null, error: { kind: "timeout" as const } };
  return {
    home_url: HOME,
    origin: ORIGIN,
    acquired_at: "2026-10-16T12:00:30.000Z",
    field: { requested: fieldRequested, devices: fieldRequested ? [device("PHONE", parts.phoneField), device("DESKTOP", parts.desktopField)] : [] },
    lab: { requested: labRequested, runs: labRequested ? [run("mobile", parts.mobile), run("desktop", parts.desktop)] : [] },
  };
}

function shown(result: PerformanceResult): string[] {
  return result.diagnostics.map((d) => `${d.id}:${d.condition}:${d.device}`);
}

function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) numbers(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) numbers(v, out);
  return out;
}

function keys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keys(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keys(v, out);
    }
  return out;
}

const troubled = input({ phoneField: field({ INP: 260, CLS: 140, TTFB: 1020 }), desktopField: field({ CLS: 140 }, "url", "DESKTOP"), mobile: troubledRun(), desktop: { ...cleanRun("desktop"), metrics: { ...cleanRun("desktop").metrics, cls_thousandths: 20 } } });

describe("diagnosePerformance (KNOWLEDGE.md §13)", () => {
  it("shows every condition of every diagnostic on some input", () => {
    const all = new Set(shown(diagnosePerformance(troubled)).map((s) => s.split(":").slice(0, 2).join(":")));
    for (const d of DIAGNOSTICS) for (const c of d.conditions) expect(all.has(`${d.id}:${c.code}`), `${d.id} ${c.code}`).toBe(true);
  });

  it("shows nothing when the field data and the lab run are good", () => {
    const result = diagnosePerformance(input({ phoneField: field({ LCP: 2100, INP: 150, CLS: 50, FCP: 1500, TTFB: 600 }), desktopField: null, mobile: cleanRun(), desktop: cleanRun("desktop") }));
    expect(result.diagnostics).toEqual([]);
    expect(result.devices[0]!.field!.assessment).toBe("passes");
  });

  it("fills templates from observed values in the §1.5 formats", () => {
    const result = diagnosePerformance(troubled);
    const statement = (id: string, condition: string, device = "phones") => result.diagnostics.find((d) => d.id === id && d.condition === condition && d.device === device)!.statement;
    expect(statement("PERF-LCP-01", "load_delay")).toBe(
      "In the mobile lab run, the LCP element (main > img.hero) started loading its resource 1,500 ms after the first byte arrived: 28% of its 5,200 ms LCP. On a well-optimized page, web.dev puts resource load delay under 10% of LCP.",
    );
    expect(statement("PERF-INP-01", "field")).toBe("Real visitors on phones waited 260 ms at the 75th percentile for the home page to respond to an interaction (2026-09-15 to 2026-10-12), above the 'good' value of 200 ms.");
    expect(statement("PERF-INP-01", "long_tasks")).toBe("In the mobile lab run, the main thread ran 2 long tasks while the page loaded, the longest for 420 ms (https://www.example.com/vendor.js); Total Blocking Time was 900 ms.");
    expect(statement("PERF-CLS-01", "lab")).toBe(
      "In the mobile lab run, the page shifted by 0.320 while loading; the elements that moved most were main > section, footer. Lighthouse traced shifts to 2 unsized images and 1 web font.",
    );
    expect(statement("PERF-CLS-01", "post_load", "desktops")).toBe(
      "Real visitors on desktops saw a layout shift score of 0.140 at the 75th percentile on the home page (2026-09-15 to 2026-10-12), while the desktop lab run measured 0.020 during load, which often points to shifts after the page has loaded.",
    );
    expect(statement("PERF-LCP-06", "smaller")).toBe("In the mobile lab run, Lighthouse estimates that 1 images could be 600,000 bytes smaller in all; the largest saving is 600,000 bytes on https://www.example.com/hero.jpg.");
    expect(statement("PERF-FCP-01", "blocking")).toBe(
      "In the mobile lab run, 2 requests blocked the first render (https://www.example.com/a.css, https://www.example.com/b.js). Lighthouse estimates the first render could come 600 ms earlier without them.",
    );
    expect(statement("PERF-TTFB-01", "redirects")).toBe("In the mobile lab run, the request for https://example.com/ went through redirects that took 350 ms before the page itself was requested.");
    for (const d of result.diagnostics) expect(d.statement, d.id).not.toMatch(/\{[a-z_]+\}/);
  });

  it("emits citations only for the conditions they name", () => {
    const result = diagnosePerformance(troubled);
    const inp = result.diagnostics.filter((d) => d.id === "PERF-INP-01");
    expect(inp.find((d) => d.condition === "field")!.citations.some((c) => c.source_id === "WEBDEV-INP")).toBe(false);
    expect(inp.find((d) => d.condition === "long_tasks")!.citations.some((c) => c.source_id === "WEBDEV-INP")).toBe(true);
    for (const d of result.diagnostics) expect(d.citations.length, d.id).toBeGreaterThan(0);
  });

  it("orders diagnostics by metric, ID, condition and device", () => {
    const ids = diagnosePerformance(troubled).diagnostics.map((d) => DIAGNOSTICS.findIndex((x) => x.id === d.id));
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    const cls = diagnosePerformance(troubled).diagnostics.filter((d) => d.id === "PERF-CLS-01").map((d) => `${d.condition}:${d.device}`);
    expect(cls).toEqual(["field:phones", "post_load:desktops", "lab:phones"]);
  });

  it("rates field values at the 75th percentile, labels histogram bins and assesses Core Web Vitals", () => {
    const view = diagnosePerformance(troubled).devices[0]!.field!;
    expect(view.metrics.map((m) => [m.metric, m.display, m.rating])).toEqual([
      ["LCP", "3,120 ms", "needs_improvement"],
      ["INP", "260 ms", "needs_improvement"],
      ["CLS", "0.140", "needs_improvement"],
      ["FCP", "1,900 ms", "needs_improvement"],
      ["TTFB", "1,020 ms", "needs_improvement"],
    ]);
    expect(view.metrics[0]!.bins.map((b) => [b.rating, b.range, b.share])).toEqual([
      ["good", "0 to 2,500 ms", "61.23%"],
      ["needs_improvement", "2,500 to 4,000 ms", "25.02%"],
      ["poor", "4,000 ms and above", "13.75%"],
    ]);
    expect(view.metrics[2]!.bins[0]!.range).toBe("0.000 to 0.100");
    expect(view.assessment).toBe("does_not_pass");
    expect(view.lcp_resource_type).toEqual([
      { type: "image", share_bp: 8000, share: "80.00%" },
      { type: "text", share_bp: 2000, share: "20.00%" },
    ]);
    const noInp = diagnosePerformance(input({ phoneField: field({ LCP: 2000, CLS: 50, INP: null }) })).devices[0]!.field!;
    expect(noInp.assessment).toBe("passes");
    const noCls = diagnosePerformance(input({ phoneField: field({ CLS: null }) })).devices[0]!.field!;
    expect(noCls.assessment).toBe("cannot_assess");
    expect(rateBoundary()).toEqual(["good", "needs_improvement", "needs_improvement", "poor"]);
  });

  it("breaks the lab LCP into shares that round down", () => {
    const lab = diagnosePerformance(troubled).devices[0]!.lab!;
    expect(lab.lcp_breakdown!.total_ms).toBe(5200);
    expect(lab.lcp_breakdown!.subparts.map((s) => [s.key, s.share_pct])).toEqual([
      ["ttfb", 19],
      ["load_delay", 28],
      ["load_duration", 23],
      ["render_delay", 28],
    ]);
    expect(lab.metrics.map((m) => [m.metric, m.display, m.rating])).toEqual([
      ["LCP", "5,200 ms", "poor"],
      ["CLS", "0.320", "poor"],
      ["FCP", "3,400 ms", "poor"],
      ["TBT", "900 ms", null],
    ]);
  });

  it("states which inputs were not available, and why", () => {
    const off = diagnosePerformance(input({ fieldRequested: false, labRequested: false }));
    expect(off.statements.map((s) => s.key)).toEqual(["advisory", "field_first", "lab_one_run", "no_lab_score", "field_off", "lab_off"]);
    const partial = diagnosePerformance(input({ phoneField: field({}, "origin"), desktopField: null, mobile: cleanRun(), desktop: null }));
    const texts = partial.statements.map((s) => s.text);
    expect(texts).toContain("The Chrome UX Report has no field data for the home page or for the origin on desktops. It includes only pages and origins with enough real visits from Chrome users.");
    expect(texts).toContain("The Chrome UX Report has too little data for the home page itself on phones, so field values there are for the whole origin.");
    expect(texts).toContain("PageSpeed Insights could not complete the desktop lab run: the request timed out.");
    expect(partial.devices[0]!.field!.scope_label).toBe("the origin https://www.example.com");
    const quoted = off.statements.find((s) => s.key === "no_lab_score")!;
    expect(quoted.citation).toMatchObject({ source_id: "G-PAGE-EXP", quote: "trying to get a perfect score just for SEO reasons may not be the best use of your time" });
    expect(off.statements.find((s) => s.key === "advisory")!.citation).toBeNull();
  });

  it("is deterministic, uses integers only and never carries a Lighthouse score", () => {
    const a = diagnosePerformance(troubled);
    const b = diagnosePerformance(JSON.parse(JSON.stringify(troubled)) as PerformanceInput);
    expect(canonicalize(a)).toBe(canonicalize(b));
    for (const n of numbers(a)) expect(Number.isInteger(n), String(n)).toBe(true);
    expect(keys(a).has("score")).toBe(false);
  });

  it("diagnoses real Lighthouse runs", () => {
    const lhr = (name: string) => JSON.parse(readFileSync(new URL(`../../fixtures/performance/${name}`, import.meta.url), "utf8")).lighthouseResult;
    const mobile = normalizeLighthouse(lhr("lighthouse-seoscanner-mobile.json"), "mobile", "https://www.seoscanner.app/");
    const desktop = normalizeLighthouse(lhr("lighthouse-seoscanner-desktop.json"), "desktop", "https://www.seoscanner.app/");
    const result = diagnosePerformance({ ...input({ fieldRequested: false }), home_url: "https://www.seoscanner.app/", origin: "https://www.seoscanner.app", lab: { requested: true, runs: [{ strategy: "mobile", status: "ok", run: mobile, error: null }, { strategy: "desktop", status: "ok", run: desktop, error: null }] } });
    const ids = new Set(result.diagnostics.map((d) => `${d.id}:${d.device}`));
    expect(ids.has("PERF-LCP-04:phones")).toBe(true);
    expect(ids.has("PERF-FCP-01:phones")).toBe(true);
    expect(ids.has("PERF-INP-02:phones")).toBe(true);
    const news = normalizeLighthouse(lhr("lighthouse-news-mobile.json"), "mobile", "https://www.news.example/");
    const newsResult = diagnosePerformance({ ...input({ fieldRequested: false }), lab: { requested: true, runs: [{ strategy: "mobile", status: "ok", run: news, error: null }] } });
    expect(newsResult.diagnostics.map((d) => d.id)).toEqual(expect.arrayContaining(["PERF-LCP-05", "PERF-LCP-06", "PERF-INP-03", "PERF-FCP-02"]));
    for (const n of numbers(newsResult)) expect(Number.isInteger(n)).toBe(true);
  });

  it("renders Markdown with every statement and quote as stored", () => {
    const result = diagnosePerformance(troubled);
    const md = renderPerformanceMarkdown(result);
    for (const s of result.statements) expect(md).toContain(s.text);
    for (const d of result.diagnostics) {
      expect(md).toContain(d.statement);
      for (const c of d.citations) expect(md).toContain(`"${c.quote}"`);
    }
    expect(md).not.toMatch(/performance score/i);
  });

  it("throws on a placeholder without a value", () => {
    expect(() => fillTemplate("{a} and {b}", { a: "x" })).toThrow("{b}");
    expect(PERFORMANCE_STATEMENTS.length).toBeGreaterThan(0);
  });
});

/** LCP at 2,500 (good), 2,501, 4,000 (needs improvement) and 4,001 ms (poor). */
function rateBoundary(): (string | null)[] {
  return [2500, 2501, 4000, 4001].map((lcp) => diagnosePerformance(input({ phoneField: field({ LCP: lcp }) })).devices[0]!.field!.metrics[0]!.rating);
}
