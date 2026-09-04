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
  /**
   * REPRICED 4 Sep 2026, deliberately: all fees are untaxed (Gabe), so the
   * $37.50 of setup left the taxable base. The reference order's tax went
   * $4.54 -> $2.20 and its total $77.24 -> $74.90. This is the figure the
   * customer PAYS — stickers auto-bill — so the same change sets
   * `taxed: false` on GORILLA-DECAL-SETUP in lib/printavo.ts, and task #20's
   * reconciliation now validates this pair of numbers.
   */
  test("the reference order reconciles to the invoice", () => {
    const t = getStickerTotals(REFERENCE);

    assert.equal(t.taxableSubtotal, 35.2, "setup is a fee — not in the base");
    assert.equal(t.estimatedTax, 2.2);
    assert.equal(t.estimatedTotal, 74.9);
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

    assert.equal(t.taxableSubtotal, 35.2, "shipping leaked into the base");
    assert.equal(t.estimatedTax, 2.2, "tax moved when only shipping changed");
    assert.equal(t.estimatedTotal, 86.9, "shipping fell out of the total");
  });

  test("setup moves the total but never the tax", () => {
    // The point of the ruling, stated as an arithmetic property: two orders
    // with the same decals and different setup pay the same tax.
    const withSetup = getStickerTotals(REFERENCE);
    const noSetup = getStickerTotals({
      stickerPrice: 35.2,
      setupPrice: 0,
      total: 35.2,
    });

    assert.equal(withSetup.estimatedTax, noSetup.estimatedTax);
    assert.equal(noSetup.estimatedTax, 2.2);
    assert.notEqual(withSetup.estimatedTotal, noSetup.estimatedTotal);
  });

  test("float dust never reaches the total", () => {
    // 72.7 + 2.2 is 74.90000000000001 in binary floating point.
    assert.equal(getStickerTotals(REFERENCE).estimatedTotal, 74.9);
  });
});

describe("signs", () => {
  test("the goods are taxable; the fees inside the total are not", () => {
    // Signs have no shipping line, so the total is goods plus fees and the
    // base is the total with the fees taken back out.
    const t = getSignsTotals({ total: 200, feeTotal: 15 });

    assert.equal(t.taxableSubtotal, 185);
    assert.equal(t.estimatedTax, 11.56);
    assert.equal(t.estimatedTotal, 211.56);
  });

  test("a quote with no fees taxes the whole total", () => {
    const t = getSignsTotals({ total: 200, feeTotal: 0 });

    assert.equal(t.taxableSubtotal, 200);
    assert.equal(t.estimatedTax, 12.5);
  });

  test("fees can never push the base negative", () => {
    // A hand-quoted or zeroed job must not produce a credit.
    const t = getSignsTotals({ total: 15, feeTotal: 40 });

    assert.equal(t.taxableSubtotal, 0);
    assert.equal(t.estimatedTax, 0);
    assert.equal(t.estimatedTotal, 15);
  });

  test("signs are taxable, not exempt", () => {
    assert.equal(getSignsTotals({ total: 100, feeTotal: 0 }).taxed, true);
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
