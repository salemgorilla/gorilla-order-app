/**
 * Sizes are entered freely.
 *
 * There WAS a quarter-inch rule here: typed sizes snapped up to the next 0.25"
 * so 1.1" became 1.25". Removed 2026-08-06 at Gabe's request — the shop will
 * cut what the customer asks for.
 *
 * The sanitising below is deliberately NOT a constraint on what can be
 * ordered. It only keeps the number sane: positive, and rounded to hundredths
 * so float noise like 1.7500000000000002 never reaches the price, the order
 * payload, or the cut spec the shop works from.
 */

/** Smallest thing worth quoting. Anything at or below this reads as unset. */
export const MIN_SIZE_INCHES = 0.01;

/**
 * A usable measurement, without forcing it onto any grid.
 *
 * Returns 0 for blank or non-positive input so a cleared field stays cleared
 * rather than springing back to a minimum while the customer is typing.
 */
export function sanitizeSizeInches(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;

  // Four decimals, not two. Rounding to hundredths was tried and it mangled
  // ordinary shop fractions: 3.375" (3 3/8) became 3.38" and repriced. Four
  // decimals holds every sixteenth and thirty-second exactly while still
  // killing float drift like 1.7500000000000002 before it reaches the price,
  // the payload, or the cut spec.
  return Math.round(n * 10000) / 10000;
}

/** Whole units, at least one. Quantities are counts, not measurements. */
export function snapQuantity(value: number) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(1, n);
}
