/**
 * Sales tax.
 *
 * Gorilla Salem is in Salem, Massachusetts. MA sales tax is 6.25% on tangible
 * goods.
 *
 * WHAT IS TAXED HERE — taxability follows the GOODS, not whether the flow
 * happens to take payment online. An earlier version keyed off "does this
 * flow check out", which gave the right answer for apparel by accident and
 * the wrong one for signs.
 *
 *   stickers          taxable    ordinary tangible goods
 *   signs & banners   taxable    ordinary tangible goods
 *   apparel           EXEMPT     Massachusetts exempts clothing
 *   rush scheduling   EXEMPT     labour, not goods (Gabe, 2026-09-04)
 *
 * The clothing exemption has a threshold: it applies to the first $175 per
 * item, and only the amount ABOVE $175 is taxable. Every garment this shop
 * sells is far below that, so apparel is treated as flatly exempt. If the
 * catalogue ever carries a single item over $175, this needs revisiting —
 * see APPAREL_EXEMPTION_CEILING.
 *
 * TWO MECHANICS:
 *
 * 1. Separately stated SHIPPING is not taxable in Massachusetts. Every line
 *    sent to Printavo carries an explicit `taxed` flag rather than relying on
 *    a blanket rate — see buildPrintavoQuotePlan.
 *
 * 2. Printavo computes the tax. We send the RATE on the quote and the taxable
 *    flag per line; Printavo derives salesTaxAmount and the total, and the
 *    payment request bills amountOutstanding. The app never computes a tax
 *    figure that could drift from the invoice the customer actually pays.
 */
export const SALES_TAX = {
  /** Massachusetts state rate, as a percentage. */
  ratePercent: 6.25,
  jurisdiction: "MA",
  /** Shown at the pay step so the customer sees why the total moved. */
  label: "MA sales tax (6.25%)",
} as const;

/**
 * Per-item ceiling on the Massachusetts clothing exemption. Only the amount
 * above this is taxable. Every garment in the catalogue is well under it, so
 * apparel is exempt in practice — this exists to make the assumption visible
 * rather than silent.
 */
export const APPAREL_EXEMPTION_CEILING = 175;

/**
 * Whether a product flow is taxable at all.
 *
 * Keyed on the goods, not on whether the flow takes payment — a quote should
 * show the tax the customer will actually be invoiced, whether they pay now
 * or the shop bills them later.
 */
export function isTaxableFlow(flow: "stickers" | "signs" | "apparel") {
  // Clothing is exempt in Massachusetts.
  return flow !== "apparel";
}

/**
 * Tax on a taxable subtotal, for DISPLAY ONLY.
 *
 * Printavo remains the source of truth for what is actually charged. Use this
 * to show a customer what to expect, never to decide what to bill.
 */
export function estimateSalesTax(taxableSubtotal: number) {
  return Math.round(taxableSubtotal * (SALES_TAX.ratePercent / 100) * 100) / 100;
}

/**
 * What a customer should be told they will pay.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The pre-tax figure was rendered from `pricing.total` in four separate
 * places: the sticky estimate bar, the review card, the Order Summary, and
 * the CONFIRMATION screen. Adding an estimated tax line to only one of them
 * did not fix the problem, it moved it — the customer met one number on
 * review and a different one after submitting, which for stickers is the
 * moment a payable link is issued.
 *
 * One derivation, several readers. The four surfaces are now incapable of
 * disagreeing, rather than merely agreeing today.
 * ──────────────────────────────────────────────────────────────────────────
 */
export type QuoteTotals = {
  /** What tax is charged on. Never includes shipping. */
  taxableSubtotal: number;
  /** Display-only estimate. Zero on an exempt flow. */
  estimatedTax: number;
  /** Pre-tax total plus the estimate, rounded to cents. */
  estimatedTotal: number;
  /** False on apparel, so callers can hide the row rather than print $0.00. */
  taxed: boolean;
};

/**
 * Callers pass their own taxable base because the flows genuinely differ —
 * stickers separate shipping out of `pricing`, signs have no shipping at all.
 * What must NOT differ is the exemption, the rate and the rounding, which is
 * what lives here.
 *
 * `preTaxTotal` is whatever the surface was already showing, so this can only
 * ever add tax to it — it can never restate the price itself.
 */
export function getQuoteTotals(input: {
  flow: "stickers" | "signs" | "apparel";
  /** Goods and fees. Separately stated shipping is not taxable in MA. */
  taxableSubtotal: number;
  /** The figure shown today, shipping included. */
  preTaxTotal: number;
}): QuoteTotals {
  const taxed = isTaxableFlow(input.flow);
  const estimatedTax = taxed ? estimateSalesTax(input.taxableSubtotal) : 0;

  return {
    taxableSubtotal: input.taxableSubtotal,
    estimatedTax,
    // Rounded because 72.7 + 4.54 is 77.24000000000001 in binary floating
    // point, and a money value should not carry dust it might pass on.
    estimatedTotal: Math.round((input.preTaxTotal + estimatedTax) * 100) / 100,
    taxed,
  };
}

/**
 * The sticker flow's totals, derived once.
 *
 * Shipping is excluded from the base deliberately: buildPrintavoQuotePlan
 * sends the shipping line with `taxed: false` while goods AND fee lines carry
 * `taxed: salesTaxRate !== null`. Setup is a fee line, so it IS taxed —
 * leaving it out would under-report by $2.34 on the reference order.
 */
export function getStickerTotals(pricing: {
  stickerPrice: number;
  setupPrice: number;
  total: number;
}): QuoteTotals {
  return getQuoteTotals({
    flow: "stickers",
    taxableSubtotal: pricing.stickerPrice + pricing.setupPrice,
    preTaxTotal: pricing.total,
  });
}

/**
 * The signs flow's totals.
 *
 * Signs carry no shipping component at all — `calculateSignsPricing` returns a
 * total that is entirely goods and fees — so the whole total is taxable and
 * the base and the pre-tax total are the same number.
 */
export function getSignsTotals(pricing: {
  total: number;
  /**
   * Rush scheduling (lib/rush.ts). NOT taxable: it buys LABOUR — the shop
   * rearranging its schedule — not goods, and Massachusetts does not tax
   * separately stated labour. Gabe's call, 2026-09-04.
   *
   * It stays in preTaxTotal (the customer does pay it) and comes out of
   * the taxable base — the same treatment separately stated shipping
   * already gets. The Printavo line carries taxed:false so the invoice
   * agrees with the estimate rather than merely resembling it.
   */
  rushFee?: number;
}): QuoteTotals {
  const rushFee = Math.max(0, Number(pricing.rushFee) || 0);

  return getQuoteTotals({
    flow: "signs",
    taxableSubtotal: Math.max(
      0,
      Math.round((pricing.total - rushFee) * 100) / 100
    ),
    preTaxTotal: pricing.total,
  });
}
