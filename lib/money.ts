/**
 * Phase 15H.1 — round to 2 decimals for monetary math.
 * JS floating point: `0.1 + 0.2 === 0.30000000000000004`. Apply this helper to every
 * intermediate sum / product / total so totals match line items to the cent.
 *
 * Returns 0 for non-finite or negative inputs (callers shouldn't pass those, but be safe).
 */
export function roundMoney(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  // Multiply, round, divide — standard 2-decimal money rounding.
  return Math.round(value * 100) / 100;
}

/** Sum a list of monetary values with 2-decimal rounding applied per addition. */
export function sumMoney(values: ReadonlyArray<number>): number {
  let total = 0;
  for (const value of values) {
    total = roundMoney(total + roundMoney(value));
  }
  return total;
}
