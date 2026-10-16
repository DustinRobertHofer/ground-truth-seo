/**
 * Image format sniffing and header-only dimension reading, KNOWLEDGE.md §3.10.
 */

export type ImageFormat =
  | "PNG"
  | "JPEG"
  | "GIF"
  | "BMP"
  | "ICO"
  | "TIFF"
  | "PPM"
  | "WebP"
  | "AVIF"
  | "SVG"
  | "unknown";

export interface ImageInfo {
  format: ImageFormat;
  /** Width and height when readable. For ICO, the largest square entry's size (or the first entry). */
  width: number | null;
  height: number | null;
  /** Every entry of an ICO file. */
  entries: { width: number; height: number }[];
}

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function i32le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24);
}

export function sniffFormat(bytes: Uint8Array): ImageFormat {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "PNG";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "JPEG";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "GIF";
  if (b.length >= 2 && ascii(b, 0, 2) === "BM") return "BMP";
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "ICO";
  if (b.length >= 4 && ((ascii(b, 0, 2) === "II" && b[2] === 0x2a && b[3] === 0) || (ascii(b, 0, 2) === "MM" && b[2] === 0 && b[3] === 0x2a))) return "TIFF";
  if (b.length >= 2 && (ascii(b, 0, 2) === "P3" || ascii(b, 0, 2) === "P6")) return "PPM";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "WebP";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const size = u32be(b, 0);
    const brands = new Set<string>([ascii(b, 8, 4)]);
    for (let o = 16; o + 4 <= Math.min(size, b.length); o += 4) brands.add(ascii(b, o, 4));
    if (brands.has("avif") || brands.has("avis")) return "AVIF";
  }
  if (looksLikeSvg(bytes)) return "SVG";
  return "unknown";
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const text = decodeText(bytes).replace(/^﻿/, "");
  // Skip XML declaration, comments, doctype and whitespace; the root element must be svg.
  const stripped = text.replace(/^\s*(<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*/i, "");
  const root = /^<([A-Za-z_][\w.-]*:)?svg[\s>/]/.exec(stripped);
  if (!root) return false;
  const tag = /^<[^>]*>/.exec(stripped)?.[0] ?? "";
  return /xmlns(:[\w.-]+)?\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(tag) || !root[1];
}

function pngDimensions(b: Uint8Array): [number, number] | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return [u32be(b, 16), u32be(b, 20)];
}

function jpegDimensions(b: Uint8Array): [number, number] | null {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o += 1;
      continue;
    }
    const marker = b[o + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker === 0xff) {
      o += 1;
      continue;
    }
    const length = u16be(b, o + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return [u16be(b, o + 7), u16be(b, o + 5)];
    if (marker === 0xda || marker === 0xd9) return null;
    o += 2 + length;
  }
  return null;
}

function gifDimensions(b: Uint8Array): [number, number] | null {
  return b.length >= 10 ? [u16le(b, 6), u16le(b, 8)] : null;
}

function bmpDimensions(b: Uint8Array): [number, number] | null {
  if (b.length < 26) return null;
  const headerSize = u32le(b, 14);
  if (headerSize === 12) return [u16le(b, 18), u16le(b, 20)];
  return [Math.abs(i32le(b, 18)), Math.abs(i32le(b, 22))];
}

function icoEntries(b: Uint8Array): { width: number; height: number }[] {
  if (b.length < 6) return [];
  const count = u16le(b, 4);
  const entries: { width: number; height: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const o = 6 + i * 16;
    if (o + 16 > b.length) break;
    const w = b[o]! === 0 ? 256 : b[o]!;
    const h = b[o + 1]! === 0 ? 256 : b[o + 1]!;
    entries.push({ width: w, height: h });
  }
  return entries;
}

