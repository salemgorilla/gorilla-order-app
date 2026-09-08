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
  /** Per-location overrides; a location without one uses `inkColors`. */
  inkColorsByLocation?: Record<string, string>;
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
  /** One entry per location — what each placement is charged for. */
  colorsByLocation: number[];
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

/**
 * COLOURS PER LOCATION, one entry per placement.
 *
 * ── WHY THIS IS A LIST NOW ────────────────────────────────────────────────
 * Gabe, 2026-09-07: "Each location should offer options for print color
 * amount. An order could be: Front is 2 color, back is 1."
 *
 * Until now one ink count covered the whole order, so a two-colour front
 * forced the back to two colours as well — the customer paid for a screen
 * that was never burned, on every job with an uneven design.
 *
 * ── FALLING BACK, NOT REQUIRING ───────────────────────────────────────────
 * `inkColorsByLocation` is sparse on purpose. A location with no entry uses
 * the order-level `inkColors`, so every payload written before this existed
 * — an open tab, a saved reorder link — prices exactly as it did. That is
 * also why the engine's arithmetic below had to stay equivalent rather than
 * merely similar; tests/apparel-price-sheet.test.ts holds 66 committed
 * totals to that.
 *
 * ── THE UNDERBASE IS PER LOCATION ─────────────────────────────────────────
 * It is a screen of white ink under the art, so a dark shirt printed front
 * AND back needs two of them. Added to each location's count, then capped
 * there — the cap is named maxColorsPerLocation for exactly this reason.
 */
export function locationColorCounts(input: {
  printLocations: string[];
  /** The order-level default, for any location without its own setting. */
  inkColors: string;
  inkColorsByLocation?: Record<string, string>;
  hasUnderbase: boolean;
}): number[] {
  const locations = input.printLocations.length ? input.printLocations : [""];

  return locations.map((location) => {
    const label = input.inkColorsByLocation?.[location] || input.inkColors;

    return Math.min(
      getInkColorCount(label) + (input.hasUnderbase ? 1 : 0),
      apparelPricingConfig.maxColorsPerLocation
    );
  });
}

/**
 * How the shop reads the ink spec back — "2 colors" when every location
 * matches, "Front 2 colors · Back 1 color" when they do not.
 *
 * Uniform orders keep the exact string they have always carried, so the
 * quote email, the Printavo description and the review row are unchanged for
 * every order that does not use this feature.
 */
export function describeInkColors(input: {
  printLocations: string[];
  inkColors: string;
  inkColorsByLocation?: Record<string, string>;
}): string {
  const labels = input.printLocations.map(
    (location) => input.inkColorsByLocation?.[location] || input.inkColors
  );

  if (!labels.length) return input.inkColors;
  if (labels.every((label) => label === labels[0])) return labels[0];

  return input.printLocations
    .map((location, index) => `${location} ${labels[index]}`)
    .join(" · ");
}

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
  /**
   * One entry per print location — its colour count, underbase included.
   * Was `locationCount` plus a single `colors`, which could not express a
   * two-colour front over a one-colour back.
   */
  colorsByLocation: number[];
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
  // At least one location: an order with none still prints something, and a
  // zero here would price the whole run at nothing.
  const colorsByLocation = input.colorsByLocation.length
    ? input.colorsByLocation
    : [1];
  const own = tierFor(quantity);

  const candidates = [own, ...tiersAscending().filter((t) => t.minQuantity > quantity)];

  let best: ReturnType<typeof priceApparelRun> | null = null;

  for (const tier of candidates) {
    /**
     * Each placement is its own pass through the matrix, summed — which is
     * what "locations × the cell" always meant, written so the locations can
     * differ. With every location on the same count the two are identical to
     * the cent, and the price sheet proves it.
     */
    const printUnitPrice = round2(
      colorsByLocation.reduce(
        (sum, colors) => sum + printPerPieceOneLocation(tier, colors),
        0
      )
    );
    const printTierQuantity = Math.max(quantity, tier.minQuantity);
    const printTotal = round2(printUnitPrice * printTierQuantity);
    const garmentTotal = round2(input.garmentTotalAt(tier.garmentMarkup));
    // A screen per colour per location — so it is the colours across the
    // whole job, not one location's count multiplied up.
    const setupTotal = round2(
      colorsByLocation.reduce((sum, colors) => sum + colors, 0) *
        apparelPricingConfig.setupFeePerColorPerLocation
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
  inkColorsByLocation,
  hasUnderbase,
}: ApparelPricingInput): ApparelPricingResult {
  const safeQuantity = Math.max(1, quantity);
  const locationCount = Math.max(1, printLocations.length);
  const colorsByLocation = locationColorCounts({
    printLocations,
    inkColors,
    inkColorsByLocation,
    hasUnderbase,
  });

  const unitAt = (markup: number): number =>
    garmentPriceByMarkup
      ? garmentPriceByMarkup[garmentMarkupKey(markup)] ?? 0
      : garmentUnitPrice ?? 0;

  const run = priceApparelRun({
    quantity: safeQuantity,
    colorsByLocation,
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
    colorsByLocation,
    // The most screens any ONE location needs. Equal to every location's
    // count on a uniform order, which is every order that predates
    // per-location ink, so nothing downstream reading this changed meaning.
    inkColorCount: Math.max(...colorsByLocation),
    underbaseFeePerPiece: 0,
    printTierQuantity: run.printTierQuantity,
  };
}
