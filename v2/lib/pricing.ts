// Sticker pricing — formula, not a lookup table.
//
// Supplied by Gorilla Salem 2026-08-05:
//
//   price per sticker = (area in sq in x $0.032) + ($25 / quantity)
//
// Material is area-based, and a $25 setup fee is amortised across the run.
// That is why small runs cost more per sticker.
//
// Setup is per DESIGN, not per order — $25 for the first, $12.50 for each
// after (getCartSetupFee). It reads as "once per order" only because an order
// could hold a single design; three designs meant three submissions and three
// full fees.
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

/**
 * Setup for the FIRST design in a cart.
 *
 * Was "flat setup, once per order" — that comment was true only because an
 * order could hold one design. Three designs meant three submissions and
 * therefore three $25 fees; the customer paid $75.
 */
export const STICKER_SETUP_FEE = 25;

/**
 * Setup for each design after the first.
 *
 * The cart is therefore a deliberate price CUT, agreed with Gabe 2026-08-05 to
 * reward bigger carts. On 3 x 100 x 3" shipped: $197.40 as three separate
 * orders today, $173.40 at $25 per design, $148.40 as agreed.
 */
export const STICKER_SETUP_FEE_ADDITIONAL = 12.5;

/**
 * Setup for a whole cart. $25 + $12.50 per extra design.
 *
 * One design returns exactly $25, so a single-design order costs precisely
 * what it costs today — the cart cannot quietly reprice the common case.
 */
export function getCartSetupFee(designCount: number) {
  const designs = Math.max(1, Math.floor(designCount || 0));

  return (
    Math.round(
      (STICKER_SETUP_FEE + STICKER_SETUP_FEE_ADDITIONAL * (designs - 1)) * 100
    ) / 100
  );
}

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
 * Every number in a size label, in order.
 *
 * A label is not always one number. describeStickerSize writes '2" x 6"' for
 * a rectangular sticker, and parseStickerSizeInches — which takes the FIRST
 * match — read that as 2, so the fallback priced a 2x6 as a 2x2. Twelve
 * square inches billed as four: $12.80 per hundred instead of $38.40.
 *
 * Only reachable when the real dimensions are missing, which is exactly when
 * the label is the only thing left to price from, so getting it wrong there
 * is getting it wrong in the one case it exists for.
 */
function parseSizeNumbers(size: string | number): number[] {
  if (typeof size === "number") return size > 0 ? [size] : [];

  return (String(size || "").match(/[\d.]+/g) || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Real dimensions, when the customer has entered them. */
export type StickerDimensions = {
  widthInches: number;
  heightInches: number;
};

/**
 * Area in square inches, taken as the bounding box.
 *
 * Real width x height when supplied; otherwise the preset size treated as a
 * square. The shop's matrix says to use the bounding box for irregular
 * shapes, so a circle is priced on the square it is cut from — which is also
 * what actually comes off the roll.
 */
function getAreaSqIn(size: string | number, dims?: StickerDimensions) {
  const w = Number(dims?.widthInches) || 0;
  const h = Number(dims?.heightInches) || 0;
  if (w > 0 && h > 0) return w * h;

  // Two numbers is a width and a height; one is a preset, which is square.
  const numbers = parseSizeNumbers(size);
  if (numbers.length >= 2) return numbers[0] * numbers[1];

  const inches = numbers[0] || 0;
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
  size?: string,
  dims?: StickerDimensions
) {
  const total = getStickerMaterialPrice(quantity, material, size, dims) +
    STICKER_SETUP_FEE;

  return Math.round(total * 100) / 100;
}

/**
 * Material only, for ONE design. No setup.
 *
 * The cart charges setup once per cart (getCartSetupFee), not once per design,
 * so per-design cost has to be available without it. getStickerPrice above is
 * this plus a single setup fee, which is exactly a one-design cart — kept so
 * the server's repriceStickers and any single-design caller are unchanged.
 */
export function getStickerMaterialPrice(
  quantity: number,
  material: string,
  size?: string,
  dims?: StickerDimensions
) {
  const qty = Math.max(1, Math.floor(quantity || 0));
  const area = getAreaSqIn(size ?? '3"', dims);

  const materialPerSticker =
    area * MATERIAL_RATE_PER_SQ_IN *
    (isPremiumMaterial(material) ? PREMIUM_MATERIAL_MARKUP : 1);

  return Math.round(materialPerSticker * qty * 100) / 100;
}

/** Per-sticker price, for display. Derived, never a separate calculation. */
export function getStickerUnitPrice(
  quantity: number,
  material: string,
  finish: string,
  size?: string,
  dims?: StickerDimensions
) {
  const qty = Math.max(1, Math.floor(quantity || 0));
  return getStickerPrice(qty, material, finish, size, dims) / qty;
}

/** "2 x 6 in" or '3"' — whichever the customer actually chose. */
export function describeStickerSize(size: string, dims?: StickerDimensions) {
  const w = Number(dims?.widthInches) || 0;
  const h = Number(dims?.heightInches) || 0;
  return w > 0 && h > 0 ? `${w}" x ${h}"` : size;
}
