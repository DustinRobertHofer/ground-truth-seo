import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acquireField, acquirePerformance, normalizeCruxRecord, normalizeLighthouse, pagespeedApiKey, runPagespeed, type CruxApiResponse } from "./acquire.js";

function fixture(name: string): { lighthouseResult: Record<string, unknown> } {
  return JSON.parse(readFileSync(new URL(`../../fixtures/performance/${name}`, import.meta.url), "utf8"));
}

const KEY = "AIzaTESTKEY-0123456789";

const CRUX_HOME_PHONE = JSON.parse(readFileSync(new URL("../../fixtures/performance/crux-home-phone.json", import.meta.url), "utf8")) as CruxApiResponse;

describe("Chrome UX Report normalization", () => {
  it("stores every metric as integers, CLS in thousandths and densities in basis points", () => {
    const r = normalizeCruxRecord("url", "https://www.example.com/", "PHONE", CRUX_HOME_PHONE)!;
    expect(r.first_date).toBe("2026-09-15");
    expect(r.last_date).toBe("2026-10-12");
    expect(r.metrics.LCP).toEqual({ p75: 3120, bins: [{ start: 0, end: 2500, density_bp: 6123 }, { start: 2500, end: 4000, density_bp: 2502 }, { start: 4000, end: null, density_bp: 1375 }] });
    expect(r.metrics.CLS).toEqual({ p75: 140, bins: [{ start: 0, end: 100, density_bp: 8100 }, { start: 100, end: 250, density_bp: 1100 }, { start: 250, end: null, density_bp: 800 }] });
    expect(r.metrics.TTFB?.p75).toBe(1020);
    expect(r.lcp_subparts).toEqual({ ttfb: 900, load_delay: 640, load_duration: 410, render_delay: 220 });
    expect(r.lcp_resource_type).toEqual({ image: 8000, text: 2000 });
  });

  it("returns null for an answer without metrics", () => {
    expect(normalizeCruxRecord("url", "https://www.example.com/", "PHONE", {})).toBeNull();
  });

  it("falls back to the origin when the home page has no record, and reports no data when neither has one", async () => {
    const calls: string[] = [];
    const fake = async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { url?: string; origin?: string; formFactor: string };
      calls.push(`${body.url ? "url" : "origin"}:${body.formFactor}`);
      expect(url).toContain(encodeURIComponent(KEY));
      if (body.formFactor === "PHONE" && body.origin) return new Response(JSON.stringify(CRUX_HOME_PHONE), { status: 200 });
      return new Response("{}", { status: 404 });
    };
    const devices = await acquireField("https://www.example.com/", "https://www.example.com", KEY, { fetch: fake });
    expect(devices.map((d) => [d.form_factor, d.status, d.record?.scope ?? null])).toEqual([
      ["PHONE", "ok", "origin"],
      ["DESKTOP", "none", null],
    ]);
    expect(calls.sort()).toEqual(["origin:DESKTOP", "origin:PHONE", "url:DESKTOP", "url:PHONE"]);
    expect(JSON.stringify(devices)).not.toContain(KEY);
  });

  it("records an HTTP failure by status only", async () => {
    const devices = await acquireField("https://www.example.com/", "https://www.example.com", KEY, { fetch: async () => new Response(`bad key ${KEY}`, { status: 403 }) });
    expect(devices[0]).toEqual({ form_factor: "PHONE", status: "failed", record: null, error: { kind: "http", status: 403 } });
    expect(JSON.stringify(devices)).not.toContain(KEY);
  });
});

