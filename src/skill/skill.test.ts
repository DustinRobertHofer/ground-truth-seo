import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLI_BIN, CLI_COMMANDS, CLI_ENV, CLI_OPTIONS, CLI_OUTPUTS } from "../cli/options.js";
import { SKILL_DEFAULT_DIR, SKILL_FILE, SKILL_NAME, skillMarkdown } from "./skill.js";

const committed = new URL(`../../skills/${SKILL_NAME}/${SKILL_FILE}`, import.meta.url);

/** The YAML frontmatter as name/value pairs; the skill's values are single plain lines. */
function frontmatter(markdown: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "";
  return Object.fromEntries(block.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
}

describe("agent skill", () => {
  it("matches the copy shipped in skills/ (regenerate with `pnpm skill`)", () => {
    expect(readFileSync(committed, "utf8")).toBe(skillMarkdown());
  });

  it("has the frontmatter the Agent Skills format requires", () => {
    const meta = frontmatter(skillMarkdown());
    expect(Object.keys(meta).sort()).toEqual(["description", "name"]);
    expect(meta.name).toBe(SKILL_NAME);
    expect(meta.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(meta.name!.length).toBeLessThanOrEqual(64);
    expect(meta.description!.length).toBeLessThanOrEqual(1024);
    expect(meta.description).not.toMatch(/[<>]|: /);
    expect(SKILL_DEFAULT_DIR.endsWith(`/${SKILL_NAME}`)).toBe(true);
  });

  it("documents every command, option, variable and output file the command line has", () => {
    const md = skillMarkdown();
    for (const c of CLI_COMMANDS) expect(md, c.name).toContain(`\`${CLI_BIN} ${c.name}`);
    for (const o of CLI_OPTIONS) expect(md, o.flag).toContain(`\`${o.flag}`);
    for (const e of CLI_ENV) expect(md, e.name).toContain(`\`${e.name}\``);
    for (const o of CLI_OUTPUTS) expect(md, o.file).toContain(`\`${o.file}\``);
    for (const e of CLI_ENV.filter((v) => v.secret)) {
      expect(e.obtain, e.name).toBeTruthy();
      expect(md, e.name).toContain(e.obtain!);
    }
  });
});
