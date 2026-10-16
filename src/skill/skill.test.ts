import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLI_COMMANDS, CLI_ENV, CLI_OPTIONS, CLI_OUTPUTS } from "../cli/options.js";
import { CATEGORY_ORDER } from "../scanner/rules/types.js";
import { SETUP_DOCS_URL, SKILL_DEFAULT_DIR, SKILL_FILE, SKILL_NAME, skillMarkdown } from "./skill.js";

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

  it("documents every command, option, output file and report area it can use", () => {
    const md = skillMarkdown();
    for (const c of CLI_COMMANDS.filter((c) => c.name !== "skill")) expect(md, c.name).toContain(`| \`${c.name}`);
    for (const o of CLI_OPTIONS) expect(md, o.flag).toContain(`\`${o.flag}`);
    for (const o of CLI_OUTPUTS.filter((o) => o.file !== SKILL_FILE)) expect(md, o.file).toContain(`\`${o.file}\``);
    for (const key of CATEGORY_ORDER) expect(md, key).toContain(`\`${key}\``);
  });

  it("points to the documentation for setup instead of carrying it", () => {
    const md = skillMarkdown();
    expect(md).toContain(SETUP_DOCS_URL);
    for (const e of CLI_ENV.filter((v) => v.obtain)) expect(md, e.name).not.toContain(e.obtain!);
    for (const e of CLI_ENV.filter((v) => v.docsUrl)) expect(md, e.name).not.toContain(e.docsUrl!);
    expect(md).not.toMatch(/npm install|\bexport [A-Z_]+=|setx /);
  });

  it("asks for results on a canvas", () => {
    expect(skillMarkdown()).toMatch(/## Presenting it[\s\S]*Describe outcomes on a canvas/);
  });
});
