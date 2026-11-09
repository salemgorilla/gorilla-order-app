/**
 * EMBROIDERY ESTIMATE — stitches and quantity in, a per-piece charge out, or a
 * reason it is a hand quote.
 *
 * Pure arithmetic over lib/embroidery-pricing-config.ts, with the rules the
 * export itself does not state. Every rule errs toward the shop, because the
 * output is an ESTIMATE the shop confirms after digitizing, and "quoted by
 * hand" is always a safe answer while a wrong low number is not.
 *
 *   column lookup      a count rides the NEXT column up (5,400 prices as 7,000);
 *                      an unconfirmed column is never used
 *   row lookup         step-down: 200 pieces price at the 144 row; fewer than
 *                      the first row's minimum is a hand quote
 *   never cheaper      a larger design never costs less than a smaller one at
 *                      the same run (the export's one backwards cell, D6)
 *
 * (That per-piece falls as the run grows, and rises with stitches, is not a
 * rule applied here: it is checked against the data in
 * tests/embroidery-pricing.test.ts, so a future edit cannot break it quietly.)
 *
 * Nothing here knows about garments, tax or Printavo. Tax: embroidery is a
 * service on clothing, which Massachusetts does not tax; the blank is exempt
 * too (lib/tax.ts), and the digitizing fee is a fee line, untaxed.
 */

import {
  embroideryPricingConfig,
  type EmbroideryPricingConfig,
  type EmbroideryQuantityRow,
} from "./embroidery-pricing-config";

export type EmbroideryPerPiece =
  | {
      ok: true;
      perPiece: number;
      /** The blank's markup at the row that priced this run. */
      garmentMarkup: number;
      /** Which export column priced it, for the shop to check against Printavo. */
      column: string;
      /** Which run-size row priced it. */
      minQuantity: number;
    }
  | { ok: false; reason: string };

/** The matrix with its one backwards cell resolved, per the never-cheaper rule. */
export function resolvedRows(config: EmbroideryPricingConfig): EmbroideryQuantityRow[] {
  return config.rows.map((row) => {
    let floor = 0;

    return {
      ...row,
      perPiece: row.perPiece.map((cell, index) => {
        // Only confirmed columns take part: an unconfirmed one is never used,
        // so it must not drag a confirmed neighbour upward either.
        if (!config.columns[index]?.confirmed) return cell;
        floor = Math.max(floor, cell);
        return floor;
      }),
    };
  });
}

export function embroideryPerPiece(
  stitches: number,
  quantity: number,
  config: EmbroideryPricingConfig = embroideryPricingConfig
): EmbroideryPerPiece {
  if (!config.ratesConfirmed) {
    return { ok: false, reason: "embroidery rates are not confirmed" };
  }

  if (!Number.isFinite(stitches) || stitches <= 0) {
    return { ok: false, reason: "no stitch count" };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: "no quantity" };
  }

  const columnIndex = config.columns.findIndex((column) => stitches <= column.upTo);

  if (columnIndex === -1) {
    return { ok: false, reason: "more stitches than the table prices" };
  }

  const column = config.columns[columnIndex];

  if (!column.confirmed) {
    return { ok: false, reason: `the ${column.header} column is not confirmed` };
  }

  const rows = resolvedRows(config);
  const eligible = rows.filter((row) => row.minQuantity <= quantity);
  const row = eligible[eligible.length - 1];

  if (!row) {
    return { ok: false, reason: `fewer than ${rows[0]?.minQuantity ?? 0} pieces` };
  }

  const perPiece = row.perPiece[columnIndex];

  if (typeof perPiece !== "number" || !Number.isFinite(perPiece) || perPiece <= 0) {
    return { ok: false, reason: "no price for this stitch range" };
  }

  return {
    ok: true,
    perPiece,
    garmentMarkup: row.garmentMarkup,
    column: column.header,
    minQuantity: row.minQuantity,
  };
}

export type EmbroideryDesignInput = {
  /** What the customer calls this placement, for the shop's note. */
  label: string;
  stitches: number;
};

export type EmbroideryEstimate =
  | {
      ok: true;
      /** One entry per placement, in the order given. */
      placements: Array<{ label: string; stitches: number; perPiece: number; total: number; column: string }>;
      /** Sum of every placement's per-piece charge times the run, to the cent. */
      embroideryTotal: number;
      /** Per design, once. Null when the fee is not set: the note must say so. */
      digitizingTotal: number | null;
      /** The blank's markup at the run's row, for pricing the garment itself. */
      garmentMarkup: number;
    }
  | { ok: false; reason: string };

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function estimateEmbroidery(
  designs: readonly EmbroideryDesignInput[],
  quantity: number,
  config: EmbroideryPricingConfig = embroideryPricingConfig
): EmbroideryEstimate {
  if (designs.length === 0) return { ok: false, reason: "no embroidery placement chosen" };

  const placements: Extract<EmbroideryEstimate, { ok: true }>["placements"] = [];
  let garmentMarkup = 0;

  for (const design of designs) {
    const priced = embroideryPerPiece(design.stitches, quantity, config);
    if (!priced.ok) return { ok: false, reason: `${design.label}: ${priced.reason}` };

    garmentMarkup = priced.garmentMarkup;
    placements.push({
      label: design.label,
      stitches: design.stitches,
      perPiece: priced.perPiece,
      total: cents(priced.perPiece * quantity),
      column: priced.column,
    });
  }

  return {
    ok: true,
    placements,
    embroideryTotal: cents(placements.reduce((sum, p) => sum + p.total, 0)),
    digitizingTotal:
      config.digitizingFee === null ? null : cents(config.digitizingFee * designs.length),
    garmentMarkup,
  };
}
