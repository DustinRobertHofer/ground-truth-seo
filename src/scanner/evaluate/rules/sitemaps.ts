import { parseLastmod } from "../core/dates.js";
import { codePointLength, SITEMAP_BYTE_LIMIT } from "../core/sitemap.js";
import { directoryOf } from "../core/url.js";
import type { EvaluationContext, SitemapFile } from "../context.js";
import { fail, info, notEvaluated, opportunity, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { outcomeLabel, statusOf } from "./helpers.js";
import { sortBytes } from "../core/text.js";

function readable(file: SitemapFile): boolean {
  return file.parsed !== null && (file.parsed.kind === "urlset" || file.parsed.kind === "sitemapindex" || file.parsed.kind === "plain");
}

export const sitemap07: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    const final = file.chain.final;
    if (!final || statusOf(final) !== 200) {
      out.push(fail(file.url, "not_ok", { sitemap: file.url, outcome: final ? outcomeLabel(final) : file.chain.problem === "loop" ? "a redirect loop" : "no final response" }));
      continue;
    }
    const parsed = file.parsed!;
    if (parsed.kind === "feed") {
      out.push(pass(file.url, { kind: "feed", root: parsed.root?.name ?? "" }));
      continue;
    }
    if (parsed.kind === "invalid" && parsed.error) {
      out.push(fail(file.url, "not_well_formed", { sitemap: file.url, error: parsed.error.message, line: parsed.error.line, column: parsed.error.column }));
      continue;
    }
    if (parsed.kind === "invalid") {
      out.push(fail(file.url, "wrong_root", { sitemap: file.url, root: parsed.root?.name ?? "" }));
      continue;
    }
    out.push(pass(file.url, { kind: parsed.kind, entries: parsed.kind === "sitemapindex" ? parsed.children.length : parsed.entries.length }));
  }
  return out;
};

export const sitemap01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file)) continue;
    const parsed = file.parsed!;
    const isIndex = parsed.kind === "sitemapindex";
    const count = isIndex ? parsed.children.length : parsed.entries.length;
    const bytes = parsed.uncompressedBytes;
    const observed = { sitemap: file.url, count, bytes, entry_kind: isIndex ? "sitemaps" : "URLs" };
    let failed = false;
    if (count > 50_000) {
      failed = true;
      out.push(fail(file.url, isIndex ? "index_too_many" : "too_many_urls", observed));
    }
    if (bytes > SITEMAP_BYTE_LIMIT || parsed.gzipTruncated) {
      failed = true;
      out.push(fail(file.url, isIndex ? "index_too_large" : "too_large", observed));
    }
    if (!failed) out.push(pass(file.url, observed));
  }
  return out;
};

export const sitemap02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file) || file.parsed!.kind === "sitemapindex") continue;
    if (file.outOfScope.length > 0) {
      out.push(fail(file.url, "loc_out_of_scope", { sitemap: file.url, n: file.outOfScope.length, example: sortBytes(file.outOfScope)[0]!, sitemap_dir: directoryOf(file.chain.finalUrl) }));
    } else {
      out.push(pass(file.url, { valid: file.validLocs.length }));
    }
  }
  return out;
};

export const sitemap02b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file) || file.parsed!.kind === "sitemapindex") continue;
    if (file.notAbsolute.length > 0) out.push(fail(file.url, "loc_not_absolute", { sitemap: file.url, n: file.notAbsolute.length, example: [...file.notAbsolute].sort()[0]! }));
    else out.push(pass(file.url));
  }
  return out;
};

export const sitemap02c: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file)) continue;
    const parsed = file.parsed!;
    let failed = false;
    if (parsed.firstInvalidUtf8Line !== null) {
      failed = true;
      out.push(fail(file.url, "not_utf8", { sitemap: file.url, line: parsed.firstInvalidUtf8Line }));
    }
    const long = parsed.entries.filter((e) => codePointLength(e.loc) >= 2048);
    if (long.length > 0) {
      failed = true;
      out.push(fail(file.url, "loc_too_long", { sitemap: file.url, n: long.length }));
    }
    if (parsed.kind === "sitemapindex") {
      const host = new URL(file.chain.finalUrl).host;
      for (const child of parsed.children) {
        let childHost: string | null = null;
        try {
          childHost = new URL(child.loc, file.chain.finalUrl).host;
        } catch {
          childHost = null;
        }
        if (childHost !== null && childHost !== host) {
          failed = true;
          out.push(fail(file.url, "index_child_out_of_scope", { sitemap: file.url, child: child.loc }));
        }
      }
    }
    if (!failed) out.push(pass(file.url));
  }
  return out;
};

