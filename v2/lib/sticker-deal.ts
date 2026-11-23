/**
 * BLACK FRIDAY STICKER DEAL: 50 stickers for $25.
 *
 * Gabe, 2026-11-23: "one of the deals will be 50 stickers for $25" / "And
 * the stickers can be up to three inches in size." / "Build the prices in".
 *
 * Stickers self-check-out: a submitted sticker quote raises a payment link
 * with nobody in the loop. So this deal is priced in ONE place, read by the
 * browser (app/page.tsx recalculateOrder) and by the server's repricing
 * (lib/sticker-repricing.ts), and the server refuses an order that claims
 * the deal without fitting it (app/api/quote). The browser is never the
 * authority on whether a payload gets $25.
 *
 * THE DEAL, as built:
 *   - exactly 50 stickers, ONE design
 *   - any shape, any size up to 3" wide and 3" tall
 *   - Gloss White Vinyl only (the app's default stock)
 *   - $25.00 flat for the stickers, setup included, no order minimum
 *   - no discount code on top
 *   - shipping and MA sales tax exactly as on any sticker order
 *
 * Change the numbers here and nowhere else. tests/sticker-deal.test.ts pins
 * them, and that $25.00 lands on the invoice as 50 x $0.50, which divides
 * evenly.
 */
export const STICKER_DEAL = {
  /** Stored on the order, read by the server. */
  id: "stickers-50-25",
  name: "50 Stickers for $25",
  quantity: 50,
  price: 25,
  maxInches: 3,
  material: "Gloss White Vinyl",
} as const;

/** The per-sticker price Printavo stores: 25 / 50, exact. */
export const STICKER_DEAL_UNIT = STICKER_DEAL.price / STICKER_DEAL.quantity;

export function isStickerDeal(value: unknown): boolean {
  return value === STICKER_DEAL.id;
}

type DealItem = {
  quantity?: unknown;
  widthInches?: unknown;
  heightInches?: unknown;
  material?: unknown;
};

/**
 * Why an order does not fit the deal, in words for the customer, or null
 * when it fits. The same function the form and the server ask.
 */
export function stickerDealProblem(items: readonly DealItem[]): string | null {
  if (items.length !== 1) {
    return `The ${STICKER_DEAL.name} deal is one design. Remove the extra designs or switch to a regular quote.`;
  }
  const item = items[0];
  if (Number(item.quantity) !== STICKER_DEAL.quantity) {
    return `The deal is exactly ${STICKER_DEAL.quantity} stickers.`;
  }
  const w = Number(item.widthInches);
  const h = Number(item.heightInches);
  if (!(w > 0 && h > 0) || w > STICKER_DEAL.maxInches || h > STICKER_DEAL.maxInches) {
    return `The deal covers stickers up to ${STICKER_DEAL.maxInches}" wide and ${STICKER_DEAL.maxInches}" tall.`;
  }
  if (String(item.material ?? "") !== STICKER_DEAL.material) {
    return `The deal is printed on ${STICKER_DEAL.material}.`;
  }
  return null;
}

/** The line the shop reads beside the figure. */
export function stickerDealNote(): string {
  return `Black Friday deal, ${STICKER_DEAL.name}: ${STICKER_DEAL.quantity} stickers up to ${STICKER_DEAL.maxInches}" on ${STICKER_DEAL.material}, $${STICKER_DEAL.price.toFixed(2)} flat, setup included, no minimum, no discount code.`;
}
