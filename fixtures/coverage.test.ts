/**
 * Rule coverage (PRODUCT.md §6): every scored rule has a passing fixture and a
 * fixture per fail condition. CI fails if a rule or condition lacks fixtures.
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES } from "../src/scanner/rules/index.js";

const dir = new URL("./rules/", import.meta.url);
const corpus = readdirSync(dir)
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => readFileSync(new URL(name, dir), "utf8"))
  .join("\n");

describe("rule coverage", () => {
  const scored = RULES.filter((rule) => rule.weight > 0 && !rule.informational && !rule.houseConvention);
  for (const rule of scored) {
    it(`${rule.id} has a passing fixture and one per fail condition`, () => {
      expect(corpus.includes(`"${rule.id}"`), `${rule.id} has no fixture`).toBe(true);
      for (const condition of rule.conditions) {
        if (condition.info) continue;
        expect(corpus.includes(`"${condition.code}"`), `${rule.id}/${condition.code} has no fixture`).toBe(true);
      }
    });
  }
});
