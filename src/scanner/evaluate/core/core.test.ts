import { describe, expect, it } from "vitest";
import { canonicalize } from "../../snapshot/canonical-json.js";
import { sha256Hex } from "../../snapshot/sha256.js";
import { parseIso8601, parseLastmod, parseRfc822or850 } from "./dates.js";
import { effectiveGoogleDirectives, splitHeaderField } from "./directives.js";
import { decodeHtml } from "./encoding.js";
import { parseHtml } from "./html.js";
import { readImage, sniffFormat } from "./image.js";
import { isWellFormedBcp47, validateHreflang } from "./lang-codes.js";
import { formatRational, rational, roundHalfUp } from "./rational.js";
import { decideAccess, parseRobotsTxt, productToken, selectGroups } from "./robots-txt.js";
import { parseSitemap } from "./sitemap.js";
import { compareBytes, firstInvalidUtf8, formatExamples, formatInt, formatThousandths, normalizeText } from "./text.js";
import { comparisonKey, variantOrigins } from "./url.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("robots.txt (§3.6) — Google's precedence examples", () => {
  const robots = (body: string) => parseRobotsTxt(enc(body));
  const access = (body: string, path: string, chain = ["googlebot", "*"]) => decideAccess(robots(body), chain, path).allowed;

  it("longest match wins, allow wins ties", () => {
    expect(access("user-agent: *\nallow: /p\ndisallow: /", "/page")).toBe(true);
    expect(access("user-agent: *\nallow: /folder\ndisallow: /folder", "/folder/page")).toBe(true);
    expect(access("user-agent: *\nallow: /page\ndisallow: /*.htm", "/page.htm")).toBe(false);
    expect(access("user-agent: *\nallow: /page\ndisallow: /*.ph", "/page.php5")).toBe(true);
    expect(access("user-agent: *\nallow: /$\ndisallow: /", "/")).toBe(true);
    expect(access("user-agent: *\nallow: /$\ndisallow: /", "/page.htm")).toBe(false);
  });

  it("matches wildcards, anchors and queries", () => {
    expect(access("user-agent: *\ndisallow: /fish*.php", "/fish.php")).toBe(false);
    expect(access("user-agent: *\ndisallow: /fish*.php", "/fishheads/catfish.php?parameters")).toBe(false);
    expect(access("user-agent: *\ndisallow: /fish*.php", "/Fish.PHP")).toBe(true);
    expect(access("user-agent: *\ndisallow: /*.php$", "/filename.php")).toBe(false);
    expect(access("user-agent: *\ndisallow: /*.php$", "/filename.php?parameters")).toBe(true);
    expect(access("user-agent: *\ndisallow: /*?sort=", "/list?sort=price")).toBe(false);
    expect(access("user-agent: *\ndisallow: /", "/robots.txt")).toBe(true);
  });

  it("selects the most specific group and merges same-token groups", () => {
    const body = "user-agent: googlebot-news\ndisallow: /news\n\nuser-agent: *\ndisallow: /all\n\nuser-agent: Googlebot/2.1\ndisallow: /g1\n\nuser-agent: googlebot\ndisallow: /g2\n";
    const parsed = robots(body);
    expect(productToken("Googlebot/2.1")).toBe("googlebot");
    expect(selectGroups(parsed, ["googlebot-news", "googlebot", "*"]).token).toBe("googlebot-news");
    expect(selectGroups(parsed, ["googlebot", "*"]).rules.map((r) => r.pattern).sort()).toEqual(["/g1", "/g2"]);
    expect(selectGroups(parsed, ["bingbot", "msnbot", "*"]).token).toBe("*");
    expect(access(body, "/all")).toBe(true);
    expect(access(body, "/g1")).toBe(false);
    expect(access(body, "/all", ["bingbot", "msnbot", "*"])).toBe(false);
  });

  it("ignores rules before the first group, unsupported fields, unrooted paths and comments", () => {
    const parsed = robots("disallow: /early\n# comment\nuser-agent: * # trailing\ncrawl-delay: 5\ndisallow: nope\ndisallow: /ok\nnoindex: /x\nsitemap: https://a.example/s.xml\nuser-agent: b\ndisallow: /b\n");
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]!.rules.map((r) => r.pattern)).toEqual(["/ok"]);
    expect(parsed.ignored.map((l) => l.reason).sort()).toEqual(["path_not_rooted", "rule_before_group", "unsupported_field", "unsupported_field"]);
    expect(parsed.noindexLines).toHaveLength(1);
    expect(parsed.sitemaps[0]!.value).toBe("https://a.example/s.xml");
  });

  it("drops lines beyond 512,000 bytes and records invalid UTF-8", () => {
    const filler = `user-agent: *\n${"disallow: /a\n".repeat(40_000)}`;
    const body = enc(`${filler}disallow: /late\n`);
    const parsed = parseRobotsTxt(body);
    expect(parsed.bytes).toBeGreaterThan(512_000);
    expect(parsed.overLimit).not.toBeNull();
    expect(parsed.groups[0]!.rules.some((r) => r.pattern === "/late")).toBe(false);
    const bad = new Uint8Array([...enc("user-agent: *\ndisallow: /"), 0xff, 0x0a]);
    expect(parseRobotsTxt(bad).invalidUtf8Line).toBe(2);
  });
});

