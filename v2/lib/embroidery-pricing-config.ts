/**
 * EMBROIDERY PRICING — the shop's Printavo embroidery matrix, as data.
 *
 * Gabe, 2026-11-09, sent `Embroidery-Pricing-Matrix-Export-20261109`. This file
 * IS that table, transcribed cell for cell (tests/embroidery-pricing.test.ts
 * pins every cell), with the questions it raises written down beside it
 * rather than quietly answered. PRICING.md carried the same table as "Printavo
 * only, carried from 22 Aug" with two open defects, D5 (stitch-tier gaps) and
 * D6 (a backwards cell at qty 6); both are still in this export.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────
 * Quantity down, stitch range across. Every cell is the embroidery charge PER
 * PIECE FOR ONE PLACEMENT, the same basis as the screen-print matrix. The last
 * column is the blank's markup at that run size (150 / 140), the same key the
 * S&S catalogue already serves a blank price under.
 *
 * ── WHAT THE EXPORT LEAVES OPEN (each answered CONSERVATIVELY, all for Gabe) ──
 * 1. GAPS BETWEEN COLUMNS. The headers read "0 - 5000", "6001 - 7000",
 *    "10-11K", "12-13K": nothing covers 5,001 to 6,000 or 11,001 to 11,999.
 *    The rule used is the one price lists use: a count rides the NEXT column
 *    up (a 5,400-stitch logo is priced as 7,000). It can only charge more, and
 *    the shop confirms the real count after digitizing anyway.
 * 2. THE LAST COLUMN. "20000" sits after "12-13K" with nothing between, and its
 *    price is about double the column before it. Whether it means "13,001 to
 *    20,000" or "exactly 20,000" cannot be read from the export, so it is
 *    recorded here and NOT USED: above 13,000 stitches an estimate is a hand
 *    quote until Gabe says which.
 * 3. A BACKWARDS CELL. At quantity 6 the 9,001-10,000 column is $8.76 and the
 *    10-11K column is $8.50: a bigger design cheaper than a smaller one. The
 *    pricing rule keeps a larger design from costing less than a smaller one
 *    (the yard-sign rule, kept), so that cell reads $8.76. The row's own
 *    steps (about $0.65) suggest the intended figure is nearer $9.30; it is
 *    left for Gabe to correct at the source rather than guessed here.
 * 4. NO ROW BELOW 6. One to five pieces is a hand quote.
 * 5. THE DIGITIZING FEE has no figure yet. `null` below means the estimate
 *    says "plus a one-time digitizing fee, quoted when we see your logo".
 *
 * `ratesConfirmed` stays false until Gabe has answered 2 and 3 and given 5.
 * While it is false NO embroidery estimate is shown, whatever the table holds.
 */

export type EmbroideryStitchColumn = {
  /** The column header as exported, for anyone comparing against Printavo. */
  header: string;
  /** The highest stitch count this column prices (inclusive). */
  upTo: number;
  /**
   * Whether the column's meaning is settled. An unconfirmed column is kept in
   * the data and never used to price (see the note on the last column above).
   */
  confirmed: boolean;
};

export const embroideryStitchColumns: readonly EmbroideryStitchColumn[] = [
  { header: "0 - 5000 Stitches", upTo: 5000, confirmed: true },
  { header: "6001 - 7000 Stitches", upTo: 7000, confirmed: true },
  { header: "7001 - 8000 Stitches", upTo: 8000, confirmed: true },
  { header: "8001 - 9000 Stitches", upTo: 9000, confirmed: true },
  { header: "9001 - 10000 Stitches", upTo: 10000, confirmed: true },
  { header: "10-11K Stitches", upTo: 11000, confirmed: true },
  { header: "12-13K Stitches", upTo: 13000, confirmed: true },
  { header: "20000", upTo: 20000, confirmed: false },
];

export type EmbroideryQuantityRow = {
  /** The run size this row starts at. Rows are ranges: 48 means 48 to 143. */
  minQuantity: number;
  /** Per piece, one placement, one price per column above, in order. */
  perPiece: readonly number[];
  /** The blank's markup at this run size, as the matrix writes it divided by 100. */
  garmentMarkup: number;
};

/** The export, verbatim. Do not "fix" a cell here: see the notes above. */
export const embroideryMatrix: readonly EmbroideryQuantityRow[] = [
  { minQuantity: 6, perPiece: [6.25, 6.9, 7.49, 8.14, 8.76, 8.5, 10.0, 17.5], garmentMarkup: 1.5 },
  { minQuantity: 12, perPiece: [5.5, 6.05, 6.6, 7.15, 7.7, 8.25, 9.75, 17.25], garmentMarkup: 1.5 },
  { minQuantity: 48, perPiece: [5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 8.25, 16.0], garmentMarkup: 1.5 },
  { minQuantity: 144, perPiece: [4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.85, 15.6], garmentMarkup: 1.4 },
  { minQuantity: 432, perPiece: [4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 7.4, 15.2], garmentMarkup: 1.4 },
  { minQuantity: 731, perPiece: [3.8, 4.2, 4.6, 5.0, 5.4, 5.8, 7.0, 14.8], garmentMarkup: 1.4 },
  { minQuantity: 1000, perPiece: [3.5, 3.86, 4.22, 4.58, 4.94, 5.3, 6.5, 14.3], garmentMarkup: 1.4 },
];

/**
 * The one-time charge for digitizing a new logo, in dollars, per distinct
 * design. `null` until Gabe gives the amount (and says whether it is waived
 * above some quantity). A service, so untaxed like every other fee line.
 */
export const embroideryDigitizingFee: number | null = null;

/**
 * Flip to true ONLY when Gabe has answered the open questions above, given the
 * digitizing fee and a real test order has been checked against Printavo.
 * Left false deliberately: an apparel estimate the shop has not stood behind is
 * worse than "quoted by hand".
 */
export const embroideryRatesConfirmed = false;

export type EmbroideryPricingConfig = {
  columns: readonly EmbroideryStitchColumn[];
  rows: readonly EmbroideryQuantityRow[];
  digitizingFee: number | null;
  ratesConfirmed: boolean;
};

export const embroideryPricingConfig: EmbroideryPricingConfig = {
  columns: embroideryStitchColumns,
  rows: embroideryMatrix,
  digitizingFee: embroideryDigitizingFee,
  ratesConfirmed: embroideryRatesConfirmed,
};
