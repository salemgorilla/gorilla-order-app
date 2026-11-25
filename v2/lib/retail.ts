/**
 * THE RETAIL PRICE BOOK — Gabe's cash-discount decision, 2026-11-11.
 *
 *   "We will not charge 3%, we will increase our retail price by 3% and
 *    discount those who pay via ACH."
 *
 * Every price this app shows or bills is RETAIL: the shop's old price plus 3%.
 * A customer who pays by card pays retail. A customer who pays by bank
 * transfer (ACH) is refunded the 3% afterwards (Gabe chose option "A": retail
 * everywhere, refund after an ACH payment). There is NO card fee, surcharge or
 * checkout add-on under any name — Massachusetts bans card surcharges and
 * allows a discount for cash, so "retail, discounted for bank transfer" is the
 * only legal shape (M.G.L. c.140D s.28A). Do not reintroduce a fee.
 *
 * ── HOW IT IS APPLIED ─────────────────────────────────────────────────────
 * AT THE SOURCE, not on the way out. Each rate, fee and floor is a retail
 * number the moment it is defined (`retail2` for dollars-and-cents figures,
 * `retail4` for a per-piece unit, which Printavo stores to four decimals).
 * Everything downstream — the sticky bar, the review card, the confirmation
 * screen, the email, the Printavo lines, the tax, the deposit ceiling — then
 * reads retail without a single change, and the invoice lines always sum to
 * the figure on the screen because they are the same numbers.
 *
 * PERCENTAGES need nothing: a rush fee of 25% of retail goods is 25% of the
 * right number, and a discount code takes its percent off retail.
 *
 * THRESHOLDS are the one thing that must NOT inflate. A shipping tier that
 * changes at $75 of goods means $75 of the old price book; with every figure
 * 3% higher, customers would reach each tier early. `engineTerms()` converts a
 * retail subtotal back before it is compared with a threshold. The one
 * deliberate exception is FULL_PAYMENT_CEILING, which Gabe set against "the
 * amount charged (incl. tax)" — and that is retail.
 *
 * ── TAX ───────────────────────────────────────────────────────────────────
 * Sales tax is on the RETAIL price, always (Gabe, 2026-11-11). An ACH payer is
 * refunded the 3% of the pre-tax price only; the tax they paid stays paid, on
 * the retail figure it was invoiced on.
 *
 * ── THE ACH REFUND ────────────────────────────────────────────────────────
 * "Undo the 3% exactly": retail $1,030.00 -> refund $30.00; retail $327.13 ->
 * refund $9.53 (the shop's own old price, $317.60). It is 3/103 of the
 * pre-tax retail price, rounded to the cent, and it is written onto the quote
 * so the person issuing the refund never works it out by hand.
 */

/** The uplift. One number, one place. */
export const RETAIL_UPLIFT = 0.03;

export const RETAIL_MULTIPLIER = 1 + RETAIL_UPLIFT;

/** Round to cents. The nudge keeps 7.725 (which binary stores as 7.72499…) on 7.73. */
export function cents(n: number): number {
  return Math.round(n * 100 + 1e-7) / 100;
}

/** An engine dollar figure -> the retail dollar figure, to the cent. */
export function retail2(engine: number): number {
  return cents(engine * RETAIL_MULTIPLIER);
}

/**
 * An engine per-piece unit -> the retail unit, to FOUR decimals. Printavo
 * stores a unit price to four places and multiplies by the quantity itself, so
 * the unit has to be a figure it can hold (see getStickerUnitMaterialPrice).
 */
export function retail4(engine: number): number {
  return Math.round(engine * RETAIL_MULTIPLIER * 10000 + 1e-7) / 10000;
}

/**
 * A RETAIL pre-tax subtotal expressed in the old price book, for comparing
 * with a threshold that was set against the old prices (shipping tiers).
 */
export function engineTerms(retail: number): number {
  return cents(retail / RETAIL_MULTIPLIER);
}

/**
 * What a bank-transfer (ACH) customer is refunded: the 3% inside the retail
 * pre-tax price. Zero for anything that is not a positive amount.
 */
export function achRefund(retailPreTax: number): number {
  const retail = Number(retailPreTax);
  if (!Number.isFinite(retail) || !(retail > 0)) return 0;

  return cents(retail - retail / RETAIL_MULTIPLIER);
}

/** The price an ACH customer ends up paying, before tax: retail less the refund. */
export function achPrice(retailPreTax: number): number {
  return cents(Number(retailPreTax) - achRefund(retailPreTax));
}
