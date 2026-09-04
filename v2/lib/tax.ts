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
 *   ALL FEE LINES     EXEMPT     labour and services, not goods
 *                                (Gabe, 2026-09-04)
 *
 * A FEE is anything the quote states separately from the goods and bills
 * under its own line: setup / screens, banner finishing add-ons, rush
 * scheduling, and shipping. Gabe's ruling, generalised from rush the same
 * day: the shop sells labour separately and Massachusetts does not tax
 * separately stated labour, so no fee line carries tax on either the
 * estimate or the invoice.
 *
 * ONE CAVEAT, WRITTEN DOWN FOR THE ACCOUNTANT rather than decided here:
 * Massachusetts distinguishes services from FABRICATION — labour that
 * becomes part of the finished article. Screens and rush are clearly
 * service. A pole pocket sewn into a banner is arguably fabrication and
 * therefore arguably taxable. The rule above applies to every fee line
 * uniformly, which is the instruction; if the shop's accountant wants
 * finishing add-ons taxed, the one place to change it is the `taxed` flag
 * on the add-on lines in buildPrintavoQuotePlan plus signsFeeTotal below,
 * and the estimate follows automatically.
 *
 * The clothing exemption has a threshold: it applies to the first $175 per
 * item, and only the amount ABOVE $175 is taxable. Every garment this shop
 * sells is far below that, so apparel is treated as flatly exempt. If the
 * catalogue ever carries a single item over $175, this needs revisiting —
 * see APPAREL_EXEMPTION_CEILING.
 *
 * TWO MECHANICS:
 *
 * 1. Every line sent to Printavo carries an explicit `taxed` flag rather than
 *    relying on a blanket rate — see buildPrintavoQuotePlan, where the flag is
 *    REQUIRED on fee lines so a new charge cannot be added without someone
 *    deciding. Shipping has always been sent untaxed; as of 2026-09-04 so is
 *    every other fee.
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
 * The base is the DECALS and nothing else. Setup and shipping are both fee
 * lines, both sent to Printavo with `taxed: false`, and both therefore out of
 * the base here.
 *
 * Setup used to be in it, with a comment arguing that leaving it out would
 * under-report by $2.34 on the reference order. That was right under the old
 * ruling and is wrong under this one — all fees are untaxed (Gabe,
 * 2026-09-04). Stickers AUTO-BILL, so this figure is not decoration: the
 * customer pays the Printavo invoice, and the estimate and the invoice have
 * to derive the exemption the same way. Both moved in this change.
 */
export function getStickerTotals(pricing: {
  stickerPrice: number;
  setupPrice: number;
  total: number;
}): QuoteTotals {
  return getQuoteTotals({
    flow: "stickers",
    // Decals only. `setupPrice` stays in the signature because callers pass
    // the whole pricing object, and deleting it here would silently start
    // accepting objects that have no setup at all.
    taxableSubtotal: pricing.stickerPrice,
    preTaxTotal: pricing.total,
  });
}

/**
 * The signs flow's totals.
 *
 * Signs carry no shipping component at all — the total is goods plus fees —
 * so the base is the total with the fees taken back out.
 *
 * `feeTotal` is REQUIRED rather than optional on purpose. Four surfaces show
 * this figure (the sticky bar, the summary card, the review card and the
 * confirmation screen) and two of them are handed a bare total rather than
 * the pricing object. An optional field lets one of those four forget, and
 * the customer then meets a different tax on review than on the screen they
 * screenshotted. The type makes forgetting a build error instead.
 *
 * Use signsFeeTotal(lines) to derive it — one definition of what a fee is,
 * shared with the invoice.
 */
export function getSignsTotals(pricing: {
  total: number;
  /**
   * Setup, finishing add-ons and rush — everything the quote states
   * separately from the goods. Not taxable: labour and services, not goods
   * (Gabe, 2026-09-04). It stays in preTaxTotal, because the customer does
   * pay it; it comes out of the taxable base, because Printavo bills those
   * lines with `taxed: false`.
   */
  feeTotal: number;
}): QuoteTotals {
  const feeTotal = Math.max(0, Number(pricing.feeTotal) || 0);

  return getQuoteTotals({
    flow: "signs",
    taxableSubtotal: Math.max(
      0,
      Math.round((pricing.total - feeTotal) * 100) / 100
    ),
    preTaxTotal: pricing.total,
  });
}
