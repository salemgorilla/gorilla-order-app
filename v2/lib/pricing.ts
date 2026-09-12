// Sticker pricing — formula, not a lookup table.
//
// Supplied by Gorilla Salem 2026-08-05, RE-RATED 2026-09-11:
//
//   price per sticker = $0.34 + (area in sq in x $0.04) + ($15 / quantity)
//
// A fixed amount per sticker, an amount per square inch, and a $15 setup fee
// amortised across the run. That is why small runs cost more per sticker.
//
// ── THE PER-STICKER TERM, 2026-09-12 ──────────────────────────────────────
// Gabe: "How can we fix that $0.46 for 100 - 2x2 stickers to keep same if
// not higher profit margins to make up for less profitability at smaller
// quantity and scale of sticker?"
//
// Pure area pricing can only be right at one size. His own hand quotes
// (Boston Children's, 2025-05-15: 2x2 $0.75, 3x3 $1.00, 5x6 $1.75) are NOT
// proportional to area — a 5x6 has 7.5x the area of a 2x2 and costs 2.3x —
// because every sticker is cut, weeded and packed whatever its size. Fitted,
// those three prices are about $0.63 per sticker plus $0.038 per square
// inch. The old v1 site's table had the same shape: its 2x2 column was 83%
// of its 3x3 column, not 44%.
//
// So the unit is now $0.34 per sticker + $0.04 per square inch, calibrated
// so 100 x 3" is still exactly $85 (0.34 + 9 x 0.04 = $0.70 of stickers).
// At 100 pieces a 2x2 went from $0.46 to $0.65 each and a 5x6 from $2.48 to
// $1.69, against his $0.75 and $1.75 — both within 15%, one under and one
// over, instead of one at 61% and the other at 142%.
//
// It is also, in effect, the price floor this file has said was missing
// since it was written: a 1" sticker used to price at $0.078 of material,
// and now cannot price below $0.38 before the volume curve. 5,000 x 1"
// went from $198 to $908, which is the per-sticker term doing exactly what
// it is for.
//
// ── REBALANCED 2026-09-12: LESS ON SETUP, MORE ON THE RATE ────────────────
// Gabe: "Can we make the set up lower and the sq inch price higher? I want
// the same total but less on set up. Maybe $15 or $20." He chose $15.
//
// The rate is 70/900 — whatever makes 100 x 3" come to $70 of stickers and
// $15 of setup, which is still the $85 the whole sheet is anchored to. It is
// written as a fraction rather than 0.0778 because 0.0778 x 900 is $70.02,
// and a reference order that reads $85.02 is a reference order nobody trusts.
//
// This is not neutral, and he chose it knowing that. A flat fee and a rate
// do not move together: taking $25 out of setup and putting it into the
// square inch makes SMALL stickers and SMALL runs cheaper and big stickers
// dearer at every quantity. At 100 pieces a 2x2 went from $60 to $46 and a
// 5x6 from $190 to $248, against his own hand quotes of $75 and $175. The
// $40 was doing real work holding those; the invoice line reading lighter
// was worth more to him. STICKER_VOLUME_TIERS were re-derived so the 3"
// column is unchanged at every quantity from 100 up.
//
// ── WHY THE RE-RATE, AND WHY BOTH NUMBERS MOVED TOGETHER ──────────────────
// Lexi Sprague, GS-20260910-U38N3: 100 x 3" circles, quoted $53.80, invoiced
// and PAID $55.60 with tax. Gabe, the next morning: "The sticker quote system
// is not accurate... should be closer to $85."
//
// His own hand-quoted prices from the sent-mail archive say the same thing.
// Boston Children's Hospital, 2025-05-15, verbatim: "2x2 = $0.75 each,
// 3x3 = $1.00 each, 5x6 = $1.75 each". The app was charging $0.38, $0.54 and
// $1.21 for those — a little over half.
//
// BOTH constants are scaled by the same ~58%, and that is the whole point of
// how this was done. Gabe, 2026-09-11: "There was already a volume break with
// how the pricing went, if you aren't increasing the pricing across the
// board, those discounts should still be active."
//
// He is right, and it is easy to get wrong. The only volume break this
// formula has is the setup fee amortising — a 3" sticker costs $1.29 each at
// 25 and $0.29 each at 5,000, a 4.4x spread. Raising the MATERIAL RATE ALONE
// (or adding a flat per-sticker charge, which was the first thing tried)
// leaves the $40 where it was and crushes that spread to 2.6x: the small run
// barely moves while a 5,000-piece order more than doubles. Scaling only the
// terms that do not amortise is a price rise aimed at exactly the customers
// who were already getting the right price.
//
// Scaling BOTH terms by one factor is the only change that leaves the curve
// alone — the spread comes out at 4.48x against today's 4.40x, and every
// quantity from 25 to 5,000 rises by 56-59%. The discount is as active as it
// was; the whole sheet simply sits higher.
//
// A real quantity curve on top of that — so 5,000 pieces is not merely 200x
// the price of 25 — went in the same day, once Gabe had said a second time
// that the old discounts had to stay active. See STICKER_VOLUME_TIERS.
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

