/**
 * Compare two reports, keyed by (rule ID, condition, unit).
 */

import type { Finding, Report } from "./types.js";

export interface ReportDiff {
  before: { snapshot_id: string; completed_at: string; overall: number | null };
  after: { snapshot_id: string; completed_at: string; overall: number | null };
  new_findings: Finding[];
  resolved_findings: Finding[];
  changed_findings: { before: Finding; after: Finding }[];
  favicon_changed: { before: string[]; after: string[] } | null;
}

function key(f: Finding): string {
  return `${f.rule_id}\u0000${f.condition ?? ""}\u0000${f.unit}`;
}

function faviconUrls(report: Report): string[] {
  return report.findings
    .filter((f) => f.rule_id === "SEO-META-05A" && typeof f.observed.icon_url === "string")
    .map((f) => f.observed.icon_url as string)
    .sort();
}

export function diffReports(before: Report, after: Report): ReportDiff {
  const relevant = (f: Finding) => f.status === "fail" || f.status === "opportunity" || f.status === "info";
  const a = new Map(before.findings.filter(relevant).map((f) => [key(f), f]));
  const b = new Map(after.findings.filter(relevant).map((f) => [key(f), f]));
  const newFindings: Finding[] = [];
  const resolved: Finding[] = [];
  const changed: { before: Finding; after: Finding }[] = [];
  for (const [k, f] of b) {
    const prior = a.get(k);
    if (!prior) newFindings.push(f);
    else if (prior.reason !== f.reason || prior.status !== f.status) changed.push({ before: prior, after: f });
  }
  for (const [k, f] of a) if (!b.has(k)) resolved.push(f);
  const fb = faviconUrls(before);
  const fa = faviconUrls(after);
  return {
    before: { snapshot_id: before.meta.snapshot_id, completed_at: before.meta.completed_at, overall: before.headline.overall },
    after: { snapshot_id: after.meta.snapshot_id, completed_at: after.meta.completed_at, overall: after.headline.overall },
    new_findings: newFindings,
    resolved_findings: resolved,
    changed_findings: changed,
    favicon_changed: fb.join("|") !== fa.join("|") ? { before: fb, after: fa } : null,
  };
}
