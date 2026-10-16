/**
 * Validation for the URL a visitor types into a checker. It runs in the
 * browser for instant feedback and again on the server before a scan, with the
 * same rules as resolveConfig plus a check that the host looks public. The
 * fetcher's DNS guard (PRODUCT.md §13) still decides what may be requested.
 */

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; error: string };

const MAX_LENGTH = 2048;

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function normalizeCheckUrl(raw: string): UrlCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter a website address, such as www.example.com." };
  if (value.length > MAX_LENGTH) return { ok: false, error: "That address is longer than 2,048 characters." };
  if (/\s/.test(value)) return { ok: false, error: "A website address cannot contain spaces." };

  let candidate = value;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      return { ok: false, error: "Only http:// and https:// addresses can be checked." };
    }
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "That does not look like a website address. Try something like www.example.com." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// addresses can be checked." };
  }
  if (url.username || url.password) return { ok: false, error: "Remove the user name and password from the address." };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const ipv6 = host.startsWith("[");
  if (host === "localhost" || /\.(localhost|local|internal)$/.test(host) || (ipv6 && /^\[(::1?|f[cd]|fe[89ab])/.test(host))) {
    return { ok: false, error: "Private and local addresses cannot be checked." };
  }
  if (!ipv6 && !host.includes(".")) {
    return { ok: false, error: "Enter a public domain name, such as www.example.com." };
  }
  if (isIpv4(host) && host.split(".").some((part) => Number(part) > 255)) {
    return { ok: false, error: "That IP address is not valid." };
  }

  url.hash = "";
  return { ok: true, url: url.toString(), host: url.host };
}
