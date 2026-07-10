import { apparelPricingConfig } from "./apparel-pricing-config";

export type ApparelPricingInput = {
  quantity: number;
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
};

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
  const sortedPrices = [...apparelPricingConfig.basePrintPrices].sort(
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
  const safeQuantity = Math.max(1, quantity);
  const locationCount = Math.max(1, printLocations.length);
  const inkColorCount = getInkColorCount(inkColors);

  const garmentTotal = garmentUnitPrice * safeQuantity;

  const basePrintPrice = getBasePrintPrice(safeQuantity);
  const extraLocationFee =
    Math.max(0, locationCount - 1) *
    apparelPricingConfig.extraLocationFeePerPiece;
  const extraInkFee =
    Math.max(0, inkColorCount - 1) *
    apparelPricingConfig.extraInkColorFeePerPiece;
  const underbaseFeePerPiece = hasUnderbase
    ? apparelPricingConfig.underbaseFeePerPiece
    : 0;

  const printUnitPrice =
    basePrintPrice + extraLocationFee + extraInkFee + underbaseFeePerPiece;

  const printTotal = printUnitPrice * safeQuantity;

  const setupTotal =
    inkColorCount *
    locationCount *
    apparelPricingConfig.setupFeePerColorPerLocation;

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
  };
}
