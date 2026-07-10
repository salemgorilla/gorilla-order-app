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
  if (quantity >= 250) {
    return 3.25;
  }

  if (quantity >= 100) {
    return 4.0;
  }

  if (quantity >= 50) {
    return 4.75;
  }

  if (quantity >= 24) {
    return 6.0;
  }

  return 8.0;
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
  const extraLocationFee = Math.max(0, locationCount - 1) * 2.5;
  const extraInkFee = Math.max(0, inkColorCount - 1) * 0.65;
  const underbaseFeePerPiece = hasUnderbase ? 0.75 : 0;

  const printUnitPrice =
    basePrintPrice + extraLocationFee + extraInkFee + underbaseFeePerPiece;

  const printTotal = printUnitPrice * safeQuantity;

  const screenFeePerColorPerLocation = 25;
  const setupTotal = inkColorCount * locationCount * screenFeePerColorPerLocation;

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
