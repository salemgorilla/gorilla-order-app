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

/** 3 -> `3"`, 3.375 -> `3.375"`. No trailing zeros on a round number. */
export function formatInches(value: number) {
  const n = sanitizeSizeInches(value);
  return `${Number(n.toFixed(4))}"`;
}

/**
 * The customer-facing size label, built from the real dimensions.
 *
 * `product.size` used to be a preset the customer picked ('3"'), and every
 * display plus the shop email reads it. Once the size buttons were replaced by
 * typed width and height, nothing updated that string any more — so a 5" x 5"
 * order priced correctly at $105 while the review card, the proof card and the
 * emailed spec all said 3". The shop would have made the wrong sticker.
 *
 * Deriving it from the dimensions keeps every one of those readers correct
 * without touching them individually.
 */
export function formatSizeLabel(widthInches: number, heightInches: number) {
  return `${formatInches(widthInches)} x ${formatInches(heightInches)}`;
}

/** Whole units, at least one. Quantities are counts, not measurements. */
export function snapQuantity(value: number) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(1, n);
}

/**
 * What a number field should hold once the customer leaves it.
 *
 * ── WHY THIS IS NOT INLINE IN NumberField ─────────────────────────────────
 * It used to be, and it was wrong, and nothing could have caught it. The blur
 * handler ran `snap(Number(draft) || 0)` on every exit including an empty one
 * — and `snapQuantity` is `Math.max(1, ...)`, so clearing "How many" and
 * tabbing away silently wrote 1. No error, no invalid treatment, all five
 * steps ticked green, and the order went through as a quantity of ONE.
 * Stickers self-check-out, so that is a live payable link for one sticker
 * instead of the thousand somebody meant to order. Signs did the same.
 *
 * The rule lives here so it can be asserted directly rather than through a
 * component with no test harness. Every defect this project has shipped came
 * from logic sitting somewhere nothing could reach it.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * A BLANK BOX IS NOT A VALUE. It resolves to 0 — which is what the
 * `quantity > 0` rules in lib/validation.ts are written against, and what
 * lets the field paint itself red and block submit. Anything actually typed
 * still goes through `snap`, so a floor of 1 keeps holding for "0" and "-5":
 * those are answers, and a wrong answer gets corrected. An empty field is not
 * an answer, and gets left alone to be complained about.
 */
export function resolveBlurValue(
  rawInput: string,
  snap: (value: number) => number
) {
  if (rawInput.trim() === "") return 0;

  return snap(Number(rawInput) || 0);
}
