/**
 * EMBROIDERY PRICING — the shop's Printavo embroidery matrix, completed.
 *
 * Gabe, 2026-11-09, sent `Embroidery-Pricing-Matrix-Export-20261109` and asked
 * for its holes to be filled "relative to how the rest of the pricing works".
 * The export is kept verbatim in lib/embroidery-export.ts; the table the app
 * prices from is DERIVED from it by lib/embroidery-matrix.ts, with the rules and
 * the reasoning written there and every cell tagged as exported, filled or
 * adjusted (tests/embroidery-matrix.test.ts pins all of it). PRICING.md carried
 * the same table as "Printavo only, carried from 22 Aug" with two open defects,
 * D5 (stitch-tier gaps) and D6 (a backwards cell at qty 6); both are what the
 * derivation resolves.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────
 * Quantity down, one 1,000-stitch band across (0-5,000, then 5,001-6,000 up to
 * 19,001-20,000). Every cell is the embroidery charge PER PIECE FOR ONE
 * PLACEMENT, the same basis as the screen-print matrix. The last column of the
 * export is the blank's markup at that run size (150 / 140), the same key the
 * S&S catalogue already serves a blank price under.
 *
 * ── STILL ASSUMED, ALL FOR GABE TO CONFIRM ────────────────────────────────
 * - 5,001-6,000 is priced the same as 0-5,000 (see lib/embroidery-matrix.ts).
 * - The export's "20000" column is the 19,001-20,000 band, and 13,001-19,000 is
 *   a straight line up to it.
 * - Fewer than 6 pieces is a hand quote: the export has no row for it.
 * - Above 20,000 stitches is a hand quote.
 * - The digitizing fee has no figure yet. `null` below means the estimate says
 *   "plus a one-time digitizing fee, quoted when we see your logo".
 *
 * `ratesConfirmed` stays false until Gabe has confirmed the above, given the
 * digitizing fee and a real test order has been checked against Printavo. While
 * it is false NO embroidery estimate is shown, whatever the table holds.
 */

import { completeEmbroideryMatrix } from "./embroidery-matrix";

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

const completed = completeEmbroideryMatrix();

export const embroideryStitchColumns: readonly EmbroideryStitchColumn[] = completed.columns.map((column) => ({
  header: column.header,
  upTo: column.upTo,
  confirmed: true,
}));

export type EmbroideryQuantityRow = {
  /** The run size this row starts at. Rows are ranges: 48 means 48 to 143. */
  minQuantity: number;
  /** Per piece, one placement, one price per column above, in order. */
  perPiece: readonly number[];
  /** The blank's markup at this run size, as the matrix writes it divided by 100. */
  garmentMarkup: number;
};

export const embroideryMatrix: readonly EmbroideryQuantityRow[] = completed.rows.map((row) => ({
  minQuantity: row.minQuantity,
  perPiece: row.cells.map((cell) => cell.price),
  garmentMarkup: row.garmentMarkup,
}));

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
