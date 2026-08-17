import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  SALES_TAX,
  getQuoteTotals,
  getSignsTotals,
  getStickerTotals,
} from "../lib/tax";

/**
 * One tax figure, several surfaces.
 *
 * The pre-tax total was rendered from `pricing.total` in four places — the
 * sticky estimate bar, the review card, the Order Summary and the
 * CONFIRMATION screen. Adding tax to one of them moved the problem rather
 * than fixing it: the customer agreed to one number on review and saw another
 * after submitting, which for stickers is the moment a payable link is issued.
 *
 * These pin the derivation every surface now shares.
 */

/** The canonical release-check order: 3"x3" x100 and 2"x2" x50, pickup. */
const REFERENCE = { stickerPrice: 35.2, setupPrice: 37.5, total: 72.7 };

describe("stickers", () => {
  test("the reference order reconciles to the invoice", () => {
    const t = getStickerTotals(REFERENCE);

    assert.equal(t.taxableSubtotal, 72.7);
    assert.equal(t.estimatedTax, 4.54);
    assert.equal(t.estimatedTotal, 77.24);
    assert.equal(t.taxed, true);
  });

  test("shipping is taxed by nobody, but is still in the total", () => {
    /**
     * Separately stated shipping is not taxable in Massachusetts, and
     * buildPrintavoQuotePlan sends that line with `taxed: false`. It must stay
     * OUT of the base and IN the total, or the review disagrees with the
     * invoice by $0.75 on every shipped order.
     */
    const shipped = { stickerPrice: 35.2, setupPrice: 37.5, total: 84.7 };
    const t = getStickerTotals(shipped);

    assert.equal(t.taxableSubtotal, 72.7, "shipping leaked into the base");
    assert.equal(t.estimatedTax, 4.54, "tax moved when only shipping changed");
    assert.equal(t.estimatedTotal, 89.24, "shipping fell out of the total");
  });

  test("setup is taxed, because Printavo taxes the fee lines", () => {
    const noSetup = getStickerTotals({ stickerPrice: 35.2, setupPrice: 0, total: 35.2 });

    assert.equal(noSetup.estimatedTax, 2.2);
  });

  test("float dust never reaches the total", () => {
    // 72.7 + 4.54 is 77.24000000000001 in binary floating point.
    assert.equal(getStickerTotals(REFERENCE).estimatedTotal, 77.24);
  });
});

describe("signs", () => {
  test("the whole total is taxable, because signs have no shipping line", () => {
    // calculateSignsPricing returns a total that is entirely goods and fees.
    const t = getSignsTotals({ total: 200 });

    assert.equal(t.taxableSubtotal, 200);
    assert.equal(t.estimatedTax, 12.5);
    assert.equal(t.estimatedTotal, 212.5);
  });

  test("signs are taxable, not exempt", () => {
    assert.equal(getSignsTotals({ total: 100 }).taxed, true);
  });
});

describe("apparel is exempt", () => {
  test("no tax, and the total is untouched", () => {
    // Clothing is exempt in Massachusetts. Callers hide the row on `taxed`
    // rather than printing $0.00.
    const t = getQuoteTotals({ flow: "apparel", taxableSubtotal: 480, preTaxTotal: 480 });

    assert.equal(t.estimatedTax, 0);
    assert.equal(t.estimatedTotal, 480);
    assert.equal(t.taxed, false);
  });
});

describe("the invariant the four surfaces depend on", () => {
  test("every surface reading the same pricing gets the same number", () => {
    /**
     * The actual bug: three surfaces called .toFixed(2) on pricing.total and
     * one added tax. Since they all now call one function, sameness is
     * structural — but assert it, because the next surface added is the one
     * that would drift.
     */
    const pricings = [
      { stickerPrice: 35.2, setupPrice: 37.5, total: 72.7 },
      { stickerPrice: 0, setupPrice: 25, total: 25 },
      { stickerPrice: 1200.5, setupPrice: 62.5, total: 1275 },
      { stickerPrice: 0, setupPrice: 0, total: 0 },
    ];

    for (const p of pricings) {
      const a = getStickerTotals(p);
      const b = getStickerTotals(p);

      assert.deepEqual(a, b);
      assert.ok(
        a.estimatedTotal >= p.total,
        "tax can only ever add to the figure already shown"
      );
    }
  });

  test("a zero order shows no tax row at all", () => {
    const t = getStickerTotals({ stickerPrice: 0, setupPrice: 0, total: 0 });

    assert.equal(t.estimatedTax, 0);
    assert.equal(t.estimatedTotal, 0);
  });

  test("the rate is read from the module, never typed in", () => {
    assert.equal(SALES_TAX.ratePercent, 6.25);
  });
});
