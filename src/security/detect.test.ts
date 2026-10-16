import { describe, expect, it } from "vitest";
import {
  decodeDataUrl,
  findAccessCodes,
  findGithubTokens,
  findNamedSecrets,
  findPasswordHashes,
  findPrivateKeys,
  findTerm,
  findUrlPasswords,
  foldName,
  isGitConfig,
  isGitHead,
  isHtmlBody,
  isSameSite,
  LineIndex,
  marksAccessCode,
  parseEnvFile,
  parseGitCredentials,
  parseHtpasswd,
  parseNpmrc,
  parseSourceMap,
  propertyKindAfter,
  siteBaseOf,
  sourceMapRef,
  valueKindAt,
} from "./detect.js";
import { FAKE } from "../../fixtures/secrets.js";

const join = (...parts: string[]) => parts.join("");
const fake = FAKE;

describe("text helpers", () => {
  it("recognizes HTML bodies by type or by a leading <", () => {
    expect(isHtmlBody("text/html; charset=utf-8", "KEY=1")).toBe(true);
    expect(isHtmlBody("text/plain", "﻿ \n <!doctype html>")).toBe(true);
    expect(isHtmlBody(null, "KEY=value")).toBe(false);
    expect(isHtmlBody(null, "")).toBe(false);
  });

  it("counts lines across LF, CRLF and CR and columns from 1", () => {
    const text = "a\r\nbc\rd\ne";
    const index = new LineIndex(text);
    expect(index.position(0)).toEqual({ line: 1, column: 1 });
    expect(index.position(text.indexOf("c"))).toEqual({ line: 2, column: 2 });
    expect(index.position(text.indexOf("d"))).toEqual({ line: 3, column: 1 });
    expect(index.position(text.indexOf("e"))).toEqual({ line: 4, column: 1 });
  });

  it("treats the site base and its subdomains as same-site", () => {
    const base = siteBaseOf("https://www.example.co.uk");
    expect(base).toBe("example.co.uk");
    expect(isSameSite("https://static.example.co.uk/a.js", base)).toBe(true);
    expect(isSameSite("https://example.co.uk/a.js", base)).toBe(true);
    expect(isSameSite("https://notexample.co.uk/a.js", base)).toBe(false);
    expect(isSameSite("https://cdn.other.net/a.js", base)).toBe(false);
  });
});

describe("files", () => {
  it("confirms Git HEAD and config files only by content", () => {
    expect(isGitHead("ref: refs/heads/main\n")).toBe(true);
    expect(isGitHead("0123456789abcdef0123456789abcdef01234567\n")).toBe(true);
    expect(isGitHead("Not found")).toBe(false);
    expect(isGitConfig("[core]\n\tbare = false\n")).toBe(true);
    expect(isGitConfig("core = true")).toBe(false);
  });

  it("reads environment variable names, never values, and follows multi-line quoted values", () => {
    const env = parseEnvFile(`# settings\nexport DB_HOST=db\nAPI_TOKEN=abc\nPRIVATE_KEY="-----BEGIN\nline two\nline three\n-----END"\n${"L".repeat(70)}=x\n`);
    expect(env).toEqual({ count: 4, names: ["API_TOKEN", "DB_HOST", "PRIVATE_KEY"] });
    expect(parseEnvFile("Hello world\nThis is prose\nKEY=value\n")).toBeNull();
    expect(parseEnvFile("")).toBeNull();
  });

  it("reads credential files as counts and hosts", () => {
    expect(parseGitCredentials("https://me:pw1@github.com\nhttps://ci:pw2@GitLab.com\n")).toEqual({ count: 2, hosts: ["github.com", "gitlab.com"] });
    expect(parseGitCredentials("just text\nmore text\n")).toBeNull();
    expect(parseNpmrc("//registry.npmjs.org/:_authToken=abc123\n_auth=Zm9v\n")).toEqual({ count: 2, hosts: ["registry.npmjs.org", "the default registry"] });
    expect(parseNpmrc("//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n")).toBeNull();
    expect(parseHtpasswd("# users\nadmin:$apr1$abc$def\nops:{SHA}xyz=\n")).toEqual({ count: 2 });
    expect(parseHtpasswd("admin:password\n")).toBeNull();
  });
});