describe("Lighthouse normalization", () => {
  it("reads the metrics, the LCP breakdown and the LCP discovery checklist", () => {
    const run = normalizeLighthouse(fixture("lighthouse-seoscanner-mobile.json").lighthouseResult, "mobile", "https://www.seoscanner.app/");
    expect(run.lighthouse_version).toBe("13.5.0");
    expect(run.metrics).toEqual({ fcp_ms: 1279, lcp_ms: 3542, tbt_ms: 300, cls_thousandths: 1, speed_index_ms: 2299 });
    expect(run.lcp_element?.selector).toBe("div.mx-auto > a.inline-flex > span.inline-flex > img.dark:hidden");
    expect(run.lcp_breakdown).toEqual({ ttfb: 412, load_delay: 180, load_duration: 136, render_delay: expect.any(Number) });
    expect(run.lcp_discovery).toEqual({ eagerly_loaded: true, discoverable: true, priority_hinted: false });
    expect(run.render_blocking?.items).toHaveLength(2);
    expect(run.render_blocking?.items[0]).toEqual({ url: "https://www.seoscanner.app/_next/static/chunks/11hcqnjr-5rry.css", bytes: 18204, wasted_ms: 150 });
    expect(run.document_latency).toEqual({ no_redirects: true, redirect_ms: 0, server_fast: true, server_ms: 50 });
    expect(run.long_tasks?.length).toBeGreaterThan(0);
    expect(run.unused_javascript?.[0]).toEqual({ url: "https://www.seoscanner.app/_next/static/chunks/16vtkz9ddle6l.js", total_bytes: 101498, wasted_bytes: 79751 });
    expect(run.layout_shifts?.elements[0]?.selector).toBe("body.flex > header.sticky > div.mx-auto > div.ml-auto");
    expect(run.bfcache).toEqual({ actionable: [] });
    expect(run.image_delivery).toEqual([]);
    expect(run.unsized_images).toEqual([]);
  });

  it("leaves out insights that do not apply, and reads source locations from lines and columns counted from 1", () => {
    const run = normalizeLighthouse(fixture("lighthouse-news-mobile.json").lighthouseResult, "mobile", "https://www.news.example/");
    expect(run.lcp_discovery).toBeNull();
    expect(run.lcp_breakdown).toMatchObject({ load_delay: 0, load_duration: 0 });
    expect(run.font_display).toEqual([{ url: "https://www.news.example/fonts/news/noto_serif-v1.woff2", wasted_ms: 70 }]);
    expect(run.image_delivery).toHaveLength(2);
    expect(run.forced_reflow?.[0]).toEqual({ source: "https://www.news.example/:15384:523", reflow_ms: 5 });
  });

  it("normalizes the desktop run too", () => {
    const run = normalizeLighthouse(fixture("lighthouse-seoscanner-desktop.json").lighthouseResult, "desktop", "https://www.seoscanner.app/");
    expect(run.strategy).toBe("desktop");
    expect(run.metrics.lcp_ms).toEqual(expect.any(Number));
    expect(Number.isInteger(run.metrics.cls_thousandths)).toBe(true);
  });
});

describe("PageSpeed Insights runs", () => {
  it("asks for the performance category in English with the key, and stores no key", async () => {
    let asked = "";
    const input = await runPagespeed("https://www.seoscanner.app/", "mobile", KEY, {
      fetch: async (url) => {
        asked = url;
        return new Response(JSON.stringify(fixture("lighthouse-seoscanner-mobile.json")), { status: 200 });
      },
    });
    const params = new URL(asked).searchParams;
    expect([params.get("url"), params.get("strategy"), params.get("category"), params.get("locale"), params.get("key")]).toEqual(["https://www.seoscanner.app/", "mobile", "performance", "en", KEY]);
    expect(input.status).toBe("ok");
    expect(JSON.stringify(input)).not.toContain(KEY);
  });

  it("returns errors as codes, never as the API's message", async () => {
    const http = await runPagespeed("https://x.example/", "mobile", KEY, { fetch: async () => new Response(JSON.stringify({ error: { message: `API key ${KEY} not valid` } }), { status: 400 }) });
    expect(http.error).toEqual({ kind: "http", status: 400 });
    const lighthouse = await runPagespeed("https://x.example/", "desktop", KEY, {
      fetch: async () => new Response(JSON.stringify({ error: { message: "Lighthouse returned error: NO_FCP. The page did not paint any content." } }), { status: 500 }),
    });
    expect(lighthouse.error).toEqual({ kind: "lighthouse", code: "NO_FCP" });
    const runtime = await runPagespeed("https://x.example/", "desktop", KEY, { fetch: async () => new Response(JSON.stringify({ lighthouseResult: { runtimeError: { code: "bad code <script>" } } }), { status: 200 }) });
    expect(runtime.error).toEqual({ kind: "lighthouse", code: null });
    const invalid = await runPagespeed("https://x.example/", "mobile", KEY, { fetch: async () => new Response("not json", { status: 200 }) });
    expect(invalid.error).toEqual({ kind: "invalid" });
    const network = await runPagespeed("https://x.example/", "mobile", KEY, {
      fetch: async () => {
        throw new TypeError(`fetch failed for key=${KEY}`);
      },
    });
    expect(network.error).toEqual({ kind: "network" });
    for (const r of [http, lighthouse, runtime, invalid, network]) expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("acquires nothing it has no key for", async () => {
    const input = await acquirePerformance("https://www.example.com/", { cruxKey: null, pagespeedKey: null, fetch: async () => { throw new Error("no request expected"); } });
    expect(input).toMatchObject({ home_url: "https://www.example.com/", origin: "https://www.example.com", field: { requested: false, devices: [] }, lab: { requested: false, runs: [] } });
  });

  it("uses PAGESPEED_API_KEY, else CRUX_API_KEY", () => {
    expect(pagespeedApiKey({ PAGESPEED_API_KEY: " a ", CRUX_API_KEY: "b" })).toBe("a");
    expect(pagespeedApiKey({ CRUX_API_KEY: "b" })).toBe("b");
    expect(pagespeedApiKey({})).toBeNull();
  });
});
