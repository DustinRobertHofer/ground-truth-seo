/**
 * Scoring formulas, PRODUCT.md §7.5. Exact rationals only.
 *
 * The score measures distance from the best documented setup: a unit where a
 * documented practice is absent (status `opportunity`) counts as unmet, exactly
 * like a failing unit, so a site is rated against what it could do, not only
 * against how well the parts it already has are built.
 */

import { add, div, formatRational, isZero, mul, rational, roundHalfUp, ZERO, type Rational } from "../evaluate/core/rational.js";

export interface RuleStat {
  rule_id: string;
  weight: number;
  /** Applicable units that were evaluated (pass, fail or opportunity). */
  units: number;
  passed: number;
}

export interface ScoreResult {
  /** Σ w_r */
  totalWeight: bigint;
  /** Σ (w_r × p_r / n_r) */
  contribution: Rational;
  /** A, or null when no scored rule applies ("not measurable"). */
  achieved: Rational | null;
  /** Per-rule contributions as reduced fractions. */
  contributions: { rule_id: string; contribution: string }[];
}

/** A = Σ (w_r × p_r / n_r) / Σ w_r over scored rules with at least one evaluated unit. */
export function achieved(stats: RuleStat[]): ScoreResult {
  let totalWeight = 0n;
  let sum: Rational = ZERO;
  const contributions: { rule_id: string; contribution: string }[] = [];
  for (const stat of stats) {
    if (stat.weight <= 0 || stat.units <= 0) continue;
    const w = BigInt(stat.weight);
    totalWeight += w;
    const part = rational(w * BigInt(stat.passed), BigInt(stat.units));
    sum = add(sum, part);
    contributions.push({ rule_id: stat.rule_id, contribution: formatRational(part) });
  }
  if (totalWeight === 0n) return { totalWeight, contribution: sum, achieved: null, contributions };
  return { totalWeight, contribution: sum, achieved: div(sum, rational(totalWeight)), contributions };
}

export function eligibility(intended: number, blocked: number): Rational | null {
  if (intended <= 0) return null;
  return rational(BigInt(intended - blocked), BigInt(intended));
}

export interface Overall {
  score: number | null;
  arithmetic: string;
  label: string;
  eligibility: string | null;
  achieved: string | null;
}

/** S = round_half_up(100 × E × A) with the edge cases of §7.5. */
export function overall(E: Rational | null, A: Rational | null): Overall {
  if (E === null) {
    return { score: null, arithmetic: "No intended-indexable pages found", label: "No intended-indexable pages found", eligibility: null, achieved: A ? formatRational(A) : null };
  }
  const e = formatRational(E);
  if (isZero(E)) {
    return { score: 0, arithmetic: `Overall 0 = 100 × eligibility ${e} × achieved ${A ? formatRational(A) : "not measurable"}`, label: "Every intended page is blocked from indexing", eligibility: e, achieved: A ? formatRational(A) : null };
  }
  if (A === null) {
    return { score: null, arithmetic: `Overall not measurable = 100 × eligibility ${e} × achieved not measurable`, label: "Achieved share not measurable: no scored rule applies", eligibility: e, achieved: null };
  }
  const product = mul(rational(100n), mul(E, A));
  const score = Number(roundHalfUp(product));
  return { score, arithmetic: `Overall ${score} = 100 × eligibility ${e} × achieved ${formatRational(A)}`, label: `Overall ${score}`, eligibility: e, achieved: formatRational(A) };
}

/** S_k = round_half_up(100 × A_k); null when not measurable. */
export function categoryScore(A: Rational | null): { score: number | null; arithmetic: string } {
  if (A === null) return { score: null, arithmetic: "not measurable: no scored rule applies" };
  const score = Number(roundHalfUp(mul(rational(100n), A)));
  return { score, arithmetic: `${score} = 100 × achieved ${formatRational(A)}` };
}
