/**
 * THE $45 ORDER MINIMUM, ON THE FLOW THAT BILLS WITH NOBODY WATCHING.
 *
 * Gabe, 2026-09-12: "Let's have a minimum of $45 for stickers." Before this
 * one 3" sticker quoted $15.70 and auto-billed.
 *
 * The rule is simple; what has to be proved is that it reaches Printavo as
 * the same money it reaches the customer as. The top-up is its OWN row —
 * "Minimum order" — on the screen, in the shop email and on the invoice,
 * untaxed like setup, and the invoice total equals the website total to
 * the cent, which is the property every other sticker figure is held to.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildQuoteEmail } from "../lib/email";
import { STICKER_ORDER_MINIMUM, STICKER_SETUP_FEE, quoteStickerCart } from "../lib/pricing";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { SKU } from "../lib/sku";
import { repriceStickers } from "../lib/sticker-repricing";
import { getStickerTotals } from "../lib/tax";

const small = (deliveryMethod = "Pickup") => ({
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod, needBy: "2026-10-01" },
  product: { type: "Custom Stickers", quantity: 7 },
  items: [
    { id: "d1", quantity: 7, widthInches: 2, heightInches: 2, material: "Gloss White Vinyl", shape: "Circle", artwork: { file: { name: "a.png" } } },
  ],
  pricing: { total: 0 },
});

// The repo's model of Printavo's arithmetic: 4dp unit x qty, fees, once.
function printavoTotal(plan: ReturnType<typeof buildPrintavoQuotePlan>) {
  const stored = (p: number) => Number(p.toFixed(4));
  const goods = plan.lineItems.reduce((s, l) => s + stored(l.price) * Math.max(1, l.quantity), 0);
  const fees = plan.feeLineItems.reduce((s, f) => s + stored(f.price), 0);
  return Math.round((goods + fees + stored(plan.shippingLineItem?.price ?? 0)) * 100) / 100;
}

describe("the minimum is a line, and the lines add up", () => {
  test("a small order is topped up to exactly $45, and says so", () => {
    const priced = repriceStickers(small());
    const pricing = priced.order.pricing as Record<string, number>;

    assert.ok(pricing.stickerPrice + pricing.setupPrice < STICKER_ORDER_MINIMUM, "fixture is not under the minimum");
    assert.equal(pricing.minimumPrice, Math.round((STICKER_ORDER_MINIMUM - pricing.stickerPrice - pricing.setupPrice) * 100) / 100);
    assert.equal(pricing.total, STICKER_ORDER_MINIMUM);
    assert.equal(priced.unpriceable, false, "a small order still bills — it is small, not broken");
  });

  test("Printavo gets it as its own untaxed row, and the invoice equals the quote", () => {
    const priced = repriceStickers(small());
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-TEST", order: priced.order, artworkAnalysis: null });

    const row = plan.feeLineItems.find((f) => f.itemNumber === SKU.DECAL_MINIMUM);
    assert.ok(row, "no Minimum order row on the invoice");
    assert.equal(row?.taxed, false);
    assert.match(row?.description ?? "", /Minimum order \(\$45 for stickers\)/);
    assert.equal(row?.price, (priced.order.pricing as Record<string, number>).minimumPrice);

    assert.equal(printavoTotal(plan), (priced.order.pricing as Record<string, number>).total);
  });

  test("the row is absent when the order clears the minimum on its own", () => {
    const big = { ...small(), product: { type: "Custom Stickers", quantity: 500 }, items: [{ ...small().items[0], quantity: 500 }] };
    const priced = repriceStickers(big);
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-TEST", order: priced.order, artworkAnalysis: null });

    assert.equal((priced.order.pricing as Record<string, number>).minimumPrice, 0);
    assert.equal(plan.feeLineItems.some((f) => f.itemNumber === SKU.DECAL_MINIMUM), false);
  });

  test("the shop email prints it beside setup — and only when it applies", () => {
    const under = buildQuoteEmail({ quoteNumber: "GS-T", receivedAt: new Date().toISOString(), order: repriceStickers(small()).order, artworkAnalysis: null }).text;
    assert.match(under, /Minimum order: \$/);

    const big = { ...small(), items: [{ ...small().items[0], quantity: 500 }] };
    const over = buildQuoteEmail({ quoteNumber: "GS-T", receivedAt: new Date().toISOString(), order: repriceStickers(big).order, artworkAnalysis: null }).text;
    assert.doesNotMatch(over, /Minimum order/);
  });

  test("it is not taxed, and the estimate knows that", () => {
    // getStickerTotals taxes stickerPrice only. The top-up is a charge for
    // the size of the job, like setup, so it must stay out of that base or
    // the on-screen estimate and Printavo's invoice part company.
    const pricing = repriceStickers(small()).order.pricing as { stickerPrice: number; setupPrice: number; total: number };
    const totals = getStickerTotals(pricing);

    assert.equal(totals.taxableSubtotal, pricing.stickerPrice);
    assert.ok(totals.taxableSubtotal < STICKER_ORDER_MINIMUM - STICKER_SETUP_FEE);
  });

  test("shipping is tiered on the goods including the top-up", () => {
    const pickup = quoteStickerCart({ materialPrices: [10], deliveryMethod: "Pickup" });
    const shipped = quoteStickerCart({ materialPrices: [10], deliveryMethod: "Ship" });

    assert.equal(pickup.total, STICKER_ORDER_MINIMUM);
    // $45 of goods is the $8 tier; the minimum is met before shipping.
    assert.equal(shipped.shippingPrice, 8);
    assert.equal(shipped.total, STICKER_ORDER_MINIMUM + 8);
  });
});