describe("URL comparison key (§3.1)", () => {
  it("normalizes case, ports, percent-encoding and fragments", () => {
    expect(comparisonKey("HTTP://Example.COM:80/a%7eb/%41?q=%3a#frag")).toBe("http://example.com/a~b/A?q=%3A");
    expect(comparisonKey("https://example.com/path?")).toBe("https://example.com/path?");
    expect(comparisonKey("/Rel?b=1&a=2", "https://example.com/dir/page")).toBe("https://example.com/Rel?b=1&a=2");
    expect(comparisonKey("mailto:x@example.com")).toBeNull();
    expect(comparisonKey("  https://example.com/x  ")).toBe("https://example.com/x");
  });
  it("derives variant origins", () => {
    expect(variantOrigins("https://www.example.com")).toEqual(["http://example.com", "http://www.example.com", "https://example.com"]);
  });
});

describe("effective robots directives (§3.7)", () => {
  const now = Date.UTC(2026, 9, 3, 12);
  it("scopes header fields and combines negative rules", () => {
    expect(splitHeaderField("otherbot: noindex")).toEqual({ scopedTo: "otherbot", segments: ["noindex"] });
    expect(splitHeaderField("googlebot: noindex, nofollow").segments).toEqual(["noindex", "nofollow"]);
    const d = effectiveGoogleDirectives({ metas: [{ name: "robots", content: "max-snippet:50", line: 1 }, { name: "googlebot", content: "nosnippet", line: 2 }], xRobotsTag: ["otherbot: noindex", "googlebot: noimageindex"] }, now);
    expect(d.noindex).toBe(false);
    expect(d.nosnippet).toBe(true);
    expect(d.maxSnippet).toBe(50);
    expect(d.noimageindex).toBe(true);
  });
  it("handles none, max-snippet:0, smallest max-snippet and unavailable_after with commas", () => {
    const d = effectiveGoogleDirectives({ metas: [{ name: "robots", content: "none, max-snippet:20, max-snippet:-1, max-snippet:10", line: 1 }], xRobotsTag: ["unavailable_after: Wednesday, 03-Oct-26 10:00:00 GMT", "noarchive, bogus"] }, now);
    expect(d.noindex).toBe(true);
    expect(d.nofollow).toBe(true);
    expect(d.maxSnippet).toBe(10);
    expect(d.unavailableAfter[0]!.raw).toBe("Wednesday, 03-Oct-26 10:00:00 GMT");
    expect(d.unavailableAfterPassed).not.toBeNull();
    expect(d.unused).toEqual(["noarchive"]);
    expect(d.unrecognized).toEqual(["bogus"]);
    const zero = effectiveGoogleDirectives({ metas: [{ name: "robots", content: "max-snippet:0", line: 1 }], xRobotsTag: [] }, now);
    expect(zero.nosnippet).toBe(true);
    const future = effectiveGoogleDirectives({ metas: [], xRobotsTag: ["unavailable_after: 2027-01-01T00:00:00Z"] }, now);
    expect(future.noindex).toBe(false);
  });
});

