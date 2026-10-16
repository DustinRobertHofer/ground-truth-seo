import { describe, expect, it } from "vitest";
import { isBlockedAddress, resolvePublic } from "./ssrf.js";

describe("SSRF guard (PRODUCT.md §13)", () => {
  it("blocks private, loopback, link-local and metadata IPv4 addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1"]) expect(isBlockedAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it("blocks loopback, unspecified, unique-local and link-local IPv6 addresses", () => {
    for (const ip of ["::1", "::", "0:0:0:0:0:0:0:1", "[::1]", "fd00::1", "fc12::", "fe80::1", "fe80::1%eth0", "2001:db8::1"]) expect(isBlockedAddress(ip), ip).toBe(true);
    for (const ip of ["2606:2800:220:1:248:1893:25c8:1946", "2001:4860:4860::8888"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it("judges an IPv6 address that carries an IPv4 address by that address, in every notation", () => {
    // Node's URL parser rewrites [::ffff:127.0.0.1] as [::ffff:7f00:1], and fetch connects it to 127.0.0.1.
    expect(new URL("http://[::ffff:127.0.0.1]/").hostname).toBe("[::ffff:7f00:1]");
    for (const ip of [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "[::ffff:7f00:1]",
      "::ffff:a9fe:a9fe",
      "0:0:0:0:0:ffff:a00:1",
      "::ffff:c0a8:101",
      "::127.0.0.1",
      "::7f00:1",
      "64:ff9b::a9fe:a9fe",
      "64:ff9b::10.0.0.1",
    ])
      expect(isBlockedAddress(ip), ip).toBe(true);
    for (const ip of ["::ffff:5db8:d822", "::ffff:93.184.216.34", "64:ff9b::808:808"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it("refuses an address it cannot parse", () => {
    for (const ip of ["::ffff:7f00:1:2:3:4:5:6", "1::2::3", "::gggg", "::ffff:300.0.0.1"]) expect(isBlockedAddress(ip), ip).toBe(true);
  });

  it("refuses an IPv6 literal host that maps to a blocked IPv4 address before any request", async () => {
    for (const host of [new URL("http://[::ffff:127.0.0.1]/").hostname, "[::ffff:a9fe:a9fe]", "[64:ff9b::7f00:1]"]) {
      expect(await resolvePublic(host), host).toEqual({ ok: false, reason: "blocked" });
    }
  });
});