describe("source maps", () => {
  it("finds the map by header, then comment, then the .map convention", () => {
    const url = "https://www.example.com/static/app.js";
    expect(sourceMapRef(url, { sourcemap: "/maps/app.map", xSourcemap: null }, "//# sourceMappingURL=other.map")).toEqual({ via: "header", url: "https://www.example.com/maps/app.map" });
    expect(sourceMapRef(url, { sourcemap: null, xSourcemap: null }, "x\n//# sourceMappingURL=a.map\ny\n//@ sourceMappingURL=b.map\n")).toEqual({ via: "comment", url: "https://www.example.com/static/b.map" });
    expect(sourceMapRef(url, { sourcemap: null, xSourcemap: null }, "console.log(1)")).toEqual({ via: "convention", url: "https://www.example.com/static/app.js.map" });
    expect(sourceMapRef("https://www.example.com/app", { sourcemap: null, xSourcemap: null }, "x")).toBeNull();
  });

  it("decodes data: URLs in place", () => {
    const json = '{"version":3,"sources":["a.ts"],"sourcesContent":["let a = 1"]}';
    const encoded = `data:application/json;charset=utf-8;base64,${Buffer.from(json).toString("base64")}`;
    expect(decodeDataUrl(encoded)).toBe(json);
    expect(sourceMapRef("https://www.example.com/a.js", { sourcemap: null, xSourcemap: null }, `x\n//# sourceMappingURL=${encoded}`)).toEqual({ via: "data", text: json });
  });

  it("confirms version 3 maps, strips the )]}' prefix and flattens index maps", () => {
    expect(parseSourceMap(")]}'\n{\"version\":3,\"sources\":[\"a.ts\",\"b.ts\"],\"sourcesContent\":[null,\"b\"]}")).toEqual({ sources: ["a.ts", "b.ts"], contents: [null, "b"] });
    const index = { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, sources: ["x.ts"], sourcesContent: ["x"] } }] };
    expect(parseSourceMap(JSON.stringify(index))).toEqual({ sources: ["x.ts"], contents: ["x"] });
    expect(parseSourceMap('{"version":2,"sources":[]}')).toBeNull();
    expect(parseSourceMap("<!doctype html>")).toBeNull();
  });
});

describe("secrets", () => {
  it("finds GitHub tokens by prefix and ignores placeholders", () => {
    const text = `a="${fake.classic}"; b='${fake.fineGrained}'; c=${fake.stateless}; d="${join("gh", "p_", "x".repeat(36))}"; e=x${fake.classic}`;
    const found = findGithubTokens(text);
    expect(found.map((t) => [t.prefix, t.type])).toEqual([
      ["ghp_", "personal access token (classic)"],
      ["github_pat_", "fine-grained personal access token"],
      ["ghs_", "installation access token for a GitHub App"],
    ]);
    expect(found[0]!.index).toBe(text.indexOf(fake.classic));
  });

  it("finds complete PEM private keys, raw or escaped, and ignores elided ones", () => {
    expect(findPrivateKeys(`key: ${fake.pem("RSA PRIVATE KEY")}`).map((k) => k.label)).toEqual(["RSA PRIVATE KEY"]);
    expect(findPrivateKeys(`const k = "${fake.pem("PRIVATE KEY", true)}";`).map((k) => k.label)).toEqual(["PRIVATE KEY"]);
    expect(findPrivateKeys(join("-----BEGIN RSA PRIVATE KEY-----\n...\nKh9NV...\n-----END RSA PRIVATE KEY-----"))).toEqual([]);
    expect(findPrivateKeys(join("-----BEGIN PUBLIC KEY-----\n", "A".repeat(80), "\n-----END PUBLIC KEY-----"))).toEqual([]);
  });

  it("finds URLs with passwords and ignores documentation placeholders", () => {
    const text = [
      "postgres://app:Tr0ub4dor3x@db.prod.internal:5432/main",
      "postgres://user:password@localhost/db",
      "https://deploy:hunter2x@example.com/repo",
      "mongodb+srv://svc:${PASSWORD}@cluster0.mongodb.net",
      "redis://:onlypass@cache.internal",
    ].join("\n");
    const found = findUrlPasswords(text);
    expect(found.map(({ index, scheme, host }) => ({ index, scheme, host }))).toEqual([{ index: 0, scheme: "postgres", host: "db.prod.internal" }]);
    expect(text.slice(found[0]!.passwordStart, found[0]!.passwordEnd)).toBe("Tr0ub4dor3x");
  });

  it("finds values assigned to names that mark a secret, without class names or placeholders", () => {
    const value = "a8f5f167f44f4964e6c998dee827110c";
    const text = [
      `const clientSecret = "${value}";`,
      `{"DB_PASSWORD":"${value}"}`,
      `{passwordInput:"LoginForm_passwordInput__a1B2c3d4"}`,
      `{apiSecret:"your-api-secret-1234567890"}`,
      `{secretLabel:"Enter the secret"}`,
      `if(x.password==="${value}")`,
      `{githubSecret:"${fake.classic}"}`,
    ].join("\n");
    const tokens = new Set(findGithubTokens(text).map((t) => t.index));
    const found = findNamedSecrets(text, tokens);
    expect(found.map((f) => f.name)).toEqual(["clientSecret", "DB_PASSWORD"]);
    expect(found[0]!.index).toBe(text.indexOf(value));
    expect(text.slice(found[0]!.index, found[0]!.end)).toBe(value);
  });
});

