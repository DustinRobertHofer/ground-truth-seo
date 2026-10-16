/**
 * Markdown view of an advisory review. Citations come from the stored
 * guidance, never from the model.
 */

import { SOURCES_BY_ID } from "../scanner/rules/sources.js";
import { GUIDELINES_BY_ID, REVIEW_STATEMENTS } from "./guidance.js";
import type { ContentReview } from "./types.js";

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function refs(ids: readonly string[]): string {
  return ids.length === 0 ? "" : ` (${ids.join(", ")})`;
}

export function referencedGuidelines(review: ContentReview): string[] {
  const ids = new Set<string>();
  for (const p of review.site?.priorities ?? []) p.guidelines.forEach((id) => ids.add(id));
  for (const p of review.site?.patterns ?? []) p.guidelines.forEach((id) => ids.add(id));
  for (const entry of review.pages) for (const issue of entry.review?.issues ?? []) issue.guidelines.forEach((id) => ids.add(id));
  for (const id of ["REV-TITLE-01", "REV-DESC-01", "REV-QUERY-01", "REV-ANSWER-01", "REV-FAQ-01", "REV-LLMSTXT-01", "REV-MEASURE-01"]) ids.add(id);
  return [...ids].filter((id) => GUIDELINES_BY_ID.has(id)).sort();
}

export function renderReviewMarkdown(review: ContentReview): string {
  const host = new URL(review.origin).host;
  const out: string[] = [`# Content and AI-answer review: ${host}`, "", "Model output · advisory · not scored", ""];
  for (const s of REVIEW_STATEMENTS) out.push(`- ${s.source_id ? `Google: "${s.text}" [${s.source_id}]` : s.text}`);
  out.push(
    "",
    `Model ${review.model} · guidance ${review.guidanceVersion} · snapshot ${review.snapshotId.slice(0, 16)} · generated ${review.generatedAt}`,
    `Target queries: ${review.targetQueries.length === 0 ? "none supplied (queries below are the model's hypotheses)" : review.targetQueries.join("; ")}`,
    "",
  );

  const site = review.site;
  out.push("## Site", "");
  if (!site) out.push(review.siteNote ?? "The site overview was not produced.", "");
  else {
    out.push(site.summary, "", `Audience: ${site.audience}`, "", `Identity (${site.identity.verdict}): ${site.identity.assessment}`);
    if (site.identity.statement) out.push("", "Suggested statement:", "", `> ${site.identity.statement}`);
    out.push("", "### Top priorities", "");
    site.priorities.forEach((p, i) => out.push(`${i + 1}. **${p.title}**${refs(p.guidelines)}: ${p.why}`));
    if (site.patterns.length > 0) {
      out.push("", "### Patterns across pages", "");
      for (const p of site.patterns) out.push(`- [${p.priority}] **${p.title}**${refs(p.guidelines)}, follows ${p.engine}: ${p.observation} ${p.recommendation}${p.pages.length ? ` Pages: ${p.pages.join(", ")}` : ""}`);
    }
    if (site.contentGaps.length > 0) {
      out.push("", "### Questions no sampled page answers", "");
      for (const g of site.contentGaps) out.push(`- ${g.question} → ${g.where}. ${g.why}`);
    }
  }

  const llms = review.llmsTxt;
  out.push("", "### llms.txt", "", `${llms.url}: ${llms.outcome}${llms.servedHtml ? ", an HTML page rather than a text file" : ""}.`);
  if (llms.structure) {
    const s = llms.structure;
    out.push(`Structure: H1 ${s.h1 ?? "missing"}; summary ${s.summary ? "present" : "missing"}; ${s.sections.length} sections; ${s.links} links (${s.markdownLinks} to .md files).`);
  }
  if (site) {
    out.push("", `Assessment (${site.llmsTxt.verdict}): ${site.llmsTxt.assessment}`);
    if (site.llmsTxt.draft) out.push("", "Draft:", "", "```markdown", site.llmsTxt.draft, "```");
  }

  out.push("", "### robots.txt access for the home page", "", "| Crawler | Operator | Purpose | Home page |", "|---|---|---|---|");
  for (const c of review.crawlerAccess) out.push(`| ${c.crawler} | ${c.operator} | ${cell(c.purpose)} | ${c.outcome}${c.rule ? ` (${cell(c.rule)})` : ""} |`);

  out.push("", "## Pages", "");
  for (const entry of review.pages) {
    out.push(`### ${entry.url}`, "");
    const r = entry.review;
    if (!r) {
      out.push(entry.note ?? "Not reviewed.", "");
      continue;
    }
    out.push(`${r.pageType}. ${r.visitorIntent}`, "");
    if (r.likelyQueries.length > 0) out.push(`Likely queries: ${r.likelyQueries.map((q) => `"${q.query}" (${q.source}, ${q.coverage.replace("_", " ")})`).join("; ")}`, "");
    out.push(`**Title** (${r.title.verdict}). Current: ${entry.current.title === null ? "none" : `"${entry.current.title}"`}. ${r.title.assessment}`);
    for (const s of r.title.suggestions) out.push(`- ${s}`);
    out.push("", `**Meta description** (${r.metaDescription.verdict}). Current: ${entry.current.metaDescription ? `"${entry.current.metaDescription}"` : "none"}. ${r.metaDescription.assessment}`);
    for (const s of r.metaDescription.suggestions) out.push(`- ${s}`);
    out.push("", `**Main heading** (${r.mainHeading.verdict}). ${r.mainHeading.assessment}${r.mainHeading.suggestion ? ` Suggested: "${r.mainHeading.suggestion}"` : ""}`);
    out.push("", `**Words searchers use.** ${r.queryAlignment.assessment}`);
    for (const t of r.queryAlignment.termsToAdd) out.push(`- "${t.term}" in ${t.where}: ${t.why}`);
    out.push("", `**Answers** (${r.answers.verdict}). ${r.answers.assessment}`);
    for (const g of r.answers.gaps) out.push(`- Q: ${g.question}`, `  A: ${g.answer}${g.needsOwnerInput ? " (needs your input)" : ""}`, `  Where: ${g.placement}`);
    out.push("", `**FAQ** (${r.faq.recommended ? "recommended" : "not recommended"}). ${r.faq.reason}`);
    for (const item of r.faq.items) out.push(`- Q: ${item.question}`, `  A: ${item.answer}${item.needsOwnerInput ? " (needs your input)" : ""}`);
    if (r.issues.length > 0) {
      out.push("", "**Issues**", "");
      for (const issue of r.issues) {
        out.push(`- [${issue.priority}] **${issue.title}**${refs(issue.guidelines)}, follows ${issue.engine}: ${issue.observation} ${issue.recommendation}`);
        if (issue.example) out.push(`  Example: ${issue.example}`);
      }
    }
    if (r.strengths.length > 0) out.push("", `**Strengths.** ${r.strengths.join(" ")}`);
    out.push("");
  }

  out.push("## Guidelines and sources", "");
  for (const id of referencedGuidelines(review)) {
    const g = GUIDELINES_BY_ID.get(id)!;
    out.push(`### ${g.id} · ${g.title}`, "");
    for (const c of g.citations) {
      const source = SOURCES_BY_ID.get(c.source_id);
      out.push(`- [${c.source_id}] ${c.section}: "${c.quote}"${source ? ` ${source.url}` : ""}`);
    }
    out.push("");
  }
  out.push(`Tokens: ${review.usage.inputTokens} in, ${review.usage.outputTokens} out.`, "");
  return out.join("\n");
}