/**
 * Per square inch. $0.032 until 2026-09-11, $0.05 for a day, 70/900 for an
 * afternoon, then $0.04 once the per-sticker term below took over the part
 * of the price that was never really about area — see the header.
 */
const MATERIAL_RATE_PER_SQ_IN = 0.04;

/**
 * Per sticker, whatever its size. Cutting, weeding, packing — the part of
 * the price that a 1" sticker and a 6" sticker have in common. See the
 * header for the fit against Gabe's hand quotes that produced it.
 */
const STICKER_PER_PIECE = 0.34;

/**
 * THE VOLUME BREAK — the old site's curve, put back.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 * Gabe, 2026-09-11, twice in one morning: "There was already a volume
 * break with how the pricing went. If you are increasing the pricing
 * across the board, those discounts should still be active."
 *
 * The formula's only discount was the setup fee amortising, and that is
 * spent by about 500 pieces — from there to 5,000 the per-sticker price
 * barely moves. The v1 site (data/sticker-pricing.js at the repo root) had
 * a real quantity table, and its 3x3 column kept falling all the way up:
 *
 *   qty      50     100    250    500   1000   2500   5000
 *   each  $0.58  $0.41  $0.29  $0.23  $0.20  $0.18  $0.16
 *
 * Those are the shop's own numbers. The SHAPE of that column is what is
 * restored here; the level is re-anchored so 100 x 3" still comes to the
 * $85 the re-rate was sized to (see the header). Below 100 the setup fee
 * already discounts harder than v1 did, so the curve starts at 100.
 *
 * ── HOW THE FIGURES WERE DERIVED ─────────────────────────────────────────
 * For each v1 quantity, target = qty x $0.85 x (v1 each / v1 each at 100),
 * then keep = (target - setup) / (qty x 9 sq in x rate), rounded to two
 * places. So `keep` is what fraction of the material rate that quantity
 * pays, and the all-in totals land within 1% of the re-anchored v1 table.
 *
 * Re-derived on 2026-09-12 when setup dropped from $40 to $15 and the rate
 * rose to cover it. The tiers look steeper (down to 47% rather than 72%)
 * but the 3" totals they produce are the same ones: the discount that was
 * hidden inside a $40 fee amortising is now visible on the material line.
 * Same money, different column.
 *
 * ── INTERPOLATED, NOT STEPPED ────────────────────────────────────────────
 * A step at 250 would make 249 stickers cost MORE than 250 — the cliff
 * tests/pricing-invariants.test.ts exists to catch, and the one the seven-
 * rung table had. Linear between tiers keeps the total strictly rising
 * with quantity and the per-sticker price never rising; the invariant
 * suite sweeps every quantity from 1 to 6,000 to hold that.
 *
 * Applied to MATERIAL ONLY, per design, before the premium markup. Setup is
 * labour and does not get cheaper because the run is long; a cart of three
 * designs discounts each design on its own count, which is what actually
 * comes off the roll.
 */
export const STICKER_VOLUME_TIERS: ReadonlyArray<{ at: number; keep: number }> = [
  { at: 100, keep: 1 },
  { at: 250, keep: 0.77 },
  { at: 500, keep: 0.64 },
  { at: 1000, keep: 0.56 },
  { at: 2500, keep: 0.52 },
  { at: 5000, keep: 0.47 },
];

