/**
 * Reports read back from storage: scans saved to an account and scans kept in
 * the browser. A stored report keeps the shape of the ruleset that built it, so
 * a report from ruleset 1.x lacks what ruleset 2.0.0 added and the renderers
 * read: opportunities, the recommendation kind and the AI answers readiness
 * list, and it names the score factor `conformance` instead of `achieved`.
 *
 * upgradeReport fills those fields without evaluating anything again. Each value
 * is what the older ruleset produced by construction, and the readiness list
 * stays null rather than being derived after the fact from findings of another
 * ruleset. report.json downloads keep the stored text unchanged.
 */

import type { CategoryScore, Recommendation, Report } from "./types.js";

type LegacyReport = Omit<Report, "headline" | "categories" | "recommendations" | "ai_readiness"> & {
  headline: Omit<Report["headline"], "achieved" | "opportunities"> & { achieved?: string | null; conformance?: string | null; opportunities?: number };
  categories: (Omit<CategoryScore, "achieved"> & { achieved?: string | null; conformance?: string | null })[];
  recommendations: (Omit<Recommendation, "kind"> & { kind?: Recommendation["kind"] })[];
  ai_readiness?: Report["ai_readiness"];
};

export function upgradeReport(stored: Report | LegacyReport): Report {
  const report = stored as LegacyReport;
  const { conformance: headlineConformance, ...headline } = report.headline;
  return {
    ...report,
    headline: {
      ...headline,
      // Ruleset 1.x named the same factor of the overall score `conformance`.
      achieved: headline.achieved !== undefined ? headline.achieved : (headlineConformance ?? null),
      // Ruleset 1.x had no opportunity status, so no unit had one.
      opportunities: headline.opportunities ?? 0,
    },
    categories: report.categories.map(({ conformance, ...category }) => ({
      ...category,
      achieved: category.achieved !== undefined ? category.achieved : (conformance ?? null),
    })),
    // Ruleset 1.x recommended failing rules only.
    recommendations: report.recommendations.map((r) => ({ ...r, kind: r.kind ?? "fix" })),
    ai_readiness: report.ai_readiness ?? null,
  };
}

export function parseStoredReport(json: string): Report {
  return upgradeReport(JSON.parse(json) as Report | LegacyReport);
}
