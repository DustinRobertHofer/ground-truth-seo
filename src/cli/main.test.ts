import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redactSecrets, run, SECRET_ENV, USAGE, type CliIo } from "./main.js";
import { CLI_ENV, CLI_OPTIONS } from "./options.js";
import { skillMarkdown } from "../skill/skill.js";

const golden = new URL("../../fixtures/golden/broken-links/", import.meta.url);

function capture(): CliIo & { out: string; err: string } {
  const io = { out: "", err: "", stdout: (t: string) => void (io.out += t), stderr: (t: string) => void (io.err += t) };
  return io;
}

describe("command line", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gts-cli-"));
    for (const name of ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "VERCEL", "AI_REVIEW_DISABLED", "CRUX_API_KEY"]) vi.stubEnv(name, undefined as unknown as string);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("prints usage for --help and for no command", async () => {
    for (const argv of [[], ["--help"], ["scan", "--help"]]) {
      const io = capture();
      await run(argv, io);
      expect(io.out).toBe(USAGE);
    }
  });

  it("prints the package, scanner and ruleset versions", async () => {
    const io = capture();
    await run(["--version"], io, { version: "9.9.9" });
    expect(io.out).toMatch(/^ground-truth-seo 9\.9\.9 \(scanner \S+, ruleset \S+, knowledge cutoff \d{4}-\d{2}-\d{2}\)\n$/);
  });

  it("evaluates a stored snapshot to the same report.json as the golden report", async () => {
    const config = JSON.parse(readFileSync(new URL("config.json", golden), "utf8")) as { max_pages: number };
    const io = capture();
    await run(["evaluate", fileURLToPath(new URL("snapshot.json", golden)), "--max-pages", String(config.max_pages), "--out", dir], io);
    expect(readFileSync(join(dir, "report.json"), "utf8")).toBe(readFileSync(new URL("report.json", golden), "utf8"));
    expect(readFileSync(join(dir, "report.md"), "utf8").length).toBeGreaterThan(0);
    expect(io.out).toMatch(/^Overall \d+ = /);
  });

  it("diffs two reports as canonical JSON", async () => {
    const report = fileURLToPath(new URL("report.json", golden));
    const io = capture();
    await run(["diff", report, report], io);
    expect(() => JSON.parse(io.out)).not.toThrow();
    expect(io.out.endsWith("\n")).toBe(true);
  });

  it("refuses --review without AI_GATEWAY_API_KEY before doing any work", async () => {
    const snapshot = join(dir, "snapshot.json");
    writeFileSync(snapshot, readFileSync(new URL("snapshot.json", golden)));
    await expect(run(["review", snapshot], capture())).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    await expect(run(["scan", "https://www.example.com/", "--review"], capture())).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  it("says when the review is turned off", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key-not-real");
    vi.stubEnv("AI_REVIEW_DISABLED", "1");
    await expect(run(["review", "x.json"], capture())).rejects.toThrow(/AI_REVIEW_DISABLED=1/);
  });

  it("refuses --crux without CRUX_API_KEY", async () => {
    await expect(run(["scan", "https://www.example.com/", "--crux"], capture())).rejects.toThrow(/CRUX_API_KEY/);
  });

  it("writes the agent skill", async () => {
    const io = capture();
    await run(["skill", "--out", dir], io);
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe(skillMarkdown());
    expect(io.out).toBe(`Agent skill written to ${join(dir, "SKILL.md")}\n`);
  });

  it("rejects unknown commands with the list of commands", async () => {
    await expect(run(["frobnicate"], capture())).rejects.toThrow(/commands: scan <url>/);
  });

  it("redacts configured keys from anything it prints or writes", () => {
    const env = { CRUX_API_KEY: "crux-secret-123", AI_GATEWAY_API_KEY: "gw-secret-456" };
    expect(redactSecrets("GET https://x/?key=crux-secret-123 with gw-secret-456", env)).toBe("GET https://x/?key=[CRUX_API_KEY] with [AI_GATEWAY_API_KEY]");
    expect(redactSecrets("nothing to hide", {})).toBe("nothing to hide");
  });

  it("documents exactly the flags it reads, and redacts every secret it documents", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const read = new Set(
      [...source.matchAll(/\b(?:str|num|list)\("([a-z-]+)"\)|flags\["([a-z-]+)"\]|flags\.([a-z]+)\b/g)].map((m) => m[1] ?? m[2] ?? m[3]),
    );
    read.delete("help");
    expect([...read].sort()).toEqual(CLI_OPTIONS.map((o) => o.flag.slice(2)).sort());
    for (const o of CLI_OPTIONS) expect(USAGE, o.flag).toContain(o.flag);
    for (const e of CLI_ENV.filter((v) => v.secret)) expect(SECRET_ENV as readonly string[]).toContain(e.name);
  });
});