describe("dates", () => {
  it("parses ISO 8601, RFC 822 and RFC 850", () => {
    expect(parseIso8601("2026-10-03T12:00:00Z")).toBe(Date.UTC(2026, 9, 3, 12));
    expect(parseIso8601("2026-10-03T14:00:00+02:00")).toBe(Date.UTC(2026, 9, 3, 12));
    expect(parseRfc822or850("Sat, 03 Oct 2026 12:00:00 GMT")).toBe(Date.UTC(2026, 9, 3, 12));
    expect(parseRfc822or850("Saturday, 03-Oct-26 12:00:00 GMT")).toBe(Date.UTC(2026, 9, 3, 12));
    expect(parseIso8601("not a date")).toBeNull();
  });
  it("accepts W3C Datetime lastmod forms and uses UTC+14 for dates", () => {
    expect(parseLastmod("2026").valid).toBe(true);
    expect(parseLastmod("2026-09").valid).toBe(true);
    const date = parseLastmod("2026-10-03");
    expect(date.valid && !date.hasTime && date.earliest === Date.UTC(2026, 9, 3) - 14 * 3_600_000).toBe(true);
    expect(parseLastmod("2026-10-03T10:00+02:00").valid).toBe(true);
    expect(parseLastmod("2026-10-03T10:00:00.5Z").valid).toBe(true);
    expect(parseLastmod("2026-10-03T10:00:00").valid).toBe(false);
    expect(parseLastmod("03/10/2026").valid).toBe(false);
  });
});

describe("hreflang codes (§3.9)", () => {
  it("validates in the fixed order", () => {
    expect(validateHreflang("x-default").valid).toBe(true);
    expect(validateHreflang("en").valid).toBe(true);
    expect(validateHreflang("en-GB").valid).toBe(true);
    expect(validateHreflang("zh-Hant").valid).toBe(true);
    expect(validateHreflang("ZH-hans-us").valid).toBe(true);
    expect(validateHreflang("be").valid).toBe(true);
    expect(validateHreflang("US")).toEqual({ valid: false, condition: "region_only" });
    expect(validateHreflang("UK").valid).toBe(true); // Ukrainian: a language code wins when a subtag is in both lists
    expect(validateHreflang("es-419")).toEqual({ valid: false, condition: "unsupported_code" });
    expect(validateHreflang("eng")).toEqual({ valid: false, condition: "unsupported_code" });
    expect(validateHreflang("en-UK")).toEqual({ valid: false, condition: "unsupported_code" });
    expect(validateHreflang("en_US")).toEqual({ valid: false, condition: "malformed" });
    expect(isWellFormedBcp47("en-US")).toBe(true);
    expect(isWellFormedBcp47("english")).toBe(true);
    expect(isWellFormedBcp47("en US")).toBe(false);
  });
});

describe("rationals and formats", () => {
  it("rounds half up and reduces fractions", () => {
    expect(roundHalfUp(rational(1, 2))).toBe(1n);
    expect(roundHalfUp(rational(583300, 6840))).toBe(85n);
    expect(formatRational(rational(60, 38))).toBe("30/19");
    expect(formatInt(2140512)).toBe("2,140,512");
    expect(formatInt(999)).toBe("999");
    expect(formatThousandths(105)).toBe("0.105");
    expect(formatExamples(["a", "b", "c", "d", "e"])).toBe("a, b, c and 2 more");
    expect(normalizeText("  a \t\n b  ")).toBe("a b");
    expect(compareBytes("a", "é")).toBeLessThan(0);
    expect(firstInvalidUtf8(new Uint8Array([0x61, 0xc3, 0xa9, 0xff]))).toBe(3);
  });
});

