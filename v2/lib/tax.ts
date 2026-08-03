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