/** What fraction of the material rate this quantity pays. 1 below 100. */
export function stickerVolumeMultiplier(quantity: number): number {
  const qty = Math.max(1, Math.floor(quantity || 0));
  const tiers = STICKER_VOLUME_TIERS;

  if (qty <= tiers[0].at) return tiers[0].keep;

  const last = tiers[tiers.length - 1];
  if (qty >= last.at) return last.keep;

  for (let i = 1; i < tiers.length; i += 1) {
    const lo = tiers[i - 1];
    const hi = tiers[i];

    if (qty <= hi.at) {
      const t = (qty - lo.at) / (hi.at - lo.at);
      return lo.keep + (hi.keep - lo.keep) * t;
    }
  }

  return last.keep;
}

/**
 * Setup for the FIRST design in a cart.
 *
 * Was "flat setup, once per order" — that comment was true only because an
 * order could hold one design. Three designs meant three submissions and
 * therefore three full fees; the customer paid triple.
 *
 * $25 until the 2026-09-11 re-rate, $40 for a day, then $15 on 2026-09-12
 * at Gabe's request — with the difference moved into the square-inch rate
 * so the reference order still comes to $85. See the header for what that
 * trade costs at the small and large ends.
 */
export const STICKER_SETUP_FEE = 15;

/**
 * Setup for each design after the first.
 *
 * The cart is therefore a deliberate price CUT, agreed with Gabe 2026-08-05
 * to reward bigger carts, and kept at half the first-design fee through the
 * 2026-09-11 re-rate so the cut is the same proportion it always was.
 */
export const STICKER_SETUP_FEE_ADDITIONAL = 7.5;

/**
 * Setup for a whole cart. $15 + $7.50 per extra design.
 *
 * One design returns exactly STICKER_SETUP_FEE, so a single-design order
 * costs precisely what the formula in the header says — the cart cannot
 * quietly reprice the common case.
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
 * THE OLD SITE'S MODIFIERS, PUT BACK — 2026-09-12.
 *
 * Gabe, asked which of the matrix's gaps to close: "Use my hand quote for
 * what makes sense." The v1 site (data/sticker-pricing.js, repo root) is
 * his pricing, and it charged for three things this engine had been giving
 * away or guessing at:
 *
 *   shape     die-cut x1.18, oval x1.05 — contour cutting is time and waste.
 *             Kiss-cut (x1.12 there) is not a shape this app offers.
 *   finish    matte x1.05.
 *   material  chrome x1.30, holographic x1.35. This engine had both at
 *             x1.6, which was a guess ("one line to change if the shop
 *             wants it") — so chrome and holographic came DOWN here:
 *             100 x 3" chrome $127 -> $110.50.
 *
 * All three multiply the WHOLE unit — per-sticker term included — so
 * "chrome is 30% more" stays a sentence the shop can say from memory.
 * Setup is never multiplied: the labour of setting a job up does not
 * change with the substrate.
 *
 * Note what the default shape is. lib/order.ts starts every sticker order
 * as Die Cut, and the public reference pack is "100 die-cut 3" stickers",
 * so the +18% is the COMMON case: that pack is $97.60 now, $0.98 each,
 * against the $1.00 Gabe quotes 3x3 at by hand. A plain circle — Lexi's
 * order — is still $85.
 */
const SHAPE_MULTIPLIERS: Record<string, number> = {
  "Die Cut": 1.18,
  Oval: 1.05,
};

const MATERIAL_MULTIPLIERS: Record<string, number> = {
  Chrome: 1.3,
  Holographic: 1.35,
  // Removed from the catalogue 2026-08-04; kept so an old quote still
  // reprices the way it was sold.
  "Clear Vinyl": 1.15,
};

const MATTE_MULTIPLIER = 1.05;

function shapeMultiplier(shape?: string) {
  return SHAPE_MULTIPLIERS[String(shape || "").trim()] ?? 1;
}

function materialMultiplier(material: string) {
  const name = String(material || "").trim();
  const premium = MATERIAL_MULTIPLIERS[name] ?? 1;
  const matte = /matte/i.test(name) ? MATTE_MULTIPLIER : 1;

  return premium * matte;
}



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


/**
 * Shipping, tiered by what is being shipped — the old site's own tiers.
 *
 * It was a flat $12 at any quantity, so 5,000 x 6" stickers — about 1,250
 * square feet of vinyl — shipped for the same as 25 x 1". The v1 site
 * stepped it by the goods subtotal: $8 to $75, $12 to $200, $18 to $500,
 * $25 above. Those are Gabe's numbers (2026-09-12: "use my hand quote for
 * what makes sense"), so they are what this charges. Local pickup is free.
 *
 * Stepped, not sloped, deliberately: a customer reads "$18 shipping" as a
 * fact about parcels, not a function of their cart, and the steps are far
 * enough apart that no order sits on a boundary by accident.
 */
