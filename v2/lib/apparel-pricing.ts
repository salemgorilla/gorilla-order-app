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

  const basePrintPrice = getBasePrintPrice(safeQuantity);
  const extraLocationFee =
    Math.max(0, locationCount - 1) * config.extraLocationFeePerPiece;
  const extraInkFee =
    Math.max(0, inkColorCount - 1) * config.extraInkColorFeePerPiece;
  const underbaseFeePerPiece = hasUnderbase ? config.underbaseFeePerPiece : 0;

  const printUnitPrice =
    basePrintPrice + extraLocationFee + extraInkFee + underbaseFeePerPiece;

  const printTotal = printUnitPrice * safeQuantity;

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
  };
}
