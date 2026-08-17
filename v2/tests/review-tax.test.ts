import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SALES_TAX, estimateSalesTax, isTaxableFlow } from "../lib/tax";

/**
 * The estimated tax line on the review screen.
 *
 * The customer used to agree to a number on review and meet 6.25% for the
 * first time on the Printavo payment page. The row exists to close that gap,
 * which means it has to agree with the invoice — not merely look plausible.
 *
 * These test the arithmetic the component performs. The component itself is a
 * server component with no test harness; what is checkable here is the base it
 * taxes and the figure that comes out, which is the part that could be wrong
 * by real money.
 */

/** Exactly what OrderSummary computes. */
function reviewTotals(pricing: {
  stickerPrice: number;
  setupPrice: number;
  shippingPrice: number;
  total: number;
}) {
  const taxableSubtotal = pricing.stickerPrice + pricing.setupPrice;
  const estimatedTax = isTaxableFlow("stickers")
    ? estimateSalesTax(taxableSubtotal)
    : 0;

  // Rounded to cents, exactly as the component does — 72.7 + 4.54 is
  // 77.24000000000001 in floating point.
  const estimatedTotal =
    Math.round((pricing.total + estimatedTax) * 100) / 100;

  return { taxableSubtotal, estimatedTax, estimatedTotal };
}

describe("the reference two-design order", () => {
  /**
   * The canonical order from the release check: 3"x3" x100 and 2"x2" x50,
   * local pickup. Its arithmetic is memorised, so a drift here is visible.
   *
   *   D1  $28.80 material + $25.00 setup
   *   D2  $ 6.40 material + $12.50 setup
   *       goods $72.70 · tax $4.54 · due $77.24
   */
  const REFERENCE = {
    stickerPrice: 28.8 + 6.4,
    setupPrice: 25 + 12.5,
    shippingPrice: 0,
    total: 72.7,
  };

  test("goods subtotal is $72.70", () => {
    assert.equal(reviewTotals(REFERENCE).taxableSubtotal, 72.7);
  });

  test("tax is $4.54", () => {
    assert.equal(reviewTotals(REFERENCE).estimatedTax, 4.54);
  });

  test("the estimated total is $77.24, matching Printavo", () => {
    assert.equal(reviewTotals(REFERENCE).estimatedTotal, 77.24);
  });
});

describe("what is taxed, and what is not", () => {
  test("shipping is excluded from the taxable base", () => {
    /**
     * Separately stated shipping is not taxable in Massachusetts, and
     * buildPrintavoQuotePlan sends the shipping line with taxed: false. If the
     * review taxed it, the review and the invoice would disagree by $0.75 on
     * every shipped order.
     */
    const shipped = { stickerPrice: 35.2, setupPrice: 37.5, shippingPrice: 12, total: 84.7 };
    const { taxableSubtotal, estimatedTax } = reviewTotals(shipped);

    assert.equal(taxableSubtotal, 72.7, "shipping leaked into the taxable base");
    assert.equal(estimatedTax, 4.54, "tax moved when only shipping changed");
  });

  test("setup IS taxed, because Printavo taxes the fee lines", () => {
    // Goods and fee lines both carry `taxed: salesTaxRate !== null`. Excluding
    // setup here would under-report the tax by $2.34 on the reference order.
    const noSetup = reviewTotals({ stickerPrice: 35.2, setupPrice: 0, shippingPrice: 0, total: 35.2 });

    assert.equal(noSetup.estimatedTax, 2.2);
    assert.notEqual(noSetup.estimatedTax, 4.54);
  });

  test("apparel is exempt, so the row would not be shown", () => {
    // Clothing is exempt in Massachusetts. The component gates the row on the
    // tax being greater than zero, so an exempt flow shows no row at all.
    assert.equal(isTaxableFlow("apparel"), false);
  });

  test("signs are taxable, like stickers", () => {
    assert.equal(isTaxableFlow("signs"), true);
  });
});

describe("the estimate stays an estimate", () => {
  test("a half-cent is left alone, not compensated for", () => {
    /**
     * $241.04 x 6.25% is $15.065. Printavo may show $15.06 and total as if
     * $15.07. That is not a bug and must not grow rounding logic — the label
     * says "Estimated" precisely so a cent of disagreement stays honest.
     */
    assert.equal(estimateSalesTax(241.04), 15.07);
  });

  test("a zero order produces no tax", () => {
    assert.equal(estimateSalesTax(0), 0);
  });

  test("the rate and label come from the module, never a literal", () => {
    assert.equal(SALES_TAX.ratePercent, 6.25);
    assert.match(SALES_TAX.label, /6\.25%/);
  });
});
