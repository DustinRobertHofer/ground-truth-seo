import { describe, expect, it } from "vitest";
import { acquire } from "../src/scanner/acquire/crawl.js";
import { resolveConfig } from "../src/scanner/config.js";
import { SCANNER_VERSION } from "../src/scanner/evaluate/index.js";
import { acquireForSecurity, securityInput } from "../src/security/acquire.js";
import { LineIndex } from "../src/security/detect.js";
import { buildSecurityResult } from "../src/security/run.js";
import type { SecurityResult } from "../src/security/types.js";
import { FAKE } from "./secrets.js";
import { baselineSite, FIXED_NOW, MemoryFetcher, page, text, type FakeResponse, type FakeSite } from "../src/testing/index.js";

const ORIGIN = "https://www.example.com";

async function check(site: FakeSite, url = `${ORIGIN}/`, terms: string[] = []) {
  const config = resolveConfig(securityInput(url));
  const snapshot = await acquireForSecurity(config, { fetcher: new MemoryFetcher(site), now: () => new Date(FIXED_NOW), scannerVersion: SCANNER_VERSION, caBundleVersion: "fixture" });
  return { result: buildSecurityResult(snapshot, config, terms), snapshot, config };
}

function js(body: string, headers: Record<string, string> = {}): FakeResponse {
  return { status: 200, headers: { "content-type": "application/javascript", ...headers }, body };
}

function json(value: unknown): FakeResponse {
  return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(value) };
}

/** The baseline site with scripts on its home page. */
function siteWithScripts(scripts: string[], responses: Record<string, FakeResponse | string>): FakeSite {
  const site = baselineSite();
  const tags = scripts.map((src) => `<script src="${src}"></script>`).join("");
  site.responses[`${ORIGIN}/`] = page("Example Home", `<link rel="canonical" href="${ORIGIN}/">${tags}`, `<h1>Example</h1><a href="/about">About</a>`);
  Object.assign(site.responses, responses);
  return site;
}

function issue(result: SecurityResult, checkId: string, condition: string) {
  return result.issues.find((i) => i.check_id === checkId && i.condition === condition);
}

function status(result: SecurityResult, checkId: string) {
  return result.checks.find((c) => c.id === checkId)!.status;
}

/** Every planted value must stay out of the serialized result (KNOWLEDGE.md §12.2). */
function expectRedacted(result: SecurityResult, secrets: string[]) {
  const serialized = JSON.stringify(result);
  for (const secret of secrets) {
    expect(serialized.includes(secret), `result leaks ${secret.slice(0, 6)}…`).toBe(false);
    // Nor any long piece of it.
    for (let i = 0; i + 12 <= secret.length; i += 6) expect(serialized.includes(secret.slice(i, i + 12)), secret.slice(0, 6)).toBe(false);
  }
}

