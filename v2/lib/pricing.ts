const baseStickerPrices: Record<number, number> = {
  50: 65,
  100: 89,
  250: 118,
  500: 156,
  1000: 278,
  2500: 760,
  5000: 1541,
};

function getMaterialMultiplier(material: string) {
  if (material === "Clear Vinyl") {
    return 1.15;
  }

  if (material === "Holographic") {
    return 1.35;
  }

  if (material === "Chrome") {
    return 1.3;
  }

  return 1;
}

function getFinishMultiplier(finish: string) {
  // White vinyl finish is now selected as the decal type:
  // Gloss White Vinyl or Matte White Vinyl.
  // Kept for compatibility with older order data.
  return 1;
}

// Flat shipping for mailed decal orders. Local pickup is free.
export const DECAL_SHIPPING_PRICE = 12;

export function getShippingPrice(deliveryMethod: string) {
  return deliveryMethod === "Ship" ? DECAL_SHIPPING_PRICE : 0;
}

export function getStickerPrice(
  quantity: number,
  material: string,
  finish: string
) {
  const basePrice = baseStickerPrices[quantity] || baseStickerPrices[100];
  const materialMultiplier = getMaterialMultiplier(material);
  const finishMultiplier = getFinishMultiplier(finish);

  return Math.round(basePrice * materialMultiplier * finishMultiplier);
}
