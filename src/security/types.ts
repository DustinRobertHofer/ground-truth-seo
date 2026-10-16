/**
 * The result of a security check, sent to the browser. It carries where each
 * secret was found and what kind it is, never the secret itself
 * (KNOWLEDGE.md §12.2): no field below holds a matched value or a response body.
 */

import type { CheckCitation, CheckFailure, CheckReach } from "../checkers/types.js";
import type { Exposes } from "./knowledge.js";
import type { MapVia } from "./detect.js";

export type SecurityCheckStatus = "found" | "clear" | "not_checked";

/** One thing found: a file that should not be served, or a secret at a position in served text. */
export interface SecurityFinding {
  check_id: string;
  condition: string;
  exposes: Exposes;
  /** The URL that served it: a probed file, a page, a script or a source map. */
  url: string;
  /** The source file inside a source map, when the finding sits in its sourcesContent. */
  source: string | null;
  line: number | null;
  column: number | null;
  /** A short label for the list of what was found, built from redacted fields only. */
  label: string;
  /** Names §12.2 allows: environment variable names, credential hosts or source file paths. */
  names: string[];
  /** Total behind `names` when the list is cut short. */
  namesTotal: number;
  /** The check's reason template, filled from redacted fields. */
  reason: string;
}

/** Findings of one (check, condition), with what to do about them. */
export interface SecurityIssue {
  check_id: string;
  check_title: string;
  condition: string;
  exposes: Exposes;
  fix: string;
  citations: CheckCitation[];
  /** Up to MAX_FINDINGS_PER_ISSUE, sorted by location. */
  findings: SecurityFinding[];
  count: number;
}

export interface SecurityCheckRow {
  id: string;
  title: string;
  exposesText: string;
  status: SecurityCheckStatus;
  found: number;
  /** Why something could not be checked, as §12.5 states it. */
  notes: string[];
}

export type FileVerdict = "found" | "not_served" | "not_checked";

export interface FileRow {
  url: string;
  path: string;
  check_id: string;
  /** `HTTP 404`, `a timeout` and so on (KNOWLEDGE.md §1.5). */
  outcome: string;
  verdict: FileVerdict;
  /** Set when the response was 200 but an HTML page, the usual soft 404. */
  html: boolean;
  note: string | null;
}

export type MapVerdict = "sources_content" | "paths_only" | "not_found" | "not_a_map" | "other_site" | "not_checked";

export interface ScriptRow {
  url: string;
  outcome: string;
  bytes: number;
  truncated: boolean;
  map: {
    /** Null for a map embedded as a data: URL. */
    url: string | null;
    via: MapVia;
    outcome: string | null;
    verdict: MapVerdict;
    sources: number;
    note: string | null;
  } | null;
}

/** Where a search term appears (KNOWLEDGE.md §12.7): a position, never the text around it. */
export interface SearchOccurrence {
  url: string;
  /** The source file inside a source map. */
  source: string | null;
  line: number;
  column: number;
  /** The search_property statement when the term ends a property name, naming the kind of value only. */
  property: string | null;
}

export interface SearchTermResult {
  /** As entered, unless it matched a value a check redacted (§12.2 rule 6). */
  term: string;
  /** Every occurrence. */
  count: number;
  /** Up to SEARCH_LIMITS.listed, in location order. */
  occurrences: SearchOccurrence[];
}

export interface SecuritySearch {
  terms: SearchTermResult[];
  /** Served text read only in part or not at all, as §12.5 states it. */
  notes: string[];
  scope: string;
  /** The search_none statement, shown for a term with no occurrence. */
  none: string;
}

export interface SecurityResult {
  version: 1;
  checker: "security-checker";
  startUrl: string;
  origin: string;
  completedAt: string;
  snapshotId: string;
  exposureVersion: string;
  reach: CheckReach;
  /** Pages whose HTML was searched. */
  pages: string[];
  files: FileRow[];
  scripts: ScriptRow[];
  checks: SecurityCheckRow[];
  /** Ordered by what they expose, then check and condition. */
  issues: SecurityIssue[];
  findingCount: number;
  byExposes: Record<Exposes, number>;
  /** Null when no search terms were entered. */
  search: SecuritySearch | null;
  statements: { redaction: string; scope: string };
}

/** The focused checkers' failures, and search terms the server rejected. */
export type SecurityFailure = CheckFailure | "invalid_search";

export type SecurityOutcome = { ok: true; result: SecurityResult } | { ok: false; error: string; reason: SecurityFailure };

export type SecurityStreamEvent =
  | { type: "progress"; message: string }
  | { type: "result"; result: SecurityResult }
  | { type: "error"; message: string; reason: SecurityFailure };
