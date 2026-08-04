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
  // Clear Vinyl is no longer offered (removed from catalog.ts 2026-08-04), but
  // its multiplier stays so an existing Printavo quote that names it still
  // reprices to the same number it was originally quoted at.
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

/** The quantity breaks, ascending. Derived so the two can never drift. */
const STICKER_TIERS = Object.keys(baseStickerPrices)
  .map(Number)
  .sort((a, b) => a - b);

/** Smallest order the table prices. Anything under this pays this. */
export const STICKER_MIN_QUANTITY = STICKER_TIERS[0];

/**
 * Base price for ANY quantity, including ones off the tier table.
 *
 * This used to be `baseStickerPrices[quantity] || baseStickerPrices[100]` — an
 * exact-match lookup with a silent fallback. Fine while the UI only offered
 * the seven tiers, but with an open quantity field it would have charged the
 * 100-sticker price for 137, 400, or 900. With self-checkout on, that
 * under-charge would go straight through to a real payment.
 *
 * Rules, in order:
 *   exact tier      the table price, unchanged — existing quotes must not move
 *   below the min   the minimum-order price (there is no break below 50)
 *   between tiers   the lower tier's per-sticker rate x quantity
 *   above the max   extrapolated at the top tier's per-sticker rate
 *
 * Confirmed by Gabe 2026-08-04: you pay the RATE of the break below, with no
 * cap. A consequence worth knowing — because the breaks are steep, a quantity
 * just under a break can cost more than the break itself. 137 prices at
 * $121.93 while 250 costs $118. That is intended: it is the same rule the
 * shop quotes by hand, and it nudges customers up to the next break.
 */
function getBaseStickerPrice(quantity: number) {
  const qty = Math.max(1, Math.floor(quantity || 0));

  const exact = baseStickerPrices[qty];
  if (exact !== undefined) return exact;

  const min = STICKER_TIERS[0];
  const max = STICKER_TIERS[STICKER_TIERS.length - 1];

  if (qty <= min) return baseStickerPrices[min];
  if (qty >= max) return (baseStickerPrices[max] / max) * qty;

  // The highest break at or below this quantity.
  let lower = min;
  for (const tier of STICKER_TIERS) {
    if (tier <= qty) lower = tier;
  }

  return (baseStickerPrices[lower] / lower) * qty;
}

export function getStickerPrice(
  quantity: number,
  material: string,
  finish: string
) {
  const basePrice = getBaseStickerPrice(quantity);
  const materialMultiplier = getMaterialMultiplier(material);
  const finishMultiplier = getFinishMultiplier(finish);

  return Math.round(basePrice * materialMultiplier * finishMultiplier);
}
