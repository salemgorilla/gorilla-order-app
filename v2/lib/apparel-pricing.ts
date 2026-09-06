import {
  apparelPricingConfig,
  garmentMarkupKey,
  type ApparelMatrixTier,
} from "./apparel-pricing-config";

/**
 * The apparel engine — the Printavo matrix (lib/apparel-pricing-config.ts)
 * plus the rules a matrix cannot hold. See the config header for both.
 */

export type ApparelPricingInput = {
  quantity: number;
  /**
   * The blank's per-shirt price at EVERY markup the matrix uses, keyed by
   * garmentMarkupKey ("150", "140", "130") — lib/apparel-blend.ts builds
   * it, blended or exact from sizes. The engine picks the tier first, then
   * the blank price that goes with it. Each value is a clean 2dp unit:
   * Printavo stores a unit price and multiplies, so the garment component
   * must always be unit × quantity of a 2dp unit.
   */
  garmentPriceByMarkup?: Record<string, number>;
  /**
   * One per-shirt price regardless of tier. The pre-matrix shape, kept for
   * callers that have a figure and no catalogue colour (tests, the invoice
   * sweep, a payload being repriced). Ignored when garmentPriceByMarkup is
   * given.
   */
  garmentUnitPrice?: number;
  printLocations: string[];
  inkColors: string;
  /** A white underbase on a dark garment — one more colour. */
  hasUnderbase: boolean;
};

export type ApparelPricingResult = {
  garmentUnitPrice: number;
  /** The blank markup applied, as the matrix states it (1.5 = 150%). */
  garmentMarkup: number;
  garmentTotal: number;
  /** Print per piece across ALL locations, at the charged tier. */
  printUnitPrice: number;
  printTotal: number;
  setupTotal: number;
  total: number;
  unitPrice: number;
  locationCount: number;
  /** Colours INCLUDING the underbase — the screen count per location. */
  inkColorCount: number;
  /**
   * Always 0 under the matrix: the underbase is a colour, not a per-piece
   * fee. Kept so every surface that read the field keeps reading a number.
   */
  underbaseFeePerPiece: number;
  /**
   * The piece count the PRINT charge was computed at. Equal to the quantity
   * except just under a price break, where it is the next tier's minimum —
   * never pay more than you would for more shirts. printTotal is always
   * printUnitPrice × this, never × quantity.
   */
  printTierQuantity: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "3 colors" -> 3; "5+ colors / Full color / Not sure" -> 5. */
export function getInkColorCount(inkColors: string): number {
  const match = String(inkColors).match(/^(\d)/);
  const n = match ? Number(match[1]) : 5;

  return Math.min(Math.max(1, n), apparelPricingConfig.maxColorsPerLocation);
}

function tiersAscending(): ApparelMatrixTier[] {
  return [...apparelPricingConfig.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
}

/** Step-down: the highest tier whose minimum the quantity reaches. */
export function tierFor(quantity: number): ApparelMatrixTier {
  const tiers = tiersAscending();
  let chosen = tiers[0];

  for (const tier of tiers) {
    if (quantity >= tier.minQuantity) chosen = tier;
  }

  return chosen;
}

/** The matrix cell: print per piece, one location, at this colour count. */
export function printPerPieceOneLocation(tier: ApparelMatrixTier, colors: number): number {
  const index = Math.min(Math.max(1, colors), apparelPricingConfig.maxColorsPerLocation) - 1;

  return tier.perPieceByColors[index];
}

/**
 * THE CORE — choose the tier and price the run. Shared by the single-garment
 * engine and the cart, so a one-line cart prices exactly as a single garment.
 *
 * `garmentTotalAt(markup)` is the blank cost for the WHOLE run at a given
 * markup — the caller sums its lines at their own 2dp units, so no division
 * happens here.
 *
 * NEVER PAY MORE THAN YOU WOULD FOR MORE SHIRTS. The candidates are your own
 * tier at your count, and every bigger tier at its minimum: print at that
 * tier's cell × its minimum, the blanks at that tier's markup × YOUR count
 * (you buy only the shirts you asked for). The cheapest wins; ties go to
 * your own tier. Without this the matrix has a cliff on the near side of
 * every step — 23 shirts printed for more than 24 — the defect class the
 * invariant tests exist for.
 */
export function priceApparelRun(input: {
  quantity: number;
  locationCount: number;
  /** Colours per location, underbase included. */
  colors: number;
  garmentTotalAt: (markup: number) => number;
}): {
  tier: ApparelMatrixTier;
  printUnitPrice: number;
  printTierQuantity: number;
  printTotal: number;
  garmentTotal: number;
  setupTotal: number;
} {
  const quantity = Math.max(1, Math.floor(input.quantity));
  const locations = Math.max(1, input.locationCount);
  const own = tierFor(quantity);

  const candidates = [own, ...tiersAscending().filter((t) => t.minQuantity > quantity)];

  let best: ReturnType<typeof priceApparelRun> | null = null;

  for (const tier of candidates) {
    const printUnitPrice = round2(printPerPieceOneLocation(tier, input.colors) * locations);
    const printTierQuantity = Math.max(quantity, tier.minQuantity);
    const printTotal = round2(printUnitPrice * printTierQuantity);
    const garmentTotal = round2(input.garmentTotalAt(tier.garmentMarkup));
    const setupTotal = round2(
      input.colors * locations * apparelPricingConfig.setupFeePerColorPerLocation
    );
    const candidate = { tier, printUnitPrice, printTierQuantity, printTotal, garmentTotal, setupTotal };

    if (best === null || printTotal + garmentTotal < best.printTotal + best.garmentTotal) {
      best = candidate;
    }
  }

  return best!;
}

export function calculateApparelPricing({
  quantity,
  garmentPriceByMarkup,
  garmentUnitPrice,
  printLocations,
  inkColors,
  hasUnderbase,
}: ApparelPricingInput): ApparelPricingResult {
  const safeQuantity = Math.max(1, quantity);
  const locationCount = Math.max(1, printLocations.length);
  const colors = Math.min(
    getInkColorCount(inkColors) + (hasUnderbase ? 1 : 0),
    apparelPricingConfig.maxColorsPerLocation
  );

  const unitAt = (markup: number): number =>
    garmentPriceByMarkup
      ? garmentPriceByMarkup[garmentMarkupKey(markup)] ?? 0
      : garmentUnitPrice ?? 0;

  const run = priceApparelRun({
    quantity: safeQuantity,
    locationCount,
    colors,
    garmentTotalAt: (markup) => unitAt(markup) * safeQuantity,
  });

  const resolvedUnit = unitAt(run.tier.garmentMarkup);
  const total = round2(run.garmentTotal + run.printTotal + run.setupTotal);

  return {
    garmentUnitPrice: resolvedUnit,
    garmentMarkup: run.tier.garmentMarkup,
    garmentTotal: run.garmentTotal,
    printUnitPrice: run.printUnitPrice,
    printTotal: run.printTotal,
    setupTotal: run.setupTotal,
    total,
    unitPrice: total / safeQuantity,
    locationCount,
    inkColorCount: colors,
    underbaseFeePerPiece: 0,
    printTierQuantity: run.printTierQuantity,
  };
}