/** JSON as a framework embeds it in a JavaScript string, with every quote escaped. */
const embedded = (value: unknown) => JSON.stringify(JSON.stringify(value)).slice(1, -1);
/** JSON as it sits inside a double-quoted HTML attribute. */
const attribute = (value: unknown) => JSON.stringify(value).replace(/"/g, "&quot;");
const values = (text: string, found: { index: number; end: number }[]) => found.map((m) => text.slice(m.index, m.end));

describe("quoted strings (§12.3)", () => {
  it("reads secrets in data a page embeds for its scripts, with escaped or entity quotes", () => {
    // Once escaped, as in a script; twice, as in a string inside that data; and as an HTML attribute.
    const twice = JSON.stringify(embedded({ clientSecret: fake.hexSecret })).slice(1, -1);
    expect(twice).toContain('\\\\\\"clientSecret');
    for (const text of [embedded({ clientSecret: fake.hexSecret }), twice, attribute({ clientSecret: fake.hexSecret })]) {
      expect(values(text, findNamedSecrets(text)), text.slice(0, 30)).toEqual([fake.hexSecret]);
    }
    // A closing quote must be written like the opening one.
    expect(findNamedSecrets(`\\"clientSecret":"${fake.hexSecret}\\"`)).toEqual([]);
  });

  it("splits names into words and folds them", () => {
    const starts = (name: string) => {
      const { folded, starts: s } = foldName(name);
      return [...folded].map((ch, i) => (s[i] ? ch.toUpperCase() : ch)).join("");
    };
    expect(starts("frontDoorCode")).toBe("FrontDoorCode");
    expect(starts("XMLDoorCode")).toBe("XmlDoorCode");
    expect(starts("door_code-2.pin$x y")).toBe("DoorCode2PinXY");
    expect(starts("wifi2Password")).toBe("Wifi2Password");
    expect(starts("blockCode")).toBe("BlockCode");
  });
});

describe("page data", () => {
  it("marks access codes by name, with the access word starting a word", () => {
    for (const name of ["lockboxCode", "lockBoxCode", "door_code", "FRONT_DOOR_CODE", "gateCode", "alarmPin", "smartLockPIN", "WiFiPassword", "guest_wifi_password", "checkInCode", "keypadPasscode", "lockboxCombination", "Door code"]) {
      expect(marksAccessCode(name), name).toBe(true);
    }
    for (const name of ["code", "countryCode", "keyCode", "blockCode", "unlockCode", "networkCode", "pinCode", "postalCode", "doorCodeUpdatedAt", "accessCodes", "promoCode", "password"]) {
      expect(marksAccessCode(name), name).toBe(false);
    }
  });

  it("finds access codes in JSON, embedded JSON, attributes and code, quoted or as integers", () => {
    const record = { id: "p_1", name: "Beach House", lockboxCode: fake.lockboxCode, gateCode: Number(fake.gateCode), countryCode: "US" };
    for (const text of [JSON.stringify(record), embedded(record), attribute(record)]) {
      expect(findAccessCodes(text).map((m) => [m.name, text.slice(m.index, m.end)]), text.slice(0, 20)).toEqual([
        ["lockboxCode", fake.lockboxCode],
        ["gateCode", fake.gateCode],
      ]);
    }
    const code = `var a={alarmPin:"8642"};b.doorCode="${fake.lockboxCode}";const c={"Door code":"5317"}`;
    expect(findAccessCodes(code).map((m) => m.name)).toEqual(["alarmPin", "doorCode", "Door code"]);
  });

  it("reads text whose only code word is password or passcode", () => {
    for (const text of ['{"wifiPassword":"A1b2C3"}', 'checkinPassword = "4821"', "{doorPasscode:4821}", '{"lockboxCombination":"3-1-4"}']) {
      expect(findAccessCodes(text), text).toHaveLength(1);
    }
  });

  it("ignores labels, references, placeholders and codes it cannot read as one", () => {
    const text = [
      `{"doorCode":"Door code","lockboxCode":"$undefined","gateCode":"$L1a","alarmCode":"0000","wifiPassword":"your-wifi-123"}`,
      `{"accessCode":"accessCode1","keypadPin":"12","doorCode":"12 34","lockCode":"{{code}}","gateCode":12.5,"entryCode":1234567890123456789}`,
      `{"doorCode":"4821x"} {"keyCode":"4821"} {"doorCode":null} if(doorCode==="9134"){}`,
    ].join("\n");
    expect(findAccessCodes(text).map((m) => [m.name, text.slice(m.index, m.end)])).toEqual([["doorCode", "4821x"]]);
  });

  it("does not report a value another check already reports at the same position", () => {
    const text = `{"wifiPassword":"${fake.hexSecret}"}`;
    const named = findNamedSecrets(text);
    expect(named).toHaveLength(1);
    expect(findAccessCodes(text, new Set(named.map((n) => n.index)))).toEqual([]);
  });

  it("finds password hashes by prefix under a password name, and ignores placeholders", () => {
    const text = [
      embedded({ user: { email: "a@b.c", passwordHash: fake.bcrypt } }),
      JSON.stringify({ password: fake.argon2 }),
      `encrypted_password: '${fake.bcrypt}'`,
      JSON.stringify({ hash: fake.bcrypt }),
      JSON.stringify({ password: "$2b$10$" + "x".repeat(53) }),
      JSON.stringify({ password: "$2b$10$..." }),
      JSON.stringify({ password: "$1$" + fake.bcrypt.slice(4) }),
    ].join("\n");
    expect(findPasswordHashes(text).map((m) => [m.name, m.prefix, text.slice(m.index, m.end)])).toEqual([
      ["passwordHash", "$2b$", fake.bcrypt],
      ["password", "$argon2id$", fake.argon2],
      ["encrypted_password", "$2b$", fake.bcrypt],
    ]);
  });
});

describe("search (§12.7)", () => {
  it("finds a term without case, left to right, and lists up to the limit", () => {
    const text = "lockboxCode LOCKBOXCODE lockboxcodelockboxcode";
    expect(findTerm(text, "LockboxCode", 10)).toEqual({ count: 4, first: [0, 12, 24, 35].map((index) => ({ index, end: index + 11 })) });
    expect(findTerm(text, "lockboxCode", 2).first).toHaveLength(2);
    expect(findTerm(text, "lockboxCode", 2).count).toBe(4);
    // Regular expression characters are literal.
    expect(findTerm("a.b axb (a.b)", "a.b", 10).count).toBe(2);
    expect(findTerm("price $5.00 (USD)", "$5.00 (", 10).count).toBe(1);
  });

  it("names the kind of value a property holds, and nothing when the term does not end a name", () => {
    const kinds = (text: string, term: string) => findTerm(text, term, 10).first.map((o) => propertyKindAfter(text, o.end));
    expect(kinds(embedded({ doorCode: "x1", wifiPassword: "", gateCode: 12, notes: null, owner: {}, codes: [], ok: true }), "doorCode")).toEqual(["string"]);
    const json = embedded({ doorCode: "$undefined", wifiPassword: "", gateCode: 12, notes: null, owner: {}, codes: [], ok: false });
    expect(["doorCode", "wifiPassword", "gateCode", "notes", "owner", "codes", "ok"].map((t) => kinds(json, t)[0])).toEqual([
      "undefined",
      "empty_string",
      "number",
      "null",
      "object",
      "array",
      "boolean",
    ]);
    expect(kinds("a = doorCode; b.doorCode = e.code; doorCode === 1; doorCode => 2; f(doorCode)", "doorCode")).toEqual([null, "other", null, null, null]);
    expect(kinds("x = { lockboxCode: undefined, lockboxCodeAt: -3 }", "lockboxCode")).toEqual(["undefined", null]);
    expect(valueKindAt("&quot;&quot;", 0)).toBe("empty_string");
    expect(valueKindAt("-.5", 0)).toBe("other");
  });
});
