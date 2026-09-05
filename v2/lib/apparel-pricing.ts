import { apparelPricingConfig } from "./apparel-pricing-config";

export type ApparelPricingInput = {
  quantity: number;
  /**
   * Always a clean 2dp per-shirt figure — the blended price before sizes
   * exist, or the size-mix figure quantized by garmentUnitPriceFromSizes
   * (lib/apparel-blend.ts) once they do. Printavo stores a unit price and
   * multiplies, so the garment component must ALWAYS be unit × quantity of
   * a 2dp unit: any raw division here re-opens the 4dp drift this file's
   * Printavo counterpart documents ($0.02 over, growing with quantity).
   */
  garmentUnitPrice: number;
  printLocations: string[];
  inkColors: string;
  hasUnderbase: boolean;
};

export type ApparelPricingResult = {
  garmentUnitPrice: number;
  garmentTotal: number;
  printUnitPrice: number;
  printTotal: number;
  setupTotal: number;
  total: number;
  unitPrice: number;
  locationCount: number;
  inkColorCount: number;
  underbaseFeePerPiece: number;
  /**
   * The piece count the PRINT charge was computed at. Equal to the quantity
   * except just under a price break, where it is the next tier's minimum —
   * see the never-pay-more rule in calculateApparelPricing. printTotal is
   * always printUnitPrice × this, never × quantity.
   */
  printTierQuantity: number;
};

const fallbackApparelPricingConfig = {
  basePrintPrices: [
    {
      minQuantity: 250,
      pricePerPiece: 3.25,
    },
    {
      minQuantity: 100,
      pricePerPiece: 4.0,
    },
    {
      minQuantity: 50,
      pricePerPiece: 4.75,
    },
    {
      minQuantity: 24,
      pricePerPiece: 6.0,
    },
    {
      minQuantity: 1,
      pricePerPiece: 8.0,
    },
  ],

  extraLocationFeePerPiece: 2.5,
  extraInkColorFeePerPiece: 0.65,
  underbaseFeePerPiece: 0.75,
  setupFeePerColorPerLocation: 25,
};

function getPricingConfig() {
  return apparelPricingConfig || fallbackApparelPricingConfig;
}

function getInkColorCount(inkColors: string) {
  if (inkColors.startsWith("1")) {
    return 1;
  }

  if (inkColors.startsWith("2")) {
    return 2;
  }

  if (inkColors.startsWith("3")) {
    return 3;
  }

  if (inkColors.startsWith("4")) {
    return 4;
  }

  return 5;
}

function getBasePrintPrice(quantity: number) {
  const config = getPricingConfig();

  const sortedPrices = [...config.basePrintPrices].sort(
    (a, b) => b.minQuantity - a.minQuantity
  );

  const matchingPrice = sortedPrices.find(
    (price) => quantity >= price.minQuantity
  );

  return matchingPrice?.pricePerPiece || 0;
}

export function calculateApparelPricing({
  quantity,
  garmentUnitPrice,
  printLocations,
  inkColors,
  hasUnderbase,
}: ApparelPricingInput): ApparelPricingResult {
  const config = getPricingConfig();

  const safeQuantity = Math.max(1, quantity);
  const locationCount = Math.max(1, printLocations.length);
  const inkColorCount = getInkColorCount(inkColors);

  const garmentTotal = garmentUnitPrice * safeQuantity;

  const extraLocationFee =
    Math.max(0, locationCount - 1) * config.extraLocationFeePerPiece;
  const extraInkFee =
    Math.max(0, inkColorCount - 1) * config.extraInkColorFeePerPiece;
  const underbaseFeePerPiece = hasUnderbase ? config.underbaseFeePerPiece : 0;
  const perPieceFees = extraLocationFee + extraInkFee + underbaseFeePerPiece;

  /**
   * NEVER PAY MORE THAN YOU WOULD FOR MORE SHIRTS.
   *
   * The print tiers step down at 24, 50, 100 and 250, and a step-down
   * table has a cliff on the near side of every step: 23 shirts at $8.00
   * printed for $184 while 24 at $6.00 printed for $144. A customer saved
   * $40 by ordering one more shirt, and $57 at 49 -> 50. The pricing
   * handoff's invariant checks (tests/pricing-invariants.test.ts) found
   * it the first time they ran — the same shape that leaked money in the
   * shop's Printavo matrix, arriving here by table rather than by typo.
   *
   * The rule is the one the shop already applies at the counter for yard
   * signs (getYardSignPrice): if a bigger tier's MINIMUM prints for less,
   * the print charge is that figure. The customer keeps the shirts they
   * asked for and buys only those blanks; the PRINT is charged at the
   * better tier. Per-piece adders (locations, colours, underbase) are part
   * of the per-piece rate, so they are compared at the tier minimum too.
   * Setup is untouched — screens do not care how many shirts run.
   */
  const tiers = [...config.basePrintPrices].sort(
    (a, b) => a.minQuantity - b.minQuantity
  );

  let printUnitPrice = getBasePrintPrice(safeQuantity) + perPieceFees;
  let printTierQuantity = safeQuantity;
  let printTotal = printUnitPrice * safeQuantity;

  for (const tier of tiers) {
    if (tier.minQuantity <= safeQuantity) continue;

    const unit = tier.pricePerPiece + perPieceFees;
    const total = unit * tier.minQuantity;

    if (total < printTotal) {
      printUnitPrice = unit;
      printTierQuantity = tier.minQuantity;
      printTotal = total;
    }
  }

  const setupTotal =
    inkColorCount * locationCount * config.setupFeePerColorPerLocation;

  const total = garmentTotal + printTotal + setupTotal;
  const unitPrice = total / safeQuantity;

  return {
    garmentUnitPrice,
    garmentTotal,
    printUnitPrice,
    printTotal,
    setupTotal,
    total,
    unitPrice,
    locationCount,
    inkColorCount,
    underbaseFeePerPiece,
    printTierQuantity,
  };
}
