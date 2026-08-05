/**
 * Sticker price breaks — TOTAL price at 3", the reference size.
 *
 * Rebuilt 2026-08-04 against a benchmark of verified national prices for 3"
 * die-cut white vinyl (Sticker Mule, StickerGiant, StickerApp, Vistaprint,
 * UPrinting, PrintRunner, Sticker Ninja, CustomStickers).
 *
 * WHAT CHANGED AND WHY:
 *
 * Re-centred on how Gorilla actually sells. Real orders are 100, 200 and 500;
 * 1000+ is rare. The old ladder had three of its seven rungs at 1000/2500/5000
 * and no rung at 200 or 300 at all.
 *
 *   50    $65 -> $55    was +16% over market median, 7th cheapest of 9
 *   100   $89 -> $70    was +11% over median and the most exposed rung in the
 *                       catalogue; a verified competitor lists 100 at $46.99
 *   200   NEW $110      previously fell into the custom-quantity rule and
 *                       priced at $178 - more than the 250 rung cost
 *   300   NEW $144
 *   500   $156 -> $160  barely moved: at $0.312/ea this was already 2nd
 *                       cheapest of nine nationals. It was winning.
 *   1000  $278 unchanged
 *   2500  $760 -> $600  the old curve went UP per sticker above 1000
 *   5000  $1541 -> $1100  ...and up again. No benchmarked vendor does this;
 *                       all seven checked are strictly monotonic. At the old
 *                       rate the shop charged more per sticker than it would
 *                       cost to buy the job from a retail vendor and resell it.
 *
 * The 250 rung is retired in favour of 200 and 300, which match real orders.
 *
 * These totals are a PROPOSAL built from market position, not from Gorilla's
 * own cost data - which the shop has not supplied. Sanity-check 100 and 500
 * against actual cost before treating them as final.
 */
const baseStickerPrices: Record<number, number> = {
  50: 55,
  100: 70,
  200: 110,
  300: 144,
  500: 160,
  1000: 278,
  2500: 600,
  5000: 1100,
};

/**
 * Size multiplier, against 3" as the reference.
 *
 * Price did not vary by size at all before this — a 6" cost the same as a 2",
 * which is why a custom size field could not safely be offered. Benchmarked
 * nationals vary roughly 1.6x across their size range.
 *
 * Deliberately NOT pure area (a 6" is 4x the area of a 3"): setup, artwork,
 * proofing and handling are per-job, not per-square-inch, so material is the
 * only input that scales with area. These are dampened accordingly.
 *
 * PROPOSAL, same caveat as the ladder above — easy to retune, one line each.
 */
const sizeMultipliers: Record<string, number> = {
  '2"': 0.75,
  '3"': 1.0, // reference
  '4"': 1.35,
  '5"': 1.75,
  '6"': 2.2,
};

/** Falls back to the 3" reference for an unlisted or custom size. */
function getSizeMultiplier(size: string) {
  return sizeMultipliers[String(size).trim()] ?? 1;
}

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
  finish: string,
  /** Optional so existing callers keep compiling; absent = the 3" reference. */
  size?: string
) {
  const basePrice = getBaseStickerPrice(quantity);
  const materialMultiplier = getMaterialMultiplier(material);
  const finishMultiplier = getFinishMultiplier(finish);
  const sizeMultiplier = getSizeMultiplier(size ?? '3"');

  return Math.round(
    basePrice * materialMultiplier * finishMultiplier * sizeMultiplier
  );
}
