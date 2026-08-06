/**
 * The shop cuts and prices in quarter inches.
 *
 * A typed 1.1" is not a thing that can be made — it snaps to 1.25". This is
 * enforced in code rather than left to the input's `step` attribute, because
 * `step` only governs the arrow keys and native validation: a customer can
 * still type 1.1 straight into the box and the app would happily price it.
 */
export const SIZE_INCREMENT_INCHES = 0.25;

/** Smallest thing the shop will cut. */
export const MIN_SIZE_INCHES = 0.25;

/**
 * Snap UP to the next quarter inch, never below the minimum.
 *
 * Up, not nearest. Gabe's rule was "no 1.1, only 1.25 or 1.75" — nearest
 * would send 1.1 down to 1.0, which is both the wrong answer and the wrong
 * direction: the shop cannot cut smaller than what was asked for, and
 * rounding down would quietly undercharge for the material actually used.
 *
 *   1.1  -> 1.25      1.3  -> 1.5       1.4 -> 1.5
 *   1.75 -> 1.75      0.1  -> 0.25      0   -> 0 (unset, field can be cleared)
 */
export function snapToQuarterInch(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;

  // Nudge before ceiling so an exact quarter does not float its way upward:
  // 1.75 / 0.25 can land on 7.000000000000001, which would ceil to 8.
  const steps = Math.ceil(n / SIZE_INCREMENT_INCHES - 1e-9);
  const snapped = steps * SIZE_INCREMENT_INCHES;

  // Round-trip through cents to kill float drift — 0.1+0.2 arithmetic would
  // otherwise leave values like 1.7500000000000002 in the order payload.
  return Math.max(MIN_SIZE_INCHES, Math.round(snapped * 100) / 100);
}

/** Whole units, at least one. Quantities are counts, not measurements. */
export function snapQuantity(value: number) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(1, n);
}
