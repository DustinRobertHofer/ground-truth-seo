/**
 * Exact rational arithmetic over BigInt (PRODUCT.md §7.5, §14).
 * Floating point never touches a score.
 */

export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function rational(num: bigint | number, den: bigint | number = 1n): Rational {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new Error("rational: zero denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  if (g > 1n) {
    n /= g;
    d /= g;
  }
  return { num: n, den: d };
}

export const ZERO: Rational = rational(0n);
export const ONE: Rational = rational(1n);

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new Error("rational: division by zero");
  return rational(a.num * b.den, a.den * b.num);
}

export function isZero(a: Rational): boolean {
  return a.num === 0n;
}

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** round_half_up(x = a/b, b > 0) = floor((2a + b) / (2b)), PRODUCT.md §7.5. */
export function roundHalfUp(x: Rational): bigint {
  const numerator = 2n * x.num + x.den;
  const denominator = 2n * x.den;
  // BigInt division truncates toward zero; floor for negatives.
  let q = numerator / denominator;
  if (numerator % denominator !== 0n && numerator < 0n) q -= 1n;
  return q;
}

/** Reduced fraction as text: "307/342", or "1" when the denominator is 1. */
export function formatRational(x: Rational): string {
  return x.den === 1n ? x.num.toString() : `${x.num.toString()}/${x.den.toString()}`;
}
