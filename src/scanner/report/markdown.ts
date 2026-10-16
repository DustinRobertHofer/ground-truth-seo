/**
 * A Markdown view rendered purely from report.json.
 */

import type { Finding, Report } from "./types.js";

function esc(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function citationLine(c: Finding["citations"][number]): string {
  const quote = c.quote ? ` "${c.quote}"` : "";
  return `[${c.source_id}] ${c.section} (last updated ${c.source_last_updated}):${quote}`;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  const h = report.headline;
  lines.push(`# Ground-Truth SEO Scanner report`, "");
  lines.push(`Start URL: ${report.meta.start_url}  `);
  lines.push(`Preferred origin: ${report.meta.preferred_origin}  `);
  lines.push(`Ruleset ${report.meta.ruleset_version} · knowledge cutoff ${report.meta.knowledge_cutoff} · scanner ${report.meta.scanner_version}  `);
  lines.push(`Snapshot ${report.meta.snapshot_id} · config ${report.meta.config_hash} · completed ${report.meta.completed_at} · robots mode ${report.meta.robots_mode}${report.meta.truncated ? ` · truncated (${report.meta.truncation_limits.join(", ")})` : ""}`, "");
  lines.push(`## Headline`, "");
  lines.push(`**${h.overall_label}**`, "", h.arithmetic, "", h.summary, "");
  for (const s of h.statements) lines.push(`- ${s.source_id ? `Google: ` : ""}${s.text}${s.source_id ? ` [${s.source_id}]` : ""}`);
  lines.push("", `Intended pages: ${h.intended} · blocked: ${h.blocked} · critical failures: ${h.critical_failures} · major: ${h.major_failures} · minor: ${h.minor_failures} · to add: ${h.opportunities}`, "");
  if (h.gates.length > 0) {
    lines.push(`| Gate | Blocked pages |`, `|---|---|`);
    for (const g of h.gates) lines.push(`| ${g.rule_id} | ${g.blocked} |`);
    lines.push("");
  }
  lines.push(`## Feature eligibility`, "", `| Feature | Status | Units | Failing |`, `|---|---|---|---|`);
  for (const f of report.features) lines.push(`| ${f.label} | ${f.status} | ${f.units} | ${esc(f.failing.map((x) => `${x.rule_id}/${x.condition} on ${x.unit}`).join("; ")) || "—"} |`);
  lines.push("", `## Categories`, "", `| Category | Score | Arithmetic |`, `|---|---|---|`);
  for (const c of report.categories) lines.push(`| ${c.label} | ${c.score === null ? "not measurable" : c.score} | ${esc(c.arithmetic)} |`);
  lines.push("", `## Recommendations`, "");
  if (report.recommendations.length === 0) lines.push("Nothing to fix or add: every documented practice the scanner checks is in place.", "");
  report.recommendations.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.kind === "add" ? "Add" : "Fix"} · ${r.rule_id} · ${r.condition} (${r.class}, weight ${r.weight}${r.gate ? `, gate ${r.gate}` : ""})`, "");
    lines.push(`**Action.** ${r.action}`, "", `**Why.** ${r.reason}`, "");
    lines.push(`**Affected (${r.affected_count}).** ${r.affected_units.slice(0, 20).join(", ")}${r.affected_count > 20 ? ` and ${r.affected_count - 20} more` : ""}`, "");
    lines.push(`**Outcome.** ${r.outcome}`, "", `**Verify.**`);
    for (const v of r.verify) lines.push(`- ${v}`);
    lines.push("", `**Sources.**`);
    for (const c of r.citations) lines.push(`- ${citationLine(c)}`);
    lines.push("");
  });
  lines.push(`## Findings`, "");
  const failing = report.findings.filter((f) => f.status === "fail" || f.status === "opportunity" || f.status === "info");
  lines.push(`| Status | Rule | Condition | Unit | Reason |`, `|---|---|---|---|---|`);
  for (const f of failing) lines.push(`| ${f.status} | ${f.rule_id} | ${f.condition ?? ""} | ${esc(f.unit)} | ${esc(f.reason ?? "")} |`);
  const other = report.findings.filter((f) => f.status !== "fail" && f.status !== "opportunity" && f.status !== "info");
  const counts = new Map<string, number>();
  for (const f of other) counts.set(`${f.rule_id} ${f.status}`, (counts.get(`${f.rule_id} ${f.status}`) ?? 0) + 1);
  lines.push("", `Other statuses: ${[...counts.entries()].map(([k, v]) => `${k} ×${v}`).join(", ") || "none"}`, "");
  const readiness = report.ai_readiness;
  if (readiness) {
    lines.push(`## AI answers readiness`, "", readiness.intro, "", `| Status | Item | Engine or operator | Observed | Source |`, `|---|---|---|---|---|`);
    for (const item of readiness.items) lines.push(`| ${item.status.replace(/_/g, " ")} | ${esc(item.label)} | ${esc(item.party)} | ${esc(item.detail)} | ${item.source_id}${item.quote ? ` "${esc(item.quote)}"` : ""} |`);
  } else {
    lines.push(`## AI answers readiness`, "", `Not part of this report: ruleset ${report.meta.ruleset_version} had no readiness list.`);
  }
  lines.push("");
  lines.push(`## AI crawler access matrix`, "", `Sampled URLs: ${report.ai_access_matrix.sampled_urls.join(", ")}`, "", `| Crawler | Operator | Home page | Purpose | robots.txt behavior |`, `|---|---|---|---|---|`);
  for (const row of report.ai_access_matrix.rows) {
    const home = row.results[0];
    lines.push(`| ${row.crawler} | ${row.operator} | ${home ? home.outcome + (home.rule ? ` (${esc(home.rule)})` : "") : "—"} | ${esc(row.purpose)} | ${esc(row.robots_behavior)} [${row.source_id}] |`);
  }
  lines.push("");
  for (const note of report.ai_access_matrix.notes) lines.push(`- ${note}`);
  lines.push("", `## Manual review`, "", `| ID | Check | Why the scanner cannot | Source |`, `|---|---|---|---|`);
  for (const m of report.manual_review) lines.push(`| ${m.id} | ${esc(m.what)} | ${esc(m.why)} | ${esc(m.source)} |`);
  lines.push("", `## Not scored`, "", report.not_scored.intro, "", `| Claim | Verdict | What the source says | Source |`, `|---|---|---|---|`);
  for (const c of report.not_scored.claims) lines.push(`| ${esc(c.claim)} | ${esc(c.verdict)} | ${esc(c.evidence)} | ${esc(c.source)} |`);
  lines.push("", `## Methodology`, "", report.methodology.weights_note, "", `| Class | Label | Weight | Severity | Assigned when |`, `|---|---|---|---|---|`);
  for (const c of report.methodology.classes) lines.push(`| ${c.class} | ${c.label} | ${c.weight} | ${c.severity} | ${esc(c.assigned_when)} |`);
  lines.push("");
  for (const f of report.methodology.formulas) lines.push(`- ${f}`);
  lines.push("", `### Sources cited in this report`, "");
  for (const s of report.methodology.sources) lines.push(`- ${s.id}: ${s.title} — ${s.url} (last updated ${s.last_updated}, verified ${s.verified})`);
  lines.push("");
  return lines.join("\n");
}
