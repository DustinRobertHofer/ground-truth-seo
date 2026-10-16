/**
 * performance.md: a readable view of a PerformanceResult. A pure function of
 * the result; it prints values, statements and quotes exactly as stored.
 */

import type { CitationOut, DeviceResult, PerformanceResult, Rating } from "./types.js";

const RATING: Record<Rating, string> = { good: "good", needs_improvement: "needs improvement", poor: "poor" };

const ASSESSMENT: Record<string, string> = {
  passes: "passes",
  does_not_pass: "does not pass",
  cannot_assess: "cannot be assessed",
};

function cite(c: CitationOut): string {
  return `> "${c.quote}"\n> — ${c.title} (${c.source_id} · ${c.section}), ${c.url}, last updated ${c.last_updated}`;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function device(d: DeviceResult): string[] {
  const out = [`## ${d.device === "phones" ? "Phones" : "Desktops"}`, ""];
  if (d.field) {
    const f = d.field;
    out.push(`### Field data: ${f.scope_label} (${f.first_date} to ${f.last_date})`, "", `Core Web Vitals assessment: ${ASSESSMENT[f.assessment]}.`, "");
    out.push("| Metric | 75th percentile | Rating | Visits by range |", "|---|---|---|---|");
    for (const m of f.metrics) {
      const bins = m.bins.map((b) => `${b.range}: ${b.share}`).join("; ");
      out.push(`| ${m.name} (${m.metric})${m.core_web_vital ? " ★" : ""} | ${m.display} | ${m.rating ? RATING[m.rating] : ""} | ${cell(bins)} |`);
    }
    out.push("", "★ Core Web Vital", "");
    if (f.lcp_subparts.some((s) => s.value_ms !== null)) {
      out.push(`LCP image subparts at the 75th percentile: ${f.lcp_subparts.map((s) => `${s.name} ${s.display}`).join(", ")}.`);
    }
    if (f.lcp_resource_type.length > 0) out.push(`LCP resource types: ${f.lcp_resource_type.map((t) => `${t.type} ${t.share}`).join(", ")}.`);
    out.push("");
  }
  if (d.lab) {
    const l = d.lab;
    out.push(`### Lab run: ${d.run} (Lighthouse ${l.lighthouse_version}, ${l.fetch_time})`, "", "| Metric | Value | Rating |", "|---|---|---|");
    for (const m of l.metrics) out.push(`| ${m.name} (${m.metric}) | ${m.display} | ${m.rating ? RATING[m.rating] : ""} |`);
    out.push("");
    if (l.lcp_element) out.push(`LCP element: \`${l.lcp_element.selector}\``, "");
    if (l.lcp_breakdown) {
      out.push("| LCP subpart | Time | Share | Optimal share |", "|---|---|---|---|");
      for (const s of l.lcp_breakdown.subparts) out.push(`| ${s.name} | ${s.display} | ${s.share_pct}% | ${s.optimal} |`);
      out.push("");
    }
  }
  if (!d.field && !d.lab) out.push("No field data or lab run for this device.", "");
  return out;
}

export function renderPerformanceMarkdown(result: PerformanceResult): string {
  const out: string[] = [`# Home page performance: ${result.home_url}`, "", `Performance diagnostics ${result.diagnostics_version}. Advisory: not part of the score or report.json.`, ""];
  for (const s of result.statements) {
    out.push(`- ${s.text}`);
    if (s.citation) out.push(`  (${s.citation.title}, ${s.citation.url})`);
  }
  out.push("");
  for (const d of result.devices) out.push(...device(d));
  out.push("## Diagnostics", "");
  if (result.diagnostics.length === 0) out.push("No diagnostic applies to the inputs this run had.", "");
  for (const d of result.diagnostics) {
    out.push(`### ${d.id} · ${d.title} (${d.metric}, ${d.device})`, "", d.statement, "", `**Recommendation:** ${d.recommendation}`, "");
    if (d.evidence.length > 0) {
      for (const e of d.evidence.slice(0, 20)) out.push(`- ${e.label}${e.detail ? ` — ${e.detail}` : ""}`);
      if (d.evidence.length > 20) out.push(`- and ${d.evidence.length - 20} more`);
      out.push("");
    }
    for (const c of d.citations) out.push(cite(c), "");
  }
  out.push("## Thresholds and the LCP breakdown", "");
  for (const c of [...result.metric_citations, ...result.breakdown_citations]) out.push(cite(c), "");
  return `${out.join("\n").trimEnd()}\n`;
}
