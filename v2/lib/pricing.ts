// Sticker pricing — formula, not a lookup table.
//
// Supplied by Gorilla Salem 2026-08-05:
//
//   price per sticker = (area in sq in x $0.032) + ($25 / quantity)
//
// Material is area-based, and one flat $25 setup fee is amortised across the
// order. That is why small runs cost more per sticker.
//
// This replaces the old seven-rung table and its material multipliers. Three
// things fall out of it for free that the table could never do:
//
//   - ANY quantity prices correctly, so the custom quantity field needs no
//     special "rate of the break below" rule
//   - ANY size prices correctly, which unblocks a custom size field
//   - the per-sticker curve is ALWAYS monotonic, because material is constant
//     and setup only ever amortises further. The old table went UP per
//     sticker above 1000; that class of bug is now impossible.
//
// Matte and gloss cost the same. Shape does not change price — area is taken
// as the bounding box (size x size), matching the shop's own reference matrix.

/** Material cost per square inch. */
const MATERIAL_RATE_PER_SQ_IN = 0.032;

/** Flat setup, once per order, amortised across the quantity. */
export const STICKER_SETUP_FEE = 25;

/**
 * Chrome and holographic: 60% markup over standard vinyl.
 *
 * Applied to the MATERIAL portion only, not the setup fee — the setup labour
 * is identical whichever substrate goes on the machine. On 100 x 3" that is
 * $71 rather than the $86 a markup on the whole price would give. One line to
 * change if the shop wants it on the total instead.
 */
const PREMIUM_MATERIAL_MARKUP = 1.6;
const PREMIUM_MATERIALS = ["Chrome", "Holographic"];

/** '3"' -> 3. Handles plain numbers and stray quotes. */
export function parseStickerSizeInches(size: string | number) {
  if (typeof size === "number") return size;
  const match = String(size || "").match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

/**
 * Area in square inches, taken as the bounding box.
 *
 * The shop's matrix assumes a square sticker and says to use the bounding box
 * for irregular shapes, so a circle is priced on the square it is cut from —
 * which is also what actually gets consumed off the roll.
 */
function getAreaSqIn(size: string | number) {
  const inches = parseStickerSizeInches(size);
  return inches > 0 ? inches * inches : 0;
}

function isPremiumMaterial(material: string) {
  return PREMIUM_MATERIALS.includes(String(material).trim());
}

// Flat shipping for mailed decal orders. Local pickup is free.
export const DECAL_SHIPPING_PRICE = 12;

export function getShippingPrice(deliveryMethod: string) {
  return deliveryMethod === "Ship" ? DECAL_SHIPPING_PRICE : 0;
}

/**
 * Total price for the whole run.
 *
 * NOTE ON THE MISSING FLOOR: the shop's matrix says a minimum floor is
 * "REMOVED for testing". Nothing here reinstates one, so small sizes at high
 * quantities go very low — 5,000 x 1" comes to about $185, and 5,000 x 0.5"
 * to about $65. Those are real prices this function will quote, and with
 * sticker self-checkout enabled they would be charged automatically.
 */
export function getStickerPrice(
  quantity: number,
  material: string,
  finish: string,
  size?: string
) {
  const qty = Math.max(1, Math.floor(quantity || 0));
  const area = getAreaSqIn(size ?? '3"');

  const materialPerSticker =
    area * MATERIAL_RATE_PER_SQ_IN *
    (isPremiumMaterial(material) ? PREMIUM_MATERIAL_MARKUP : 1);

  const total = materialPerSticker * qty + STICKER_SETUP_FEE;

  return Math.round(total * 100) / 100;
}

/** Per-sticker price, for display. Derived, never a separate calculation. */
export function getStickerUnitPrice(
  quantity: number,
  material: string,
  finish: string,
  size?: string
) {
  const qty = Math.max(1, Math.floor(quantity || 0));
  return getStickerPrice(qty, material, finish, size) / qty;
}
