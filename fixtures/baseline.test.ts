import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/scanner/snapshot/canonical-json.js";
import { evaluate } from "../src/scanner/evaluate/index.js";
import { baselineSite, reportOf, snapshotOf } from "../src/testing/index.js";

describe("baseline site", () => {
  it("acquires, evaluates and scores a conforming site at 100", async () => {
    const { report, snapshot } = await reportOf(baselineSite(), { start_url: "https://www.example.com/", max_pages: 20 });
    const fails = report.findings.filter((f) => f.status === "fail").map((f) => `${f.rule_id}/${f.condition}@${f.unit}: ${f.reason}`);
    expect(fails).toEqual([]);
    expect(report.headline.intended).toBe(3);
    expect(report.headline.blocked).toBe(0);
    expect(report.headline.overall).toBe(100);
    expect(report.headline.arithmetic).toBe("Overall 100 = 100 × eligibility 1 × achieved 1");
    expect(report.headline.opportunities).toBe(0);
    expect(report.recommendations).toEqual([]);
    expect(snapshot.probe_404_url.startsWith("https://www.example.com/gt-probe-404-")).toBe(true);
    expect(report.meta.intent_inferred).toBe(false);
    for (const finding of report.findings) {
      for (const [k, v] of Object.entries(finding.observed)) expect(typeof v === "string" || Number.isInteger(v), `${finding.rule_id} ${k}`).toBe(true);
    }
  });

  it("is idempotent and independent of manifest storage order", async () => {
    const { snapshot, config } = await snapshotOf(baselineSite(), { start_url: "https://www.example.com/" });
    const first = canonicalize(evaluate(snapshot, config));
    const second = canonicalize(evaluate(snapshot, config));
    expect(second).toBe(first);
    const shuffled = { ...snapshot, exchanges: [...snapshot.exchanges].reverse() };
    expect(canonicalize(evaluate(shuffled, config))).toBe(first);
    const again = await snapshotOf(baselineSite(), { start_url: "https://www.example.com/" });
    expect(again.snapshot.snapshot_id).toBe(snapshot.snapshot_id);
  });
});
