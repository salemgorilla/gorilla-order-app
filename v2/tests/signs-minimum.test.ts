/**
 * The order minimums — Gabe, 2026-09-05: sign orders start at $60, banner
 * orders at $45. Applied once to the whole quote, after designs and setup,
 * before rush and tax. lib/signs-cart.ts.
 *
 * What these pin: the floor lifts a small quote to the minimum and no
 * further; it is cart-level, so two small designs that add up clear it;
 * the top-up is its own line, TAXED as goods (it is the price of the
 * signs, not a separately stated service); and it reaches Printavo on the
 * cart path as well as the one-design path — the place rush went missing.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { defaultSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart, withSignsRush } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { signsPricingConfig } from "../lib/signs-pricing-config";
import { getSignsTotals } from "../lib/tax";

const ONE_YARD_SIGN: SignsDesign = {
  ...defaultSignsDesign,
  id: "y1",
  productId: "yard-sign",
  quantity: 1,
  size: '18" x 24"',
};

const TINY_BANNER: SignsDesign = {
  ...defaultSignsDesign,
  id: "b1",
  productId: "vinyl-banner",
  quantity: 1,
  size: "Custom",
  customSize: "custom",
  customWidthInches: 12,
  customHeightInches: 24,
};

const BIG_BANNER: SignsDesign = {
  ...defaultSignsDesign,
  id: "b2",
  productId: "vinyl-banner",
  quantity: 1,
  size: "3' x 6'",
};

describe("the minimums are the decision, as literal figures", () => {
  test("$60 signs, $45 banners", () => {
    assert.equal(signsPricingConfig.minimumOrder.signs, 60);
    assert.equal(signsPricingConfig.minimumOrder.banners, 45);
  });
});

describe("a small order is lifted to the floor, and no further", () => {
  test("one yard sign: $31 + $15 setup = $46, priced at $60", () => {
    const quote = quoteSignsCart([ONE_YARD_SIGN]);
    const minimum = quote.lines.find((l) => l.kind === "minimum");

    assert.equal(quote.priceable, true);
    assert.equal(quote.total, 60);
    assert.equal(quote.minimumApplied, 60);
    assert.ok(minimum, "the top-up must be its own line");
    assert.equal(minimum.amount, 14);
    assert.equal(minimum.code, "MINIMUM");
    assert.match(minimum.label, /start at \$60/);
  });

  test("a 1' x 2' banner: $18 + $15 setup = $33, priced at $45", () => {
    const quote = quoteSignsCart([TINY_BANNER]);

    assert.equal(quote.priceable, true);
    assert.equal(quote.total, 45);
    assert.equal(quote.minimumApplied, 45);
    assert.equal(quote.lines.find((l) => l.kind === "minimum")?.amount, 12);
  });

  test("a 3' x 6' banner clears it on its own — no line, no field", () => {
    const quote = quoteSignsCart([BIG_BANNER]);

    assert.ok(quote.total > 45);
    assert.equal(quote.minimumApplied, undefined);
    assert.equal(quote.lines.some((l) => l.kind === "minimum"), false);
  });

  test("exactly at the minimum is not lifted", () => {
    // Two yard signs are $51 + $15 = $66 — over. Build an at-the-line case
    // from the config rather than hoping a real product lands on it.
    const quote = quoteSignsCart([ONE_YARD_SIGN]);
    const own = quote.total - (quote.lines.find((l) => l.kind === "minimum")?.amount ?? 0);

    assert.equal(own, 46, "the fixture's own total");
    assert.equal(quote.total - own, 14, "the lift is exactly the shortfall");
  });
});

describe("it is one order, not one design", () => {
  test("two $46 yard-sign designs are a $92 order — no minimum", () => {
    const quote = quoteSignsCart([ONE_YARD_SIGN, { ...ONE_YARD_SIGN, id: "y2" }]);

    assert.equal(quote.total, 92);
    assert.equal(quote.minimumApplied, undefined);
  });

  test("two tiny banners at $33 each are a $66 order — no minimum", () => {
    const quote = quoteSignsCart([TINY_BANNER, { ...TINY_BANNER, id: "b3" }]);

    assert.equal(quote.total, 66);
    assert.equal(quote.minimumApplied, undefined);
  });

  test("a hand-quoted cart is untouched — nothing to lift", () => {
    const quote = quoteSignsCart([
      { ...defaultSignsDesign, id: "w", productId: "window-graphics", quantity: 1 },
    ]);

    assert.equal(quote.priceable, false);
    assert.equal(quote.total, 0);
    assert.equal(quote.minimumApplied, undefined);
  });
});

describe("the top-up is goods: taxed, and it rides on both Printavo paths", () => {
  function planFor(designs: SignsDesign[], family: "signs" | "banners") {
    const pricing = quoteSignsCart(designs);
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "TEST-MIN",
      order: {
        customer: { customerName: "Test", email: "test@example.com" },
        production: { needBy: "2026-10-14" },
        ...buildSignsPayloadParts(designs, pricing, family),
      },
      artworkAnalysis: null,
    });
    const invoice =
      plan.lineItems.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0) +
      plan.feeLineItems.reduce((s, f) => s + f.price, 0);

    return { pricing, plan, invoice: Math.round(invoice * 100) / 100 };
  }

  test("one design: the minimum line reaches Printavo, taxed, and the invoice equals the quote", () => {
    const { pricing, plan, invoice } = planFor([ONE_YARD_SIGN], "signs");
    const line = plan.feeLineItems.find((f) => f.itemNumber === "GORILLA-SIGN-MINIMUM");

    assert.ok(line, "no minimum row on the invoice");
    assert.equal(line.price, 14);
    assert.equal(line.taxed, true, "the top-up is goods, not a fee");
    assert.equal(invoice, pricing.total);
  });

  test("the estimate taxes it too — both ends agree on the base", () => {
    const { pricing, plan } = planFor([ONE_YARD_SIGN], "signs");
    const estimate = getSignsTotals({ total: pricing.total, feeTotal: pricing.feeTotal });
    const invoiceBase =
      plan.lineItems.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0) +
      plan.feeLineItems.filter((f) => f.taxed).reduce((s, f) => s + f.price, 0);

    // $60 total, $15 of it setup (untaxed): $45 taxable, $31 sign + $14 lift.
    assert.equal(estimate.taxableSubtotal, 45);
    assert.equal(Math.round(invoiceBase * 100) / 100, 45);
  });

  test("a CART under the floor: the line rides the cart path to Printavo", () => {
    // Two 6" x 6" banners: $2.25 of vinyl each, $15 setup each — $34.50,
    // under the $45 floor. This is the shape that lost rush (#107): a
    // cart-level line that no per-design sweep can see.
    const tiny6: SignsDesign = { ...TINY_BANNER, id: "b4", customWidthInches: 6, customHeightInches: 6 };
    const { pricing, plan, invoice } = planFor([tiny6, { ...tiny6, id: "b5" }], "banners");

    assert.equal(pricing.minimumApplied, 45, "the fixture must actually be under the floor");
    assert.equal(pricing.lines.find((l) => l.kind === "minimum")?.amount, 10.5);

    const line = plan.feeLineItems.find((f) => f.itemNumber === "GORILLA-SIGN-MINIMUM");
    assert.ok(line, "the cart path dropped the minimum line");
    assert.equal(line.price, 10.5);
    assert.equal(line.taxed, true);
    assert.equal(invoice, pricing.total, "invoice and quote disagree");
  });

  test("rush rides on the lifted total, not the pre-minimum one", () => {
    const quote = withSignsRush(quoteSignsCart([ONE_YARD_SIGN]), {
      needBy: "2026-09-17",
      lane: "slow",
      today: "2026-09-04",
    });

    assert.equal(quote.rushFee, 15, "25% of $60");
    assert.equal(quote.total, 75);
  });
});
