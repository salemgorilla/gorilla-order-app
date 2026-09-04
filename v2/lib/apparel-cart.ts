import { calculateApparelPricing } from "./apparel-pricing";
import { apparelPricingConfig } from "./apparel-pricing-config";
import { applyRush } from "./rush";
import type { TurnaroundLane } from "./turnaround";

/**
 * Several garments in one apparel quote — 24 tees AND 12 hoodies, one
 * print, one invoice.
 *
 * Signs got a cart in #51; apparel never did, and the handoff named the
 * customer it cost: Stacey Beer submitted three separate times trying to
 * get one order priced. A real team order is rarely one garment.
 *
 * ── THE SHAPE, AND THE ASSUMPTION IN IT ───────────────────────────────────
 * A line is a GARMENT: style, colour, and its own size counts. The print
 * spec — locations, ink colours, the artwork — is shared across the whole
 * quote, because that is what a team order is: one design, several
 * garments. (The other possible shape, several designs on one garment, is
 * a different product and would be a different cart. Gabe approved "an
 * apparel cart" without picking; this is the shape a print shop orders in,
 * and it is stated here so it can be argued with.)
 *
 * ── THE PRICING DECISION, STATED SO IT CAN BE REVERSED ────────────────────
 * SETUP IS CHARGED ONCE FOR THE QUOTE, not once per line. The same screens
 * print the tees and the hoodies — charging setup twice would bill for
 * screens nobody burned. That is the honest default and the whole economic
 * point of ordering together, but it IS a pricing-model choice on numbers
 * still awaiting sign-off, so it lives here as one flag rather than buried
 * in arithmetic.
 *
 * PRINTING is per piece across the COMBINED count, so the quantity tier is
 * read from the total: 20 tees and 20 hoodies is a 40-piece run and gets
 * the 24+ rate, which is exactly what the press does.
 *
 * ── THE INVARIANT ─────────────────────────────────────────────────────────
 * A ONE-LINE CART PRICES EXACTLY AS THE SINGLE-GARMENT CONFIGURATOR DOES
 * TODAY, to the cent. The committed apparel price sheet and the audit
 * driver both describe that flow, and neither should have to be
 * regenerated because a cart appeared. Pinned by name in the tests.
 */

export const apparelCartRules = {
  /**
   * One set of screens for the whole quote. Set false to bill setup per
   * garment line instead — Gabe's call if the shop really does re-burn.
   */
  shareSetupAcrossLines: true,
};

export type ApparelCartLine = {
  id: string;
  /** What the customer sees: "Premium Soft Tee". */
  garmentLabel: string;
  colorName: string;
  /**
   * The S&S style number, when the line knows it. lib/printavo.ts files a
   * cart's garment rows under GORILLA-APPAREL-<style> — the same SKU a
   * single-garment order has always used — so "how many 5000s did we sell"
   * has one answer whether the shirt came in on its own or in a cart.
   */
  catalogStyle?: string;
  /** Clean 2dp per-shirt price for this line — blended or exact. */
  garmentUnitPrice: number;
  quantity: number;
};

export type ApparelCartPrintSpec = {
  printLocations: string[];
  inkColors: string;
  hasUnderbase: boolean;
};

