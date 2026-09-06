/**
 * APPAREL PRICING — the shop's Printavo screen-print matrix, as data.
 *
 * Gabe, 2026-09-06: "I need to use the latest matrix we created for
 * Printavo as the source of our app pricing" — the 22 Aug corrected matrix,
 * markup included. This file IS that matrix. It replaced a formula table
 * ($8 / $6 / $4.75 / $4 / $3.25 by run, +$0.65 a colour, +$2.50 a location,
 * +$0.75 underbase, blank at S&S × 1.4) that had been the app's price since
 * 21 Aug and was confirmed "the default for now" on the 4th — for two days.
 * PRICING.md carries both, and why one replaced the other.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────
 * Quantity tiers down, colour count across, a garment markup per tier.
 * Every cell is PRINT PER PIECE FOR ONE LOCATION. Everything the matrix
 * does not hold is a rule beside it, in lib/apparel-pricing.ts:
 *
 *   tier lookup     step-down — 200 pieces price at the 144 row
 *   never pay more  a bigger tier's minimum never costs more than your
 *                   count at your tier (the yard-sign rule, kept)
 *   locations       each placement is its own pass through the matrix at
 *                   the design's colour count ("cost is based on colour per
 *                   print placement" — the matrix's own published basis)
 *   underbase       a white underbase on a dark garment is ONE MORE COLOUR,
 *                   nothing else — it is a screen and a pass like any other
 *   screens         $25 per colour per location, on top (published adder)
 *   the blank       the S&S customer price × (1 + the tier's markup); the
 *                   catalogue serves the price at every markup the matrix
 *                   uses, so cost never reaches the browser
 *
 * ── THE NUMBERS ARE THE DECISION ──────────────────────────────────────────
 * Change a cell here and tests/apparel-price-sheet.test.ts shows the diff;
 * tests/pricing-invariants.test.ts refuses a cell that makes a bigger run
 * cheaper than a smaller one — which is exactly the defect the 22 Aug
 * correction fixed in the original export (D1–D3 in PRICING.md).
 */

export type ApparelMatrixTier = {
  /** The run size this row starts at. Rows are ranges: 24 means 24–47. */
  minQuantity: number;
  /** Print per piece, one location, indexed by colour count 1..7. */
  perPieceByColors: number[];
  /**
   * The blank's markup on the S&S customer price at this run size, as a
   * multiplier of cost minus one: 1.5 is "150%" in Printavo's column and
   * means the shirt sells for 2.5 × cost.
   */
  garmentMarkup: number;
};

export const apparelPricingConfig = {
  tiers: [
    { minQuantity: 1, perPieceByColors: [21.0, 41.0, 61.0, 71.0, 80.0, 91.0, 101.0], garmentMarkup: 1.5 },
    { minQuantity: 12, perPieceByColors: [6.0, 13.0, 16.0, 19.0, 22.0, 25.0, 28.0], garmentMarkup: 1.5 },
    { minQuantity: 24, perPieceByColors: [4.5, 6.65, 8.2, 9.7, 11.25, 12.75, 14.3], garmentMarkup: 1.5 },
    { minQuantity: 48, perPieceByColors: [4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0], garmentMarkup: 1.5 },
    { minQuantity: 72, perPieceByColors: [3.25, 4.25, 5.25, 6.25, 7.25, 8.25, 9.25], garmentMarkup: 1.5 },
    { minQuantity: 144, perPieceByColors: [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0], garmentMarkup: 1.4 },
    { minQuantity: 288, perPieceByColors: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5], garmentMarkup: 1.3 },
    { minQuantity: 360, perPieceByColors: [2.25, 2.9, 3.7, 4.5, 5.35, 6.15, 6.95], garmentMarkup: 1.4 },
    { minQuantity: 840, perPieceByColors: [1.15, 1.25, 1.65, 2.0, 2.35, 2.7, 3.05], garmentMarkup: 1.4 },
    { minQuantity: 2496, perPieceByColors: [1.05, 1.15, 1.25, 1.35, 1.45, 1.55, 1.65], garmentMarkup: 1.3 },
    { minQuantity: 5001, perPieceByColors: [1.0, 1.1, 1.12, 1.15, 1.17, 1.2, 1.22], garmentMarkup: 1.3 },
  ] as ApparelMatrixTier[],

  /** The matrix's widest column. More colours than this quote by hand. */
  maxColorsPerLocation: 7,

  /** Published adder: one screen per colour per location. */
  setupFeePerColorPerLocation: 25,

  /**
   * The markup the catalogue's headline `markedUpPrice` is served at — the
   * matrix's top tier, which is what a customer sees in the size grid
   * before a run size exists. The estimate re-prices the blank at the
   * chosen tier's markup from `priceByMarkup`.
   */
  baseGarmentMarkup: 1.5,
};

/** "150" — the key `priceByMarkup` is stored under for a 1.5 markup. */
export function garmentMarkupKey(markup: number): string {
  return String(Math.round(markup * 100));
}

/** Every distinct blank markup the matrix uses, highest first. */
export function garmentMarkups(): number[] {
  return [...new Set(apparelPricingConfig.tiers.map((tier) => tier.garmentMarkup))].sort(
    (a, b) => b - a
  );
}