describe("a site that serves nothing sensitive", () => {
  it("reports every check clear, with scripts absent", async () => {
    const { result } = await check(baselineSite());
    expect(result.reach.status).toBe("ok");
    expect(result.findingCount).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.checks.every((c) => c.status === "clear"), JSON.stringify(result.checks)).toBe(true);
    expect(result.checks.find((c) => c.id === "SEC-MAP-01")!.notes).toEqual(["The loaded pages reference no same-site scripts, so there were no source maps to look for."]);
    expect(result.files.every((f) => f.verdict === "not_served" && f.outcome === "HTTP 404")).toBe(true);
    expect(result.pages).toEqual([`${ORIGIN}/`, `${ORIGIN}/about`, `${ORIGIN}/contact`]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("never reports a server that answers every path with an HTML page", async () => {
    const site = baselineSite();
    site.fallbackStatus = 200;
    const { result } = await check(site);
    expect(result.findingCount).toBe(0);
    expect(result.files.every((f) => f.verdict === "not_served" && f.html)).toBe(true);
  });

  it("does not change what a scan acquires", async () => {
    const config = resolveConfig({ start_url: `${ORIGIN}/` });
    const snapshot = await acquire(config, { fetcher: new MemoryFetcher(baselineSite()), now: () => new Date(FIXED_NOW), scannerVersion: SCANNER_VERSION, caBundleVersion: "fixture" });
    expect(snapshot.exchanges.some((e) => e.purpose === "exposure" || e.purpose === "script" || e.purpose === "source_map")).toBe(false);
  });
});

describe("SEC-VCS-01 · Git repository", () => {
  it("reports HEAD and config, and the password in a remote URL without the password", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/.git/HEAD`] = text("ref: refs/heads/main\n");
    site.responses[`${ORIGIN}/.git/config`] = text(`[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://deploy:${FAKE.dbPassword}@git.acme-internal.net/site.git\n`);
    const { result } = await check(site);
    expect(status(result, "SEC-VCS-01")).toBe("found");
    expect(issue(result, "SEC-VCS-01", "head")!.findings[0]!.reason).toBe(
      `${ORIGIN}/.git/HEAD returned a Git HEAD file, so the server publishes the site's Git repository. Git documents a "dumb" HTTP protocol that needs only a standard HTTP server, so anyone may be able to download the repository: its source code, its history and every secret ever committed to it.`,
    );
    expect(issue(result, "SEC-VCS-01", "config")).toBeDefined();
    const remote = issue(result, "SEC-SECRET-03", "url_password")!;
    expect(remote.findings[0]).toMatchObject({ url: `${ORIGIN}/.git/config`, line: 4, column: 8, label: "https URL with a password for git.acme-internal.net" });
    expect(remote.findings[0]!.reason).toContain(`${ORIGIN}/.git/config, line 4, column 8 contains a https URL with a user name and password for git.acme-internal.net`);
    expect(result.issues[0]!.exposes).toBe("credentials");
    expectRedacted(result, [FAKE.dbPassword]);
  });

  it("does not request paths robots.txt disallows, and says so", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = text(`User-agent: *\nDisallow: /.git/\nSitemap: ${ORIGIN}/sitemap.xml\n`);
    site.responses[`${ORIGIN}/.git/HEAD`] = text("ref: refs/heads/main\n");
    const { result, snapshot } = await check(site);
    expect(status(result, "SEC-VCS-01")).toBe("not_checked");
    expect(result.checks.find((c) => c.id === "SEC-VCS-01")!.notes).toContain(`robots.txt disallows the scanner from ${ORIGIN}/.git/HEAD, so it was not requested.`);
    expect(snapshot.exchanges.find((e) => e.request.url === `${ORIGIN}/.git/HEAD`)!.outcome).toBe("blocked_by_robots_policy");
  });
});

describe("SEC-FILE-01 · environment files", () => {
  it("lists variable names and never values", async () => {
    const site = baselineSite();
    const env = `# production\nDATABASE_URL=postgres://app:${FAKE.dbPassword}@db.acme-internal.net/main\nSTRIPE_SECRET_KEY=${FAKE.envValue}\nGITHUB_TOKEN=${FAKE.classic}\nPRIVATE_KEY="${FAKE.pem("RSA PRIVATE KEY")}"\n`;
    site.responses[`${ORIGIN}/.env.production`] = text(env);
    site.responses[`${ORIGIN}/.env`] = page("Not found");
    const { result } = await check(site);
    const served = issue(result, "SEC-FILE-01", "served")!;
    expect(served.count).toBe(1);
    expect(served.findings[0]).toMatchObject({ url: `${ORIGIN}/.env.production`, names: ["DATABASE_URL", "GITHUB_TOKEN", "PRIVATE_KEY", "STRIPE_SECRET_KEY"], namesTotal: 4 });
    expect(served.findings[0]!.reason).toBe(
      `${ORIGIN}/.env.production returned an environment file that sets 4 variables (DATABASE_URL, GITHUB_TOKEN, PRIVATE_KEY, STRIPE_SECRET_KEY). OWASP lists .env among files that "Should generally never be publicly served", and every value in this one should now be treated as public.`,
    );
    expect(result.files.find((f) => f.path === "/.env")).toMatchObject({ verdict: "not_served", html: true });
    // The file itself is the finding; its values are not searched or repeated.
    expect(result.issues.map((i) => i.check_id)).toEqual(["SEC-FILE-01"]);
    expectRedacted(result, [FAKE.dbPassword, FAKE.envValue, FAKE.classic]);
  });
});

describe("SEC-FILE-02 · credential files", () => {
  it("reports each file with counts and hosts only", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/.git-credentials`] = text(`https://ci:${FAKE.dbPassword}@github.com\nhttps://ops:${FAKE.hexSecret}@gitlab.com\n`);
    site.responses[`${ORIGIN}/.npmrc`] = text(`registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${FAKE.hexSecret}\n`);
    site.responses[`${ORIGIN}/.htpasswd`] = text("admin:$apr1$Kq4.Hx2/$Vb9ZRf3oNp8LmT1sYc6Jd/\n");
    const { result } = await check(site);
    expect(issue(result, "SEC-FILE-02", "git_credentials")!.findings[0]!.reason).toBe(
      `${ORIGIN}/.git-credentials returned a Git credential store with 2 saved credentials for github.com, gitlab.com. Git stores these passwords unencrypted, so anyone who requests this URL can read them.`,
    );
    expect(issue(result, "SEC-FILE-02", "git_credentials")!.citations.map((c) => c.source_id)).toEqual(["OWASP-WSTG-CONF-04", "GIT-CRED-STORE", "OWASP-SECRETS"]);
    expect(issue(result, "SEC-FILE-02", "npmrc")!.findings[0]!.names).toEqual(["registry.npmjs.org"]);
    expect(issue(result, "SEC-FILE-02", "npmrc")!.citations.map((c) => c.source_id)).toEqual(["OWASP-WSTG-CONF-04", "OWASP-SECRETS"]);
    expect(issue(result, "SEC-FILE-02", "htpasswd")!.findings[0]!.reason).toContain("returned a password file with 1 entries");
    expectRedacted(result, [FAKE.dbPassword, FAKE.hexSecret, "Vb9ZRf3oNp8LmT1sYc6Jd"]);
  });

  it("ignores an .npmrc that reads its token from the environment", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/.npmrc`] = text("//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
    const { result } = await check(site);
    expect(result.files.find((f) => f.path === "/.npmrc")!.verdict).toBe("not_served");
    expect(result.findingCount).toBe(0);
  });
});

describe("scripts and source maps", () => {
  it("finds secrets in a same-site script and in the original source its map publishes", async () => {
    const original = `export const config = {\n  token: "${FAKE.oauth}",\n};\n`;
    const map = { version: 3, sources: ["webpack://app/src/config.ts", "webpack://app/src/main.ts"], sourcesContent: [original, null], mappings: "" };
    const script = [
      `var a={clientSecret:"${FAKE.hexSecret}"};`,
      `var b="${FAKE.classic}";`,
      `var c="${FAKE.pem("PRIVATE KEY", true)}";`,
      `var d="postgres://app:${FAKE.dbPassword}@db.acme-internal.net/main";`,
      "//# sourceMappingURL=app.js.map",
    ].join("\n");
    const site = siteWithScripts(["/static/app.js", "https://cdn.other-site.net/lib.js"], {
      [`${ORIGIN}/static/app.js`]: js(script),
      [`${ORIGIN}/static/app.js.map`]: json(map),
    });
    const { result, snapshot } = await check(site);

    const sourceMap = issue(result, "SEC-MAP-01", "sources_content")!;
    expect(sourceMap.exposes).toBe("source code");
    expect(sourceMap.findings[0]!.reason).toBe(
      `The source map for ${ORIGIN}/static/app.js at ${ORIGIN}/static/app.js.map, named by its sourceMappingURL comment, lists 2 source files (webpack://app/src/config.ts, webpack://app/src/main.ts) and carries the original text of 1 of them. The source map format defines sourcesContent as a list of "the original source" strings, so anyone can read that code as it was written.`,
    );
    expect(sourceMap.citations.map((c) => c.source_id)).toEqual(["OWASP-WSTG-INFO-05", "OWASP-WSTG-INFO-05", "ECMA-426", "NEXT-SOURCEMAPS"]);

    const tokens = issue(result, "SEC-SECRET-01", "github_token")!;
    expect(tokens.findings.map((f) => [f.url, f.source, f.line, f.label])).toEqual([
      [`${ORIGIN}/static/app.js`, null, 2, "GitHub personal access token (classic)"],
      [`${ORIGIN}/static/app.js.map`, "webpack://app/src/config.ts", 2, "GitHub OAuth access token"],
    ]);
    expect(tokens.findings[1]!.reason).toBe(
      `webpack://app/src/config.ts in the source map ${ORIGIN}/static/app.js.map, line 2, column 11 contains a GitHub OAuth access token, recognized by its gho_ prefix. GitHub issues tokens that begin with a prefix to indicate the token's type, and anyone who loads this file can read this one.`,
    );
    expect(issue(result, "SEC-SECRET-02", "private_key")!.findings[0]).toMatchObject({ line: 3, label: "PEM PRIVATE KEY" });
    expect(issue(result, "SEC-SECRET-03", "url_password")!.findings[0]).toMatchObject({ line: 4, label: "postgres URL with a password for db.acme-internal.net" });
    expect(issue(result, "SEC-SECRET-04", "named_value")!.findings[0]).toMatchObject({ line: 1, column: 22, label: "Value assigned to clientSecret" });

    // Credentials first, then source code.
    expect(result.issues.map((i) => `${i.check_id} ${i.condition}`)).toEqual([
      "SEC-SECRET-01 github_token",
      "SEC-SECRET-02 private_key",
      "SEC-SECRET-03 url_password",
      "SEC-SECRET-04 named_value",
      "SEC-MAP-01 sources_content",
    ]);
    expect(result.byExposes).toEqual({ credentials: 5, "source code": 1, "file paths": 0 });
    // The script on another site is neither listed nor fetched.
    expect(result.scripts.map((s) => s.url)).toEqual([`${ORIGIN}/static/app.js`]);
    expect(snapshot.exchanges.some((e) => e.request.url.startsWith("https://cdn.other-site.net/"))).toBe(false);
    expectRedacted(result, [FAKE.oauth, FAKE.classic, FAKE.hexSecret, FAKE.dbPassword, "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw"]);
  });

  it("finds a map by the .map convention and reports file paths only", async () => {
    const site = siteWithScripts(["/static/vendor.js"], {
      [`${ORIGIN}/static/vendor.js`]: js("console.log(1)"),
      [`${ORIGIN}/static/vendor.js.map`]: json({ version: 3, sources: Array.from({ length: 12 }, (_, i) => `src/file${String(i).padStart(2, "0")}.ts`), mappings: "" }),
    });
    const { result } = await check(site);
    const paths = issue(result, "SEC-MAP-01", "paths_only")!;
    expect(paths.exposes).toBe("file paths");
    expect(paths.findings[0]!.reason).toContain(`at ${ORIGIN}/static/vendor.js.map, found by adding .map to its URL, lists 12 source files (src/file00.ts, src/file01.ts`);
    expect(paths.findings[0]!.reason).toContain("src/file09.ts and 2 more) without their text.");
    expect(paths.citations.map((c) => c.source_id)).not.toContain("ECMA-426");
    expect(result.scripts[0]!.map).toMatchObject({ via: "convention", verdict: "paths_only", sources: 12, outcome: "HTTP 200" });
  });

  it("reads a map embedded as a data: URL and a map named by the SourceMap header", async () => {
    const inline = Buffer.from(JSON.stringify({ version: 3, sources: ["a.ts"], sourcesContent: ["let a = 1"], mappings: "" })).toString("base64");
    const site = siteWithScripts(["/a.js", "/b.js"], {
      [`${ORIGIN}/a.js`]: js(`let a=1\n//# sourceMappingURL=data:application/json;base64,${inline}`),
      [`${ORIGIN}/b.js`]: js("let b=2", { sourcemap: "/maps/b.map" }),
      [`${ORIGIN}/maps/b.map`]: json({ version: 3, sources: ["b.ts"], mappings: "" }),
    });
    const { result } = await check(site);
    expect(issue(result, "SEC-MAP-01", "sources_content")!.findings[0]!.reason).toContain(`The source map for ${ORIGIN}/a.js, embedded in it as a data: URL, lists 1 source files`);
    expect(issue(result, "SEC-MAP-01", "paths_only")!.findings[0]!.reason).toContain(`at ${ORIGIN}/maps/b.map, named by its sourcemap header`);
  });

  it("ignores a .map URL that answers with the site's HTML page", async () => {
    const site = siteWithScripts(["/static/app.js"], { [`${ORIGIN}/static/app.js`]: js("let a=1") });
    site.fallbackStatus = 200;
    const { result } = await check(site);
    expect(result.scripts[0]!.map).toMatchObject({ verdict: "not_a_map" });
    expect(status(result, "SEC-MAP-01")).toBe("clear");
  });

  it("does not report documentation placeholders on a page", async () => {
    const site = baselineSite();
    const docs = [
      `<pre>GITHUB_TOKEN=${["gh", "p_"].join("")}${"x".repeat(36)}</pre>`,
      "<pre>DATABASE_URL=postgres://user:password@localhost:5432/mydb</pre>",
      "<pre>-----BEGIN RSA PRIVATE KEY-----\n...\nKh9NV...\n-----END RSA PRIVATE KEY-----</pre>",
      `<pre>clientSecret: "your-client-secret-1234567890"</pre>`,
      `<script>var s={passwordField:"LoginForm_passwordField__a1B2c3"}</script>`,
      "<pre>https://deploy:hunter2x@example.com/repo.git</pre>",
    ].join("\n");
    site.responses[`${ORIGIN}/about`] = page("About Example", "", `<h1>Docs</h1>${docs}`);
    const { result } = await check(site);
    expect(result.findingCount).toBe(0);
  });
});