function tiffDimensions(b: Uint8Array): [number, number] | null {
  if (b.length < 8) return null;
  const le = ascii(b, 0, 2) === "II";
  const u16 = le ? u16le : u16be;
  const u32 = le ? u32le : u32be;
  const ifd = u32(b, 4);
  if (ifd + 2 > b.length) return null;
  const count = u16(b, ifd);
  let width: number | null = null;
  let height: number | null = null;
  for (let i = 0; i < count; i += 1) {
    const o = ifd + 2 + i * 12;
    if (o + 12 > b.length) break;
    const tag = u16(b, o);
    const type = u16(b, o + 2);
    const value = type === 3 ? u16(b, o + 8) : u32(b, o + 8);
    if (tag === 256) width = value;
    if (tag === 257) height = value;
  }
  return width !== null && height !== null ? [width, height] : null;
}

function ppmDimensions(b: Uint8Array): [number, number] | null {
  const text = decodeText(b).replace(/#[^\n]*/g, " ");
  const m = /^P[36]\s+(\d+)\s+(\d+)/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function webpDimensions(b: Uint8Array): [number, number] | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = u32le(b, 21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === "VP8X") {
    const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return [w, h];
  }
  return null;
}

function avifDimensions(b: Uint8Array): [number, number] | null {
  // Walk boxes looking for meta/iprp/ipco/ispe.
  const walk = (start: number, end: number): [number, number] | null => {
    let o = start;
    while (o + 8 <= end) {
      let size = u32be(b, o);
      const type = ascii(b, o + 4, 4);
      let headerLength = 8;
      if (size === 1) {
        if (o + 16 > end) return null;
        size = u32be(b, o + 12);
        headerLength = 16;
      }
      if (size === 0) size = end - o;
      if (size < headerLength) return null;
      const bodyStart = o + headerLength;
      const bodyEnd = Math.min(o + size, end);
      if (type === "ispe" && bodyEnd - bodyStart >= 12) {
        return [u32be(b, bodyStart + 4), u32be(b, bodyStart + 8)];
      }
      if (type === "meta") {
        const found = walk(bodyStart + 4, bodyEnd);
        if (found) return found;
      } else if (type === "iprp" || type === "ipco") {
        const found = walk(bodyStart, bodyEnd);
        if (found) return found;
      }
      o += size;
    }
    return null;
  };
  return walk(0, b.length);
}

function svgDimensions(b: Uint8Array): [number, number] | null {
  const text = decodeText(b);
  const tag = /<([A-Za-z_][\w.-]*:)?svg[^>]*>/.exec(text)?.[0];
  if (!tag) return null;
  const read = (name: string): number | null => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([0-9.]+)\\s*(px)?\\s*["']`).exec(tag);
    return m ? Math.round(Number(m[1])) : null;
  };
  const w = read("width");
  const h = read("height");
  if (w !== null && h !== null) return [w, h];
  const viewBox = /\sviewBox\s*=\s*["']\s*([-0-9.]+)[\s,]+([-0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/.exec(tag);
  if (viewBox) return [Math.round(Number(viewBox[3])), Math.round(Number(viewBox[4]))];
  return null;
}

export function readImage(bytes: Uint8Array): ImageInfo {
  const format = sniffFormat(bytes);
  let dims: [number, number] | null = null;
  let entries: { width: number; height: number }[] = [];
  switch (format) {
    case "PNG":
      dims = pngDimensions(bytes);
      break;
    case "JPEG":
      dims = jpegDimensions(bytes);
      break;
    case "GIF":
      dims = gifDimensions(bytes);
      break;
    case "BMP":
      dims = bmpDimensions(bytes);
      break;
    case "ICO": {
      entries = icoEntries(bytes);
      const squares = entries.filter((e) => e.width === e.height).sort((a, b) => b.width - a.width);
      const pick = squares[0] ?? entries[0];
      dims = pick ? [pick.width, pick.height] : null;
      break;
    }
    case "TIFF":
      dims = tiffDimensions(bytes);
      break;
    case "PPM":
      dims = ppmDimensions(bytes);
      break;
    case "WebP":
      dims = webpDimensions(bytes);
      break;
    case "AVIF":
      dims = avifDimensions(bytes);
      break;
    case "SVG":
      dims = svgDimensions(bytes);
      break;
    default:
      dims = null;
  }
  return { format, width: dims ? dims[0] : null, height: dims ? dims[1] : null, entries };
}