export type ApparelCartQuote = {
  lines: Array<ApparelCartLine & { garmentTotal: number }>;
  /** Pieces across every line — what the print tier is read from. */
  quantity: number;
  garmentTotal: number;
  /**
   * Weighted average across the lines. Present so a cart quote is a
   * SUPERSET of ApparelPricingResult — every surface that reads the
   * single-garment shape keeps working unchanged, which is what makes
   * routing the live flow through this engine a no-op.
   */
  garmentUnitPrice: number;
  underbaseFeePerPiece: number;
  printUnitPrice: number;
  printTotal: number;
  setupTotal: number;
  total: number;
  /** Across the whole quote. Meaningless per garment; useful as a headline. */
  unitPrice: number;
  inkColorCount: number;
  locationCount: number;
  /**
   * Rush scheduling, when the need-by date calls for one — see
   * withApparelRush. Zero on an ordinary quote; always present so the
   * payload carries the field rather than depending on a spread.
   */
  rushFee?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteApparelCart(
  lines: ApparelCartLine[],
  print: ApparelCartPrintSpec
): ApparelCartQuote {
  const usable = lines.filter((line) => line.quantity > 0);
  const quantity = usable.reduce((sum, line) => sum + line.quantity, 0);

  /**
   * Nothing ordered is nothing owed.
   *
   * Without this the engine's own Math.max(1, quantity) floor invents a
   * single phantom shirt, and an empty cart quotes the under-24 print
   * rate plus a full set of screens — $33 for an order containing no
   * garments. A figure nobody set, on a screen a customer reads as a
   * price. (Found by the empty-cart test, which is why it exists.)
   */
  if (quantity === 0) {
    return {
      lines: [],
      quantity: 0,
      garmentTotal: 0,
      garmentUnitPrice: 0,
      underbaseFeePerPiece: 0,
      printUnitPrice: 0,
      printTotal: 0,
      setupTotal: 0,
      total: 0,
      unitPrice: 0,
      inkColorCount: 0,
      locationCount: 0,
    };
  }

  /**
   * The engine, called ONCE for the whole quote.
   *
   * Not once per line and summed: setup would multiply (see the rule
   * above) and each line would be tiered on its own count, so 20 tees and
   * 20 hoodies would pay the under-24 rate twice instead of the 40-piece
   * rate once. The press does not work that way and neither does this.
   *
   * garmentUnitPrice is passed as the weighted average of the lines, so
   * the engine's garmentTotal equals the sum of the lines' own totals.
   */
  const garmentTotal = round2(
    usable.reduce((sum, line) => sum + line.garmentUnitPrice * line.quantity, 0)
  );

  const priced = calculateApparelPricing({
    quantity: Math.max(1, quantity),
    garmentUnitPrice: quantity > 0 ? garmentTotal / quantity : 0,
    printLocations: print.printLocations,
    inkColors: print.inkColors,
    hasUnderbase: print.hasUnderbase,
  });

  // Setup, per the rule: once for the quote, or once per garment line.
  const setupTotal = apparelCartRules.shareSetupAcrossLines
    ? priced.setupTotal
    : round2(priced.setupTotal * Math.max(1, usable.length));

  const total = round2(garmentTotal + priced.printTotal + setupTotal);

  return {
    lines: usable.map((line) => ({
      ...line,
      garmentTotal: round2(line.garmentUnitPrice * line.quantity),
    })),
    quantity,
    garmentTotal,
    garmentUnitPrice: round2(garmentTotal / quantity),
    underbaseFeePerPiece: priced.underbaseFeePerPiece,
    printUnitPrice: priced.printUnitPrice,
    printTotal: round2(priced.printTotal),
    setupTotal: round2(setupTotal),
    total,
    unitPrice: quantity > 0 ? round2(total / quantity) : 0,
    inkColorCount: priced.inkColorCount,
    locationCount: priced.locationCount,
  };
}

/** What the quote saves by ordering together, for the screen to say. */
export function describeCartSaving(quote: ApparelCartQuote): string | null {
  if (quote.lines.length < 2 || !apparelCartRules.shareSetupAcrossLines) {
    return null;
  }

  // Ordering the same lines separately would repeat the screens.
  const repeated = round2(
    (quote.setupTotal / Math.max(1, 1)) * (quote.lines.length - 1)
  );
  if (repeated <= 0) return null;

  return `One set of screens covers all ${quote.lines.length} garments — ordering them separately would add $${repeated.toFixed(
    2
  )} in setup.`;
}

/** The tier the combined run reaches, for naming the lever on screen. */
export function combinedTierQuantity(quote: ApparelCartQuote): number | null {
  const tiers = apparelPricingConfig.basePrintPrices
    .map((tier) => tier.minQuantity)
    .filter((min) => min > quote.quantity);

  return tiers.length > 0 ? Math.min(...tiers) : null;
}

/**
 * The same quote with rush scheduling applied, when the date calls for one.
 *
 * The sibling of withSignsRush, and here for the same reason: this
 * composition lived in a useMemo that no test could mount, and it is the
 * step where the quote and the invoice get their chance to disagree. Rush
 * rides on the GOODS — garments, printing and screens — and lands in the
 * total every surface reads, so the sticky bar, the review card, the
 * confirmation and the payload cannot answer differently.
 *
 * Apparel is MA-exempt outright, so there is no taxable base to adjust here
 * the way the signs version adjusts `feeTotal`.
 */
export function withApparelRush(
  quote: ApparelCartQuote,
  when: { needBy: string; lane: TurnaroundLane; today?: string }
): ApparelCartQuote {
  const rush = applyRush({
    goodsSubtotal: quote.total,
    needBy: when.needBy,
    lane: when.lane,
    today: when.today,
  });

  const total = round2(quote.total + rush.fee);

  return {
    ...quote,
    rushFee: rush.fee,
    total,
    unitPrice: round2(total / Math.max(1, quote.quantity)),
  };
}
