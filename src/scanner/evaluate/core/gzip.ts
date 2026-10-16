import { constants, gunzipSync } from "node:zlib";

/** True when the bytes start with the gzip magic number. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export interface GunzipResult {
  /** The full output, or (when truncated) the decompressed prefix of the first 1 KiB of input. */
  bytes: Uint8Array;
  truncated: boolean;
  /** The size recorded in the gzip trailer (ISIZE, modulo 2^32). */
  declaredSize: number;
}

function view(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Decompress gzip data up to a byte limit; returns null when the data is not valid gzip. */
export function gunzip(bytes: Uint8Array, maxBytes: number): GunzipResult | null {
  const declaredSize = bytes.length >= 8 ? new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 4, 4).getUint32(0, true) : 0;
  try {
    return { bytes: view(gunzipSync(bytes, { maxOutputLength: maxBytes })), truncated: false, declaredSize };
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      // Decompress only a prefix so the root element can still be read.
      try {
        // Deflate expands at most ~1032:1, so 1 KiB of input stays under 2 MiB of output.
        const prefix = gunzipSync(bytes.subarray(0, 1024), { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: 2 * 1024 * 1024 });
        return { bytes: view(prefix), truncated: true, declaredSize };
      } catch {
        return { bytes: new Uint8Array(0), truncated: true, declaredSize };
      }
    }
    return null;
  }
}