export const sitemap03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    for (const loc of file.validLocs) {
      if (!ctx.wasFetched(loc)) continue;
      if (ctx.redirects(loc)) {
        out.push(fail(loc, "redirects", { loc, sitemap: file.url, final: ctx.chain(loc).finalUrl }));
        continue;
      }
      const page = ctx.page(loc);
      if (!page) {
        if (statusOf(ctx.chain(loc).final) === 200) out.push(pass(loc));
        continue; // non-200 URLs are judged by the indexing gates
      }
      const canonical = ctx.headCanonicalOf(loc);
      if (canonical !== null && canonical !== loc) out.push(fail(loc, "not_self_canonical", { loc, sitemap: file.url, canonical }));
      else out.push(pass(loc));
    }
  }
  return out;
};

function lastmods(file: SitemapFile): string[] {
  const parsed = file.parsed!;
  const values: string[] = [];
  for (const entry of parsed.entries) if (entry.lastmod !== null) values.push(entry.lastmod);
  for (const child of parsed.children) if (child.lastmod !== null) values.push(child.lastmod);
  return values;
}

export const sitemap04a: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file)) continue;
    const values = lastmods(file);
    if (values.length === 0) continue;
    const invalid = values.filter((v) => !parseLastmod(v).valid);
    if (invalid.length > 0) out.push(fail(file.url, "invalid_lastmod", { sitemap: file.url, n: invalid.length, example: [...invalid].sort()[0]! }));
    else out.push(pass(file.url, { lastmod_values: values.length }));
  }
  return out;
};

export const sitemap04b: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file)) continue;
    const values = lastmods(file);
    if (values.length === 0) continue;
    const future = values.filter((v) => {
      const parsed = parseLastmod(v);
      return parsed.valid && parsed.earliest > ctx.completedAtMs;
    });
    if (future.length > 0) out.push(fail(file.url, "future_lastmod", { sitemap: file.url, n: future.length, example: [...future].sort()[0]! }));
    else out.push(pass(file.url));
  }
  return out;
};

export const sitemap04c: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file)) continue;
    const values = lastmods(file);
    if (values.length === 0) continue;
    const dateOnly = values.filter((v) => {
      const parsed = parseLastmod(v);
      return parsed.valid && !parsed.hasTime;
    });
    if (dateOnly.length > 0) out.push(fail(file.url, "date_only_lastmod", { sitemap: file.url, n: dateOnly.length }));
    else out.push(pass(file.url));
  }
  return out;
};

export const sitemap04hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (!readable(file)) continue;
    const values = lastmods(file);
    if (values.length >= 2 && new Set(values).size === 1) out.push(info(file.url, "uniform_lastmod", { sitemap: file.url, n: values.length, value: values[0]! }));
  }
  return out;
};

export const sitemap06: RuleEvaluator = (ctx) => {
  const key = ctx.config.indexnow_key;
  if (!key) return [];
  const url = `${ctx.preferredOrigin}/${key}.txt`;
  const exchange = ctx.exchangeWithPurpose(url, "indexnow") ?? ctx.primaryExchange(url);
  if (!exchange) return [notEvaluated(ctx.preferredOrigin, "The IndexNow key file was not fetched.")];
  const final = ctx.chain(url).final;
  const body = final ? ctx.body(final) : null;
  const text = body ? new TextDecoder("utf-8", { fatal: false }).decode(body).trim() : "";
  return [info(ctx.preferredOrigin, "key_file", { key_url: url, outcome: final ? outcomeLabel(final) : "no final response", body_match: statusOf(final) === 200 && text === key ? "matches" : "does not match" })];
};

export const sitemap05: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const file of ctx.sitemaps) {
    if (file.parsed?.hasPriorityOrChangefreq) out.push(info(file.url, "present", { sitemap: file.url }));
  }
  return out;
};

export const sitemap08: RuleEvaluator = (ctx) => (ctx.sitemapFound ? [pass("site", { sitemaps: ctx.sitemaps.length })] : [opportunity("site", "none_found", {})]);

export const SITEMAP_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-SITEMAP-07": sitemap07,
  "SEO-SITEMAP-01": sitemap01,
  "SEO-SITEMAP-02": sitemap02,
  "SEO-SITEMAP-02B": sitemap02b,
  "SEO-SITEMAP-02C": sitemap02c,
  "SEO-SITEMAP-03": sitemap03,
  "SEO-SITEMAP-04A": sitemap04a,
  "SEO-SITEMAP-04B": sitemap04b,
  "SEO-SITEMAP-04C": sitemap04c,
  "SEO-SITEMAP-04-HC": sitemap04hc,
  "SEO-SITEMAP-06": sitemap06,
  "SEO-SITEMAP-05": sitemap05,
  "SEO-SITEMAP-08": sitemap08,
};

export type { EvaluationContext };
