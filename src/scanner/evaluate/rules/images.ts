import { readImage } from "../core/image.js";
import type { EvaluationContext, PageImage } from "../context.js";
import { fail, info, pass, type RuleEvaluator, type UnitResult } from "../findings.js";
import { statusOf } from "./helpers.js";

const GOOGLE_IMAGE_FORMATS = new Set(["BMP", "GIF", "JPEG", "PNG", "WebP", "SVG", "AVIF"]);

function contentImages(ctx: EvaluationContext, url: string): PageImage[] {
  return ctx.page(url)!.images.filter((img) => !img.inTemplate);
}

function describe(img: PageImage): string {
  return img.src && img.src.trim() !== "" ? img.src.trim() : `<img> at line ${img.line}`;
}

export const img01: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const missing = contentImages(ctx, url).filter((img) => img.src === null || img.src.trim() === "");
    if (missing.length > 0) {
      const example = missing[0]!;
      const alt = example.element.attrs.find((a) => a.name === "srcset" || a.name === "data-src");
      out.push(fail(url, "missing_src", { url, n: missing.length, example: alt ? `<img ${alt.name}="${alt.value.slice(0, 80)}"> at line ${example.line}` : describe(example) }));
    } else {
      out.push(pass(url, { images: contentImages(ctx, url).length }));
    }
  }
  return out;
};

export const img02: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const missing = contentImages(ctx, url).filter((img) => img.alt === null);
    if (missing.length > 0) out.push(fail(url, "missing_alt", { url, n: missing.length, src: describe(missing[0]!) }));
    else out.push(pass(url));
  }
  return out;
};

export const img04: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const lazy = contentImages(ctx, url).filter((img) => (img.loading ?? "").trim().toLowerCase() === "lazy");
    const missing = lazy.filter((img) => !img.width || !img.height);
    if (missing.length > 0) out.push(fail(url, "lazy_without_dimensions", { url, n: missing.length, src: describe(missing[0]!) }));
    else out.push(pass(url, { lazy: lazy.length }));
  }
  return out;
};

export const img04hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const missing = contentImages(ctx, url).filter((img) => !img.width || !img.height);
    if (missing.length > 0) out.push(info(url, "missing_dimensions", { url, n: missing.length, src: describe(missing[0]!) }));
  }
  return out;
};

export const img03: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const unsupported: { src: string; format: string }[] = [];
    for (const img of contentImages(ctx, url).slice(0, ctx.config.max_images_per_page)) {
      if (!img.key) continue;
      const final = ctx.chain(img.key).final;
      if (statusOf(final) !== 200) continue;
      const bytes = ctx.body(final);
      if (!bytes) continue;
      const format = readImage(bytes).format;
      if (!GOOGLE_IMAGE_FORMATS.has(format)) unsupported.push({ src: img.key, format });
    }
    if (unsupported.length > 0) out.push(info(url, "unsupported_format", { url, n: unsupported.length, src: unsupported[0]!.src, format: unsupported[0]!.format }));
  }
  return out;
};

const DEFAULT_NAME = /^(img|dsc|dcim|image|photo|pic|screenshot|untitled)[-_ ]?\d{2,}|^[0-9a-f]{16,}$|^\d{6,}$/i;

export const img03hc: RuleEvaluator = (ctx) => {
  const out: UnitResult[] = [];
  for (const url of ctx.pages) {
    const defaults: string[] = [];
    for (const img of contentImages(ctx, url)) {
      if (!img.key) continue;
      const name = decodeURIComponent(new URL(img.key).pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
      if (DEFAULT_NAME.test(name)) defaults.push(img.key);
    }
    if (defaults.length > 0) out.push(info(url, "default_filename", { url, n: defaults.length, src: defaults[0]! }));
  }
  return out;
};

export const IMAGE_EVALUATORS: Record<string, RuleEvaluator> = {
  "SEO-IMG-01": img01,
  "SEO-IMG-02": img02,
  "SEO-IMG-04": img04,
  "SEO-IMG-04-HC": img04hc,
  "SEO-IMG-03": img03,
  "SEO-IMG-03-HC": img03hc,
};
