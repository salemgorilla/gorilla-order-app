import type { ApparelCartQuote } from "./apparel-cart";

/**
 * WHAT EACH GARMENT COSTS, PER PIECE, WHEN THE RUN HOLDS MORE THAN ONE.
 *
 * ── WHY ONE "EACH" IS NOT ENOUGH ──────────────────────────────────────────
 * Gabe, 2026-09-09: "I want the price per item to show for each item. If
 * there are two different items in the print run, they each need the cost
 * per item shown separately."
 *
 * The quote's `unitPrice` is total ÷ pieces — a WEIGHTED AVERAGE across the
 * cart. On 24 tees and 12 hoodies it is a figure that describes neither
 * garment: every tee costs less than it and every hoodie costs more. This
 * repo has already been bitten by exactly that shape twice — the sticker
 * cart's blended "each" and the signs cart's, both removed with the same
 * note: an average of things that do not average reads as a real per-item
 * figure the customer can quote back.
 *
 * ── HOW A PIECE'S COST IS MADE UP ─────────────────────────────────────────
 * Three components, and only one of them differs between garments:
 *
 *   garment   THIS line's blank at the tier the whole run reached. A hoodie
 *             blank costs more than a tee blank; that difference IS the
 *             difference between the two per-piece figures.
 *   printing  Per piece across the combined run, at one rate — the press
 *             does not care which garment is under the platen.
 *   setup     Charged ONCE for the quote (apparelCartRules), so it is a
 *             share: one set of screens spread over every piece. Rush is
 *             the same shape and rides with it.
 *
 * ── THE SHARED PART IS DERIVED FROM THE TOTAL, NOT REBUILT FROM PARTS ─────
 * The obvious formula is printUnitPrice + (setup + rush) ÷ pieces. It is
 * WRONG, and the way it is wrong is invisible in a fixture:
 *
 *   printTotal is printUnitPrice × printTierQuantity, NOT × quantity.
 *   Never-pay-more (lib/apparel-pricing.ts) charges a 36-piece run at the
 *   48-piece rate when that costs less — so 36 pieces were quoted $288 of
 *   printing while printUnitPrice × 36 came to $216. The per-garment
 *   figures summed $72.12 UNDER the total the customer was shown, on the
 *   very first real cart driven through a browser.
 *
 * So the shared part is (total − garments) ÷ pieces. That is exhaustive by
 * construction: whatever the engine put in the total and did not put on a
 * garment is, by definition, shared across the run — printing at whatever
 * rate it landed on, one set of screens, rush, and anything added later
 * that this file has never heard of.
 *
 * ── THE ARITHMETIC IS EXACT, THE DISPLAY IS ROUNDED ───────────────────────
 * Σ (each × that line's count) = the quote total exactly, before rounding.
 * What is returned here is rounded to the cent for display, so a reader
 * adding the lines up by hand can land a cent or two off on a run whose
 * shared part does not divide evenly (25 ÷ 24 = 1.0416…).
 *
 * That is why NO PER-LINE TOTAL IS RETURNED. The order has one total and it
 * comes from the engine; these are per-piece figures beside it. Inventing a
 * line total here would put a column on screen that does not add up, which
 * is a worse failure than the one being fixed.
 */

export type ApparelLineEach = {
  id: string;
  garmentLabel: string;
  colorName: string;
  quantity: number;
  /** "M-12, L-6", when this garment has its own sizes (#134). */
  sizeBreakdown?: string;
  /** This line's blank at the charged tier — the part that differs. */
  garmentUnitPrice: number;
  /** Garment + printing + this piece's share of setup and rush. */
  unitPrice: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The part of a piece's cost that is the same whatever garment it is —
 * printing, the one set of screens, and rush.
 *
 * DERIVED FROM THE TOTAL, never rebuilt from the components: see the header
 * for the $72.12 that taught the difference. Everything the engine charged
 * that is not a garment is shared across the run, whatever it was.
 */
export function apparelSharedPerPiece(quote: ApparelCartQuote): number {
  const pieces = quote.quantity;
  if (!(pieces > 0)) return 0;

  return (quote.total - quote.garmentTotal) / pieces;
}

/**
 * Every garment on the quote, with its own per-piece figure.
 *
 * Returns [] for an empty quote — a cart with nothing in it has no piece to
 * price, and the engine already refuses to invent one.
 */
export function apparelLineEach(quote: ApparelCartQuote): ApparelLineEach[] {
  const shared = apparelSharedPerPiece(quote);

  return quote.lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      id: line.id,
      garmentLabel: line.garmentLabel,
      colorName: line.colorName,
      quantity: line.quantity,
      sizeBreakdown: line.sizeBreakdown,
      garmentUnitPrice: round2(line.garmentUnitPrice),
      unitPrice: round2(line.garmentUnitPrice + shared),
    }));
}

/**
 * Do the per-garment figures actually differ?
 *
 * Two lines of the SAME garment in the same colour — or two different
 * garments whose blanks happen to cost the same — produce one figure twice,
 * and printing it twice is noise dressed as detail. The screens ask this
 * before they list anything.
 */
export function apparelEachVaries(lines: ApparelLineEach[]): boolean {
  if (lines.length < 2) return false;

  return new Set(lines.map((line) => line.unitPrice)).size > 1;
}