describe("canonical JSON (RFC 8785)", () => {
  it("sorts keys, escapes strings and rejects non-integers", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x\u0007\"\\"], "é": 0 })).toBe('{"a":[true,null,"x\\u0007\\"\\\\"],"b":1,"é":0}');
    expect(() => canonicalize({ x: 1.5 })).toThrow();
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("images (§3.10)", () => {
  it("sniffs formats and reads dimensions", () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 96, 0, 0, 0, 48]);
    expect(readImage(png)).toMatchObject({ format: "PNG", width: 96, height: 48 });
    const gif = new Uint8Array([...enc("GIF89a"), 16, 0, 32, 0]);
    expect(readImage(gif)).toMatchObject({ format: "GIF", width: 16, height: 32 });
    const ico = new Uint8Array([0, 0, 1, 0, 2, 0, 16, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const icoInfo = readImage(ico);
    expect(icoInfo.format).toBe("ICO");
    expect(icoInfo.entries).toEqual([{ width: 16, height: 16 }, { width: 256, height: 256 }]);
    expect(sniffFormat(enc('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>'))).toBe("SVG");
    expect(readImage(enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>'))).toMatchObject({ format: "SVG", width: 24, height: 24 });
    expect(sniffFormat(enc("hello"))).toBe("unknown");
  });
});

describe("encoding sniffing (§3.3)", () => {
  it("uses BOM, then header, then meta prescan, else windows-1252", () => {
    expect(decodeHtml(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), null)).toMatchObject({ encoding: "utf-8", source: "bom", text: "a" });
    expect(decodeHtml(enc("<html>"), "text/html; charset=ISO-8859-1").encoding).toBe("windows-1252");
    expect(decodeHtml(enc('<html><head><meta charset="utf-8">'), null)).toMatchObject({ encoding: "utf-8", source: "meta" });
    expect(decodeHtml(enc('<meta http-equiv="Content-Type" content="text/html; charset=utf-8">'), null).source).toBe("meta");
    expect(decodeHtml(enc("<html>"), null)).toMatchObject({ encoding: "windows-1252", source: "default" });
  });
});

describe("sitemaps (§3.13)", () => {
  it("parses XML, plain text and feeds", () => {
    const xml = parseSitemap(enc('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://a.example/</loc><lastmod>2026-01-01</lastmod><xhtml:link rel="alternate" hreflang="de" href="https://a.example/de"/></url></urlset>'));
    expect(xml.kind).toBe("urlset");
    expect(xml.entries[0]!.alternates).toEqual([{ hreflang: "de", href: "https://a.example/de" }]);
    expect(parseSitemap(enc("https://a.example/\nhttps://a.example/b\n")).entries).toHaveLength(2);
    expect(parseSitemap(enc("<rss><channel></channel></rss>")).kind).toBe("feed");
    const bad = parseSitemap(enc("<urlset><url></urlset>"));
    expect(bad.kind).toBe("invalid");
    expect(bad.error?.line).toBe(1);
    expect(parseSitemap(enc('<foo xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')).kind).toBe("invalid");
    expect(parseSitemap(enc('<sm:sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:sitemap><sm:loc>https://a.example/s1.xml</sm:loc></sm:sitemap></sm:sitemapindex>')).children).toHaveLength(1);
  });
});

describe("parseHtml scripting modes", () => {
  const parse = (html: string) => parseHtml(new TextEncoder().encode(html), "text/html; charset=utf-8");

  it("finds a head closed early by an img the same way in both modes when there is no noscript", () => {
    const parsed = parse(`<!doctype html><html><head><title>T</title><img src="/x.gif"><link rel="canonical" href="/"></head><body></body></html>`);
    expect(parsed.culprit).not.toBeNull();
    expect(parsed.noscriptCulprit).toEqual(parsed.culprit);
  });

  it("still parses without scripting when a noscript is present, in any letter case", () => {
    for (const tag of ["noscript", "NOSCRIPT", "NoScript"]) {
      const parsed = parse(`<!doctype html><html><head><title>T</title><${tag}><img src="/x.gif"></${tag}><link rel="canonical" href="/"></head><body></body></html>`);
      expect(parsed.culprit, tag).toBeNull();
      expect(parsed.noscriptCulprit, tag).not.toBeNull();
    }
  });
});
