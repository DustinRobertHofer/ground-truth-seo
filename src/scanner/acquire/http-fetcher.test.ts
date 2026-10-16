import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ssrf", () => ({ resolvePublic: async () => ({ ok: true, addresses: ["93.184.216.34"] }) }));

import { HttpFetcher } from "./http-fetcher.js";

/** A response whose headers arrive at once and whose body then fails with `error`. */
function stalledBody(error: Error): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("<html><head>"));
      controller.error(error);
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

describe("HttpFetcher", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("records a timeout while the body streams as this URL's timeout, not a failed scan", async () => {
    vi.mocked(fetch).mockResolvedValue(stalledBody(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
    const result = await new HttpFetcher("test", 50).fetch({ url: "https://www.example.com/slow", purpose: "crawl", maxBytes: 1024 });
    expect(result).toMatchObject({ outcome: "timeout", status: null, body: null, errorCode: "timeout" });
  });

  it("records a connection dropped mid-body as a connection error", async () => {
    vi.mocked(fetch).mockResolvedValue(stalledBody(Object.assign(new TypeError("terminated"), { cause: { code: "ECONNRESET" } })));
    const result = await new HttpFetcher("test", 50).fetch({ url: "https://www.example.com/reset", purpose: "crawl", maxBytes: 1024 });
    expect(result).toMatchObject({ outcome: "connection_error", status: null, body: null, errorCode: "econnreset" });
  });

  it("still reads a complete body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    const result = await new HttpFetcher("test", 50).fetch({ url: "https://www.example.com/", purpose: "crawl", maxBytes: 1024 });
    expect(result.outcome).toBe("response");
    expect(new TextDecoder().decode(result.body!)).toBe("<html></html>");
  });
});