export const SHIPPING_TIERS: ReadonlyArray<{ upTo: number | null; price: number }> = [
  { upTo: 75, price: 8 },
  { upTo: 200, price: 12 },
  { upTo: 500, price: 18 },
  { upTo: null, price: 25 },
];

/** The old flat rate, which is now the $75–$200 tier. Tests read it. */
export const DECAL_SHIPPING_PRICE = 12;

export function getShippingPrice(deliveryMethod: string, goodsSubtotal = 0) {
  if (deliveryMethod !== "Ship") return 0;

  const subtotal = Math.max(0, Number(goodsSubtotal) || 0);
  const tier = SHIPPING_TIERS.find((t) => t.upTo === null || subtotal <= t.upTo);

  return tier ? tier.price : SHIPPING_TIERS[SHIPPING_TIERS.length - 1].price;
}

/**
 * Total price for the whole run.
 *
 * NOTE ON THE FLOOR: the shop's matrix said a minimum floor was "REMOVED
 * for testing", and for a month nothing reinstated one — 5,000 x 0.5" priced
 * at $65, auto-billed. The per-sticker term (STICKER_PER_PIECE, 2026-09-12)
 * is the floor in effect: no sticker prices below $0.34 of handling before
 * the volume curve, so 5,000 x 0.5" is now about $823 and 5,000 x 1" about
 * $908. Those are real prices this function will quote unattended.
 */
export function getStickerPrice(
  quantity: number,
  material: string,
  finish: string,
  size?: string,
  dims?: StickerDimensions,
  shape?: string
) {
  const total = getStickerMaterialPrice(quantity, material, size, dims, shape) +
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
  dims?: StickerDimensions,
  shape?: string
) {
  const qty = Math.max(1, Math.floor(quantity || 0));

  // EXACT, to four decimals — not rounded to the cent here. See
  // getStickerUnitMaterialPrice: the line is the unit Printavo stores times
  // the quantity, and that product can carry sub-cent digits. Rounding it
  // per line and then summing is how the website came to quote $470.56 for a
  // cart Printavo would bill at $470.57. The cart sums these exact figures
  // and rounds ONCE (quoteStickerCart), which is what Printavo does.
  return Math.round(getStickerUnitMaterialPrice(qty, material, size, dims, shape) * qty * 10000) / 10000;
}

/**
 * The per-sticker material price, quantised to FOUR decimals.
 *
 * ── WHY FOUR, AND WHY HERE ────────────────────────────────────────────────
 * Printavo stores a unit price to four decimal places and multiplies by the
 * quantity itself. It does not store a line total. So whatever this app
 * charges per sticker is only what Printavo will bill if it fits in four
 * decimals — and after the 2026-09-12 rebalance the rate is 70/900, which
 * with a tier multiplier and a premium markup produces figures like
 * 0.239555…, which Printavo turns into 0.2396 and bills 250 of at $59.90,
 * against the $59.89 this app had summed. One cent, on the flow that bills
 * with nobody watching.
 *
 * The fix is to lose the digits FIRST, in one place, so the app never
 * prices a sticker at a figure Printavo cannot store. repriceStickers writes
 * this onto each item as `lineUnitPrice` and lib/printavo.ts sends exactly
 * it, rather than dividing a rounded line total back into a unit and hoping
 * the two agree.
 *
 * ── WHAT IT COSTS ─────────────────────────────────────────────────────────
 * A sliding unit stored to four decimals steps down by 0.0001 every so
 * often, and the step is paid on every sticker in the run. Above quantity =
 * 10,000 x unit, one MORE sticker can therefore come out slightly cheaper:
 * measured worst case, 4,940 one-inch stickers cost 46 cents more than
 * 4,941. Bounded at 0.0001 x quantity, swept in tests/sticker-volume, and
 * accepted: the alternative is a stepped table, and a step at 250 moves
 * dollars. Printavo has no fifth decimal to give.
 */