/** The record a property page passes whole to a client component, owner and all. */
function propertyRecord() {
  return {
    id: "p_1",
    name: "Beach House",
    countryCode: "US",
    lockboxCode: FAKE.lockboxCode,
    doorCode: "$undefined",
    gateCode: Number(FAKE.gateCode),
    stripeClientSecret: FAKE.hexSecret,
    owner: { email: "owner@acme-internal.net", passwordHash: FAKE.bcrypt },
  };
}

/** A page that embeds the record as Next.js flight data: JSON inside a JavaScript string, every quote escaped. */
function flightPage(record: unknown): FakeResponse {
  const payload = JSON.stringify(`5:["$","$L6",null,{"property":${JSON.stringify(record)}}]\n`);
  return page("Beach House", "", `<h1>Beach House</h1><script>self.__next_f.push([1,${payload}])</script>`);
}

/** Line and column of `value` in a fixture response, as the result counts them. */
function positionOf(response: FakeResponse, value: string) {
  const body = String(response.body);
  return new LineIndex(body).position(body.indexOf(value));
}

describe("SEC-DATA · data a page sends but does not show", () => {
  it("reports access codes and password hashes in embedded data, by name and position only", async () => {
    const site = baselineSite();
    const about = flightPage(propertyRecord());
    site.responses[`${ORIGIN}/about`] = about;
    const { result } = await check(site);

    const codes = issue(result, "SEC-DATA-01", "access_code")!;
    expect(codes.exposes).toBe("credentials");
    expect(codes.findings.map((f) => [f.url, f.label])).toEqual([
      [`${ORIGIN}/about`, "Access code assigned to lockboxCode"],
      [`${ORIGIN}/about`, "Access code assigned to gateCode"],
    ]);
    const { line, column } = positionOf(about, FAKE.lockboxCode);
    expect(codes.findings[0]).toMatchObject({ line, column });
    expect(codes.findings[0]!.reason).toBe(
      `${ORIGIN}/about, line ${line}, column ${column} assigns a value to lockboxCode, a name that marks an access code, so anyone who loads this file can read the code, whether or not the page displays it. OWASP's API security guidance describes the cause: "The API endpoint exposes properties of an object that are considered sensitive and should not be read by the user."`,
    );
    expect(codes.citations.map((c) => c.source_id)).toEqual(["OWASP-API3", "OWASP-API3", "NEXT-DATA-SECURITY", "REACT-TAINT-OBJECT"]);

    const hashes = issue(result, "SEC-DATA-02", "password_hash")!;
    expect(hashes.findings[0]!.label).toBe("Password hash assigned to passwordHash");
    expect(hashes.findings[0]!.reason).toContain("assigns a password hash, recognized by its $2b$ prefix, to passwordHash, so anyone who loads this file can copy it.");
    expect(hashes.citations.map((c) => c.source_id)).toEqual(["REACT-TAINT-VALUE", "OWASP-API3", "NEXT-DATA-SECURITY"]);

    // Escaped quotes no longer hide a value assigned to a name that marks a secret.
    expect(issue(result, "SEC-SECRET-04", "named_value")!.findings.map((f) => f.label)).toEqual(["Value assigned to stripeClientSecret"]);

    expect(result.issues.map((i) => `${i.check_id} ${i.condition}`)).toEqual(["SEC-SECRET-04 named_value", "SEC-DATA-01 access_code", "SEC-DATA-02 password_hash"]);
    expect(status(result, "SEC-DATA-01")).toBe("found");
    expect(result.byExposes.credentials).toBe(4);
    expectRedacted(result, [FAKE.bcrypt, FAKE.hexSecret]);
    const serialized = JSON.stringify(result);
    for (const code of [FAKE.lockboxCode, FAKE.gateCode]) expect(serialized.includes(code), code).toBe(false);
  });

  it("reports nothing for a page that passes only the fields it shows", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = flightPage({ id: "p_1", name: "Beach House", countryCode: "US", doorCode: "$undefined", lockboxCode: null });
    const { result } = await check(site);
    expect(result.findingCount).toBe(0);
    expect(status(result, "SEC-DATA-01")).toBe("clear");
    expect(status(result, "SEC-DATA-02")).toBe("clear");
  });

  it("does not scrub a short code from the rest of the result, where redacting it would reveal it", async () => {
    const site = baselineSite();
    // A code that is also the year in the result's completedAt.
    site.responses[`${ORIGIN}/about`] = flightPage({ doorCode: FIXED_NOW.slice(0, 4) });
    const { result } = await check(site);
    expect(issue(result, "SEC-DATA-01", "access_code")!.count).toBe(1);
    expect(result.completedAt).toBe(FIXED_NOW);
    expect(JSON.stringify(result)).not.toContain("[redacted]");
  });
});

