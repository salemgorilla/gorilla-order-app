---
name: cash-discount-pricing
description: Gabe's cash-discount pricing strategy (decided 2026-11-11) and how to bring it into the Gorilla order app - retail prices go up 3% to cover card costs, customers paying by bank transfer (ACH) get that 3% back, and there is never a card fee or surcharge. Use whenever a change touches prices, fees, payment methods, payment links, deposits or checkout copy in this repo, or when someone asks about a "card fee", "3%", "ACH discount" or "cash discount".
---

# Cash-discount pricing

## The decision (Gabe, 2026-11-11)

> "We will not charge 3%, we will increase our retail price by 3% and
> discount those who pay via ACH."

Then, asked to settle the details:

- **ACH discount = undo the 3% exactly.** A job priced at $1,000 lists at
  $1,030. Card pays $1,030. Bank transfer (ACH) pays $1,000.
- **No $20 ACH fee.** Dropped the same day.
- **No card fee, ever.** Nothing is added at checkout for paying by card.

Why it has to be this shape: Massachusetts has banned **surcharges** on credit
card payments (M.G.L. c.140D s.28A) but allows a **discount for cash**. "Retail
price, discounted for bank transfer" is the allowed form; "base price plus a
card fee" is not, whatever the fee is called. Renaming a card fee does not make
it a discount. Do not reintroduce a fee added at checkout, under any name.

## The rules, exactly

| Term | Definition |
| --- | --- |
| Engine price | What the pricing engine computes today, unchanged. |
| Retail price | `round2(engine * 1.03)`. This is THE price: shown on every quote, every summary, every Printavo line, every email. Card payers pay this. |
| ACH price | The engine price, exactly. Shown as a discount from retail: "Pay by bank transfer and save $X". |
| Deposit rule | Unchanged in meaning: over `FULL_PAYMENT_CEILING` ($4,999.99), i.e. $5,000.00 or more, take `DEPOSIT_FRACTION` (50%) first. Judge it on the **retail** price. |
| Fees | None for payment method. Existing non-payment fees (setup, shipping, rush) are part of the price and get the same 3% uplift as goods, so the ACH price is the old total exactly. |

Worked example: engine $317.60 -> retail $327.13 -> ACH $317.60 (save $9.53).

Round once, at the order total: `retail = round2(engine * 1.03)`. If you
show line items at retail, scale each and let the last line absorb the
rounding, so the lines always sum to the retail total to the cent.

## A working reference: Apeparel

The standalone Apeparel app (`salemgorilla/ApeParrel`) shipped this on
2026-11-11, verified live. Read, do not copy blindly:

- `lib/money.ts` - `RETAIL_UPLIFT`, `orderPrices()`, `optionFor()`,
  `nextPaymentOptions()`. Every customer-facing amount comes from here.
- `lib/quote.ts` - `priceQuote()` scales the line items to retail.
- `tests/money.test.ts` - the rules as tests, including "no option ever
  charges more than retail" and "card is never discounted".

The core is small:

```ts
export const RETAIL_UPLIFT = 0.03;
export function orderPrices(engineTotal: number) {
  return { retail: round2(engineTotal * (1 + RETAIL_UPLIFT)), ach: round2(engineTotal) };
}
// card pays retail; ach pays the ach price; the difference is the discount
```

## Bringing it into THIS app - what is different here

Apeparel takes payment on Stripe, where the app knows the method before it
sets the amount. **This app mostly does not.** Read `v2/AGENTS.md` ("The one
that matters most") and `v2/lib/auto-bill.ts` before touching anything.

1. **Stickers, signs and banners auto-bill through a Printavo payment
   request.** The customer chooses card or bank on Printavo's page, AFTER the
   amount is set, and the deposit is a fraction of Printavo's own
   `amountOutstanding`. So "card pays retail, ACH pays less" cannot be
   expressed by one payment link. This is a decision for Gabe, not for you.
   Bring him these options with a recommendation:
   - **A. Retail everywhere; refund the 3% after an ACH payment.** Simplest
     code, a manual or scripted refund step per ACH order.
   - **B. Retail on the invoice, plus a "Pay by bank transfer" option that
     raises the payment request at the ACH price** (`createPaymentRequest`
     takes an `amount`). Needs a guard so a customer cannot pay both links,
     and breaks the standing rule that the app never bills a figure it
     computed itself - which only Gabe can relax.
   - **C. Move these flows to Stripe Checkout,** as Apeparel and the quote
     link did, so the method is known before the amount.
   First find out what Printavo's payment page actually offers (card only,
   or card and ACH?) - nobody has confirmed it. `/api/printavo-schema` can
   list the payment-request fields.

2. **Sales tax.** Stickers and signs are taxed at 6.25% here (`lib/tax.ts`);
   Apeparel charges no tax. The 3% uplift is part of the price, so it is
   taxed like the goods it sits on. Whether the ACH discount also reduces the
   taxable amount (it normally does for a discount given at the time of
   sale) is a question for Gabe's accountant - ask, do not assume. Fee lines
   stay untaxed as today.

3. **Apparel on the website** is an estimate that never takes payment. Show
   the retail figure, and say a bank-transfer discount is available when the
   shop invoices. No checkout change.

4. **The customer quote link** (branch `claude/customer-quote-link`, not
   merged) has `CARD_FEE_RATE = 0.03` in `v2/lib/quote-link.ts` - a card
   SURCHARGE. It must be converted to this model before it can merge: retail
   on the page, ACH at the engine price, no fee line. It uses Stripe, so the
   Apeparel code applies almost directly.

5. **Deposits** keep `FULL_PAYMENT_CEILING` and `DEPOSIT_FRACTION` from
   `lib/auto-bill.ts`, never copies. Apeparel writes the same boundary as
   `retail >= 5000`; here it stays `> FULL_PAYMENT_CEILING`. Same boundary,
   one definition per app.

## This changes what customers pay

Every price rises 3%. That is a billed-figure change under `v2/AGENTS.md`:

- `tests/price-sheet.test.ts` will move on every row. Regenerate it
  deliberately, say why in the commit, and check a sample row by hand
  (engine figure x 1.03, rounded to the cent).
- Run `verification/independent-oracle.ts` and update ITS constants from this
  decision, not from `lib/`.
- Before merging, one real order must be reconciled against its Printavo
  invoice to the cent and recorded in HANDOFF.md's `## Reconciled` table.
- Copy everywhere: "price", never "card price + fee". The discount is shown
  as a saving for paying by bank transfer.
- Then run the `verification-loop` skill and paste its report.

Ask Gabe before merging: this moves every price the shop quotes.
