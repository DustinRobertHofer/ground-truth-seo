import { describe, expect, it } from "vitest";
import { baselineSite, page, reportOf } from "../../testing/index.js";
import { renderMarkdown } from "./markdown.js";
import { parseStoredReport, upgradeReport } from "./stored.js";
import type { Report } from "./types.js";

/**
 * Saved scans keep the report shape of the ruleset that built them. /sites/[siteId]
 * once returned a server error for every scan saved under ruleset 1.0.0, because
 * renderMarkdown read report.ai_readiness, which ruleset 2.0.0 added.
 */

const ORIGIN = "https://www.example.com";
const START = { start_url: `${ORIGIN}/`, max_pages: 20 };

/** A current report with something to fix, so recommendations are not empty. */
async function currentReport(): Promise<Report> {
  const site = baselineSite(ORIGIN);
  site.responses[`${ORIGIN}/about`] = page("Example Home", `<link rel="canonical" href="${ORIGIN}/about"><meta name="description" content="About."><meta name="viewport" content="width=device-width">`);
  const { report } = await reportOf(site, START);
  expect(report.recommendations.length).toBeGreaterThan(0);
  return report;
}

/** The same report as ruleset 1.x stored it: no opportunities, kinds or readiness list, and `conformance` for `achieved`. */
function asRuleset1(report: Report): string {
  const legacy = JSON.parse(JSON.stringify(report));
  legacy.meta.ruleset_version = "1.0.0";
  legacy.headline.conformance = legacy.headline.achieved;
  delete legacy.headline.achieved;
  delete legacy.headline.opportunities;
  for (const c of legacy.categories) {
    c.conformance = c.achieved;
    delete c.achieved;
  }
  for (const r of legacy.recommendations) delete r.kind;
  delete legacy.ai_readiness;
  return JSON.stringify(legacy);
}

describe("stored reports", () => {
  it("leaves a current report unchanged", async () => {
    const report = await currentReport();
    expect(upgradeReport(report)).toEqual(report);
    expect(parseStoredReport(JSON.stringify(report))).toEqual(report);
  });

  it("reads a ruleset 1.x report with what that ruleset produced by construction", async () => {
    const report = await currentReport();
    const upgraded = parseStoredReport(asRuleset1(report));
    expect(upgraded.headline.achieved).toBe(report.headline.achieved);
    expect(upgraded.headline).not.toHaveProperty("conformance");
    expect(upgraded.headline.opportunities).toBe(0);
    expect(upgraded.categories.map((c) => c.achieved)).toEqual(report.categories.map((c) => c.achieved));
    expect(upgraded.recommendations.every((r) => r.kind === "fix")).toBe(true);
    expect(upgraded.ai_readiness).toBeNull();
    expect(upgradeReport(upgraded)).toEqual(upgraded);
  });

  it("renders a ruleset 1.x report to Markdown", async () => {
    const markdown = renderMarkdown(parseStoredReport(asRuleset1(await currentReport())));
    expect(markdown).toContain("## AI answers readiness\n\nNot part of this report: ruleset 1.0.0 had no readiness list.");
    expect(markdown).toContain("## AI crawler access matrix");
  });
});