describe("searching the served text (KNOWLEDGE.md §12.7)", () => {
  it("lists where each term appears and the kind of value a matching property holds, never the text", async () => {
    const site = baselineSite();
    const about = flightPage(propertyRecord());
    site.responses[`${ORIGIN}/about`] = about;
    const { result } = await check(site, `${ORIGIN}/`, ["lockboxCode", "doorcode", "owner@acme", "internalNotes"]);
    const search = result.search!;
    expect(search.scope).toBe(
      "The search reads the same served text as the checks. It lists where each term appears and, when a term ends a property name, the kind of value the property holds, never the value or the text around it.",
    );
    expect(search.notes).toEqual([]);
    const [lockbox, door, email, notes] = search.terms;
    expect(lockbox).toEqual({
      term: "lockboxCode",
      count: 1,
      occurrences: [{ url: `${ORIGIN}/about`, source: null, ...positionOf(about, "lockboxCode"), property: "The term ends a property name here, and the property holds a string." }],
    });
    expect(door!.occurrences[0]!.property).toBe("The term ends a property name here, and the property holds undefined.");
    // Part of a value: the place only.
    expect(email).toMatchObject({ term: "owner@acme", count: 1 });
    expect(email!.occurrences[0]!.property).toBeNull();
    expect(notes).toEqual({ term: "internalNotes", count: 0, occurrences: [] });
    expect(search.none).toBe("Not found in the served text.");
    expect(JSON.stringify(search)).not.toContain(FAKE.lockboxCode);
  });

  it("searches scripts and the original source in their maps, in location order", async () => {
    const original = `export const config = { lockboxCode: lookup(id) };\n`;
    const site = siteWithScripts(["/static/b.js", "/static/a.js"], {
      [`${ORIGIN}/static/a.js`]: js(`var x={lockboxCode:null};\n//# sourceMappingURL=a.js.map`),
      [`${ORIGIN}/static/a.js.map`]: json({ version: 3, sources: ["src/config.ts"], sourcesContent: [original], mappings: "" }),
      [`${ORIGIN}/static/b.js`]: js("// lockboxCode"),
    });
    const { result } = await check(site, `${ORIGIN}/`, ["LOCKBOXCODE"]);
    expect(result.search!.terms[0]!.occurrences.map((o) => [o.url, o.source, o.line, o.column, o.property])).toEqual([
      [`${ORIGIN}/static/a.js`, null, 1, 8, "The term ends a property name here, and the property holds null."],
      [`${ORIGIN}/static/a.js.map`, "src/config.ts", 1, 25, "The term ends a property name here, and the property holds an expression."],
      [`${ORIGIN}/static/b.js`, null, 1, 4, null],
    ]);
  });

  it("counts every occurrence and lists the first 50", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = page("About Example", "", `<h1>About</h1><p>${"needle ".repeat(60)}</p>`);
    const { result } = await check(site, `${ORIGIN}/`, ["needle"]);
    expect(result.search!.terms[0]!.count).toBe(60);
    expect(result.search!.terms[0]!.occurrences).toHaveLength(50);
  });

  it("never changes a check's result, and leaves search null without terms", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = flightPage(propertyRecord());
    const plain = (await check(site)).result;
    const searched = (await check(site, `${ORIGIN}/`, ["lockboxCode"])).result;
    expect(plain.search).toBeNull();
    expect({ ...searched, search: null }).toEqual(plain);
  });

  it("redacts a term that is a value a check redacted (§12.2 rule 6)", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = flightPage(propertyRecord());
    const { result } = await check(site, `${ORIGIN}/`, [FAKE.hexSecret]);
    expect(result.search!.terms[0]).toMatchObject({ term: "[redacted]", count: 1 });
    expectRedacted(result, [FAKE.hexSecret]);
  });

  it("redacts an access code a term contains, compared without case, and nowhere else", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/about`] = flightPage(propertyRecord());
    const { result } = await check(site, `${ORIGIN}/`, [FAKE.lockboxCode.toLowerCase(), `gate ${FAKE.gateCode}`, "lockboxCode"]);
    expect(result.search!.terms.map((t) => [t.term, t.count])).toEqual([
      ["[redacted]", 1],
      ["gate [redacted]", 0],
      ["lockboxCode", 1],
    ]);
    const serialized = JSON.stringify(result).toLowerCase();
    for (const code of [FAKE.lockboxCode, FAKE.gateCode]) expect(serialized.includes(code.toLowerCase()), code).toBe(false);
  });

  it("says when the served text was read only in part", async () => {
    const site = siteWithScripts(["/static/app.js", "/private/admin.js"], { [`${ORIGIN}/static/app.js`]: js("let a = 1") });
    const { result } = await check(site, `${ORIGIN}/`, ["lockboxCode"]);
    expect(result.search!.notes).toEqual([`robots.txt disallows the scanner from ${ORIGIN}/private/admin.js, so it was not requested.`]);
  });
});

describe("staying on the site", () => {
  it("follows a script redirect only while it stays same-site", async () => {
    const site = siteWithScripts(["/static/app.js", "/static/old.js"], {
      [`${ORIGIN}/static/app.js`]: { status: 302, headers: { location: "https://cdn.other-site.net/app.js" }, body: "" },
      [`${ORIGIN}/static/old.js`]: { status: 301, headers: { location: "https://static.example.com/new.js" }, body: "" },
      "https://static.example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://static.example.com/new.js": js(`var b="${FAKE.classic}";`),
      "https://cdn.other-site.net/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://cdn.other-site.net/app.js": js(`var c="${FAKE.oauth}";`),
    });
    const { result, snapshot } = await check(site);
    expect(snapshot.exchanges.some((e) => e.request.url.startsWith("https://cdn.other-site.net/"))).toBe(false);
    expect(result.scripts.find((s) => s.url === `${ORIGIN}/static/app.js`)!.outcome).toBe("HTTP 302");
    expect(issue(result, "SEC-SECRET-01", "github_token")!.findings.map((f) => [f.url, f.label])).toEqual([["https://static.example.com/new.js", "GitHub personal access token (classic)"]]);
    expectRedacted(result, [FAKE.oauth, FAKE.classic]);
  });

  it("does not search a page the crawl reached by leaving the site", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/`] = page("Example Home", "", `<h1>Example</h1><a href="/go">Partner</a>`);
    site.responses[`${ORIGIN}/go`] = { status: 302, headers: { location: "https://partner.other-site.net/" }, body: "" };
    site.responses["https://partner.other-site.net/robots.txt"] = text("User-agent: *\nAllow: /\n");
    site.responses["https://partner.other-site.net/"] = page("Partner", "", `<script>var t="${FAKE.classic}"</script>`);
    const { result } = await check(site);
    expect(result.pages).toEqual([`${ORIGIN}/`]);
    expect(result.findingCount).toBe(0);
  });

  it("stops reading scripts once the read budget is spent, and says so", async () => {
    const big = "a".repeat(14 * 1024 * 1024);
    const names = ["/s1.js", "/s2.js", "/s3.js", "/s4.js"];
    const site = siteWithScripts(names, Object.fromEntries(names.map((n) => [`${ORIGIN}${n}`, js(big)])));
    const { result, snapshot } = await check(site);
    expect(snapshot.exchanges.some((e) => e.request.url === `${ORIGIN}/s4.js`)).toBe(false);
    expect(result.scripts.find((s) => s.url === `${ORIGIN}/s4.js`)!.outcome).toBe("not requested");
    expect(result.checks.find((c) => c.id === "SEC-SECRET-01")).toMatchObject({ status: "not_checked" });
    expect(result.checks.find((c) => c.id === "SEC-SECRET-01")!.notes).toContain(
      `${ORIGIN}/s4.js was not requested because the check had already read as much as it reads in one run.`,
    );
  }, 60_000);
});