export function getStickerUnitMaterialPrice(
  quantity: number,
  material: string,
  size?: string,
  dims?: StickerDimensions,
  shape?: string
) {
  const qty = Math.max(1, Math.floor(quantity || 0));
  const area = getAreaSqIn(size ?? '3"', dims);

  /**
   * NO SIZE, NO PRICE — not $0.34.
   *
   * Every guard downstream reads "priced at zero" as "could not be priced":
   * repriceStickers withholds the payment link on it, the Printavo plan
   * says "invoice by hand", the add-on strip hides the pack. Before the
   * per-sticker term existed that fell out of the arithmetic, because
   * area x rate is zero when the area is. The per-sticker term is NOT zero
   * when the area is, and the first run of the suite after adding it showed
   * a design with no dimensions pricing at $0.34 each and BILLING — a live
   * payable link for 1,000 stickers of no particular size, which is the
   * exact failure the guard was written for. So the zero is explicit now.
   */
  if (!(area > 0)) return 0;

  // Shape, finish and material all multiply the WHOLE unit — see the note
  // above SHAPE_MULTIPLIERS for why, and for what the default shape means.
  const materialPerSticker =
    (STICKER_PER_PIECE + area * MATERIAL_RATE_PER_SQ_IN) *
    stickerVolumeMultiplier(qty) *
    shapeMultiplier(shape) *
    materialMultiplier(material);

  return Number(materialPerSticker.toFixed(4));
}

/** Per-sticker price, for display. Derived, never a separate calculation. */
export function getStickerUnitPrice(
  quantity: number,
  material: string,
  finish: string,
  size?: string,
  dims?: StickerDimensions,
  shape?: string
) {
  const qty = Math.max(1, Math.floor(quantity || 0));
  return getStickerPrice(qty, material, finish, size, dims, shape) / qty;
}

/** "2 x 6 in" or '3"' — whichever the customer actually chose. */
export function describeStickerSize(size: string, dims?: StickerDimensions) {
  const w = Number(dims?.widthInches) || 0;
  const h = Number(dims?.heightInches) || 0;
  return w > 0 && h > 0 ? `${w}" x ${h}"` : size;
}

/**
 * A priced sticker cart: material, setup, shipping and the total.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The primitives below — getStickerMaterialPrice, getCartSetupFee,
 * getShippingPrice — were already shared. The COMPOSITION was not. Adding
 * them up was written twice, once in recalculateOrder (the browser, which
 * shows the customer a number) and once in repriceStickers (the server, which
 * charges it):
 *
 *   stickerPrice = round(sum of material prices)
 *   setupPrice   = getCartSetupFee(design count)
 *   shippingPrice= getShippingPrice(delivery method)
 *   total        = round(stickerPrice + setupPrice + shippingPrice)
 *
 * Identical today, line for line. Two copies of the arithmetic that decides
 * what a customer is charged is the shape this repo has been bitten by
 * repeatedly, and here the failure mode is the worst one available: the
 * browser quotes one number, the server bills another, and the only trace is
 * a "PRICE MISMATCH" line in a function log.
 *
 * ── THE ROUNDING IS PART OF THE CONTRACT ──────────────────────────────────
 * Rounded once on the material subtotal and once on the total, in that order.
 * Not cosmetic: 72.7 + 4.54 is 77.24000000000001 in binary floating point, and
 * changing WHERE the rounding happens moves cents. Both callers did it in
 * exactly this order, and that is preserved rather than tidied.
 */
export type StickerCartQuote = {
  stickerPrice: number;
  setupPrice: number;
  shippingPrice: number;
  total: number;
};

export function quoteStickerCart(input: {
  /**
   * One material price per design, already computed by
   * getStickerMaterialPrice. The setup fee counts THIS array, so a design
   * that priced at zero still counts as a design — which is correct: setup
   * is per artwork, not per dollar.
   */
  materialPrices: readonly number[];
  deliveryMethod: string;
}): StickerCartQuote {
  const stickerPrice =
    Math.round(input.materialPrices.reduce((sum, price) => sum + price, 0) * 100) /
    100;

  // $25 for the first design, $12.50 for each after. One design returns
  // exactly $25, so a single-design order prices identically to before the
  // cart existed.
  const setupPrice = getCartSetupFee(input.materialPrices.length);
  // Tiered on the goods — stickers plus setup — never on shipping itself.
  const shippingPrice = getShippingPrice(input.deliveryMethod, stickerPrice + setupPrice);

  return {
    stickerPrice,
    setupPrice,
    shippingPrice,
    total: Math.round((stickerPrice + setupPrice + shippingPrice) * 100) / 100,
  };
}
