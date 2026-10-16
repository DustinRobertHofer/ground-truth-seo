/**
 * Golden reports (PRODUCT.md §6): evaluate each committed snapshot with its
 * committed configuration and compare with the committed report byte for byte.
 * CI runs this file again under other time zones and locales.
 *
 * A golden report changes only when the ruleset or the report format changes on
 * purpose. Regenerate it with `ground-truth-seo evaluate` and review the diff.
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateSnapshot } from "../src/scanner/index.js";
import type { ScanConfigInput } from "../src/scanner/config.js";
import type { Snapshot } from "../src/scanner/snapshot/types.js";

const dir = new URL("./golden/", import.meta.url);
const cases = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

describe("golden reports", () => {
  it("has at least one golden case", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const name of cases) {
    it(`${name}: report.json is reproduced byte for byte`, () => {
      const read = (file: string) => readFileSync(new URL(`${name}/${file}`, dir), "utf8");
      const snapshot = JSON.parse(read("snapshot.json")) as Snapshot;
      const config = JSON.parse(read("config.json")) as ScanConfigInput;
      const { reportJson } = evaluateSnapshot(snapshot, config);
      expect(`${reportJson}\n`).toBe(read("report.json"));
    });
  }
});
