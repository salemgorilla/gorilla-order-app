/**
 * Sales tax.
 *
 * Gorilla Salem is in Salem, Massachusetts. Massachusetts sales tax is 6.25%
 * on tangible goods, which stickers are.
 *
 * TWO RULES that matter for how this is applied:
 *
 * 1. Separately stated SHIPPING is not taxable in Massachusetts. Every line
 *    sent to Printavo therefore carries an explicit `taxed` flag rather than
 *    relying on a blanket rate — see buildPrintavoQuotePlan.
 *
 * 2. Printavo computes the tax. We send the RATE on the quote and the taxable
 *    flag per line; Printavo derives salesTaxAmount and the total, and the
 *    payment request bills amountOutstanding. The app never computes a tax
 *    figure that could drift from the invoice the customer actually pays.
 *
 * Quoting untaxed is fine. CHARGING untaxed is a liability — the shop owes it
 * whether or not it was collected. So this only comes into play on the flows
 * that take money.
 */
export const SALES_TAX = {
  /** Massachusetts state rate, as a percentage. */
  ratePercent: 6.25,
  jurisdiction: "MA",
  /** Shown at the pay step so the customer sees why the total moved. */
  label: "MA sales tax (6.25%)",
} as const;

/**
 * Tax on a taxable subtotal, for DISPLAY ONLY.
 *
 * Printavo remains the source of truth for what is actually charged. Use this
 * to show a customer what to expect, never to decide what to bill.
 */
export function estimateSalesTax(taxableSubtotal: number) {
  return Math.round(taxableSubtotal * (SALES_TAX.ratePercent / 100) * 100) / 100;
}