describe("incomplete reads and shared inputs", () => {
  it("scrubs a matched token from every place the result names, such as a script URL's query string", async () => {
    const site = siteWithScripts([`/static/app.js?token=${FAKE.classic}`], {
      [`${ORIGIN}/static/app.js?token=${FAKE.classic}`]: js("let a = 1"),
    });
    const { result } = await check(site);
    // The token is still reported, from the page that carries it, by kind and position.
    const token = issue(result, "SEC-SECRET-01", "github_token")!;
    expect(token.findings[0]).toMatchObject({ url: `${ORIGIN}/`, label: "GitHub personal access token (classic)" });
    expect(result.scripts[0]!.url).toBe(`${ORIGIN}/static/app.js?token=[redacted]`);
    expectRedacted(result, [FAKE.classic]);
  });

  it("reports a file check not checked when one of its paths could not be read", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/.env.local`] = { outcome: "timeout" };
    const { result } = await check(site);
    const row = result.checks.find((c) => c.id === "SEC-FILE-01")!;
    expect(row.status).toBe("not_checked");
    expect(row.notes).toEqual([`${ORIGIN}/.env.local could not be fetched (a timeout).`]);
    expect(status(result, "SEC-VCS-01")).toBe("clear");
  });

  it("reports the secret and map checks not checked when a script was not read", async () => {
    const site = siteWithScripts(["/static/app.js", "/private/admin.js"], { [`${ORIGIN}/static/app.js`]: js("let a = 1") });
    const { result } = await check(site);
    const note = `robots.txt disallows the scanner from ${ORIGIN}/private/admin.js, so it was not requested.`;
    for (const id of ["SEC-MAP-01", "SEC-SECRET-01", "SEC-SECRET-02", "SEC-SECRET-03", "SEC-SECRET-04", "SEC-DATA-01", "SEC-DATA-02"]) {
      const row = result.checks.find((c) => c.id === id)!;
      expect([row.id, row.status]).toEqual([id, "not_checked"]);
      expect(row.notes).toContain(note);
    }
  });

  it("searches a source map shared by two scripts once", async () => {
    const map = { version: 3, sources: ["src/config.ts"], sourcesContent: [`export const t = "${FAKE.oauth}";\n`], mappings: "" };
    const site = siteWithScripts(["/a.js", "/b.js"], {
      [`${ORIGIN}/a.js`]: js("let a=1\n//# sourceMappingURL=/shared.map"),
      [`${ORIGIN}/b.js`]: js("let b=2\n//# sourceMappingURL=/shared.map"),
      [`${ORIGIN}/shared.map`]: json(map),
    });
    const { result } = await check(site);
    expect(issue(result, "SEC-SECRET-01", "github_token")!.count).toBe(1);
    expect(issue(result, "SEC-MAP-01", "sources_content")!.count).toBe(2);
    expect(result.byExposes).toEqual({ credentials: 1, "source code": 2, "file paths": 0 });
  });
});

describe("determinism and reach", () => {
  it("builds the same result from the same snapshot and terms", async () => {
    const site = siteWithScripts(["/static/app.js"], { [`${ORIGIN}/static/app.js`]: js(`var b="${FAKE.classic}";var c={doorCode:"${FAKE.lockboxCode}"};`) });
    const terms = ["doorCode", "var"];
    const { snapshot, config, result } = await check(site, `${ORIGIN}/`, terms);
    expect(buildSecurityResult(snapshot, config, terms)).toEqual(result);
    const shuffled = { ...snapshot, exchanges: [...snapshot.exchanges].reverse() };
    expect(buildSecurityResult(shuffled, config, terms)).toEqual(result);
  });

  it("marks every check not checked when robots.txt is unavailable", async () => {
    const site = baselineSite();
    site.responses[`${ORIGIN}/robots.txt`] = { status: 503, body: "" };
    const { result } = await check(site);
    expect(result.reach.status).toBe("robots_unavailable");
    expect(result.checks.every((c) => c.status === "not_checked")).toBe(true);
    expect(result.checks.find((c) => c.id === "SEC-SECRET-01")!.notes).toEqual(["No page loaded, so there was no served text to search."]);
  });
});
