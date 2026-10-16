/**
 * HTML byte decoding per KNOWLEDGE.md §3.3: BOM, Content-Type charset, meta
 * prescan; windows-1252 when none applies. No frequency-based detection.
 */

export interface DecodedHtml {
  text: string;
  /** Canonical Encoding Standard name actually used, e.g. "utf-8", "windows-1252". */
  encoding: string;
  source: "bom" | "header" | "meta" | "default";
  /** The declared label that was resolved (as written), when any. */
  declaredLabel: string | null;
  /** Byte length of a leading BOM that was skipped. */
  bomLength: number;
}

/** Resolve an Encoding Standard label to its canonical name, or null when unknown. */
export function resolveEncodingLabel(label: string): string | null {
  const trimmed = label.trim().toLowerCase();
  if (trimmed === "") return null;
  try {
    const name = new TextDecoder(trimmed).encoding;
    // The HTML Standard maps utf-16 declarations to utf-8 and x-user-defined to windows-1252.
    if (name === "utf-16le" || name === "utf-16be") return "utf-8";
    if (name === "x-user-defined") return "windows-1252";
    return name;
  } catch {
    return null;
  }
}

export function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /;\s*charset\s*=\s*("?)([^";\s]+)\1/i.exec(contentType);
  return match ? match[2]! : null;
}

/** The meta prescan over the first 1024 bytes, simplified from the HTML Standard. */
export function prescanMetaCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 1024));
  const tagRe = /<meta(\s[^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(head)) !== null) {
    const attrs = match[1]!;
    const charset = /\scharset\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
    if (charset) return (charset[2] ?? charset[3] ?? charset[4] ?? "").trim();
    const equiv = /\shttp-equiv\s*=\s*("content-type"|'content-type'|content-type)/i.test(attrs);
    if (equiv) {
      const content = /\scontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
      const value = content ? (content[2] ?? content[3] ?? content[4] ?? "") : "";
      const inner = /charset\s*=\s*("?)([^";\s]+)\1/i.exec(value);
      if (inner) return inner[2]!;
    }
  }
  return null;
}

export function decodeHtml(bytes: Uint8Array, contentType: string | null): DecodedHtml {
  let bomLength = 0;
  let encoding: string | null = null;
  let source: DecodedHtml["source"] = "default";
  let declaredLabel: string | null = null;

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = "utf-8";
    bomLength = 3;
    source = "bom";
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    bomLength = 2;
    source = "bom";
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    bomLength = 2;
    source = "bom";
  }

  if (!encoding) {
    const headerLabel = charsetFromContentType(contentType);
    if (headerLabel) {
      const resolved = resolveEncodingLabel(headerLabel);
      if (resolved) {
        encoding = resolved;
        source = "header";
        declaredLabel = headerLabel;
      }
    }
  }
  if (!encoding) {
    const metaLabel = prescanMetaCharset(bytes);
    if (metaLabel) {
      const resolved = resolveEncodingLabel(metaLabel);
      if (resolved) {
        encoding = resolved;
        source = "meta";
        declaredLabel = metaLabel;
      }
    }
  }
  if (!encoding) {
    encoding = "windows-1252";
    source = "default";
  }

  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: false, ignoreBOM: true }).decode(bytes.subarray(bomLength));
  } catch {
    encoding = "windows-1252";
    source = "default";
    text = new TextDecoder("windows-1252").decode(bytes.subarray(bomLength));
  }
  return { text, encoding, source, declaredLabel, bomLength };
}
