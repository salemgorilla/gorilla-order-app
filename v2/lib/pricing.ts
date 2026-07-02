export const quantityPricing: Record<number, number> = {
  50: 57,
  100: 76,
  250: 118,
  500: 156,
  1000: 245,
  2500: 496,
  5000: 832,
};

export const materialPricing: Record<string, number> = {
  "White Vinyl": 0,
  "Clear Vinyl": 8,
  Chrome: 24,
  Holographic: 36,
};

export const finishPricing: Record<string, number> = {
  Gloss: 0,
  Matte: 6,
};

export function getStickerPrice(
  quantity: number,
  material = "White Vinyl",
  finish = "Gloss"
) {
  return (
    quantityPricing[quantity] +
    materialPricing[material] +
    finishPricing[finish]
  );
}