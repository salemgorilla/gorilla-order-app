import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  RETAIL_MULTIPLIER,
  RETAIL_UPLIFT,
  achPrice,
  achRefund,
  cents,
  engineTerms,
  retail2,
  retail4,
} from "../lib/retail";
import { engineSignsConfig, signsPricingConfig } from "../lib/signs-pricing-config";
import { apparelPricingConfig, engineApparelConfig } from "../lib/apparel-pricing-config";
import { SHIPPING_TIERS, tieredShippingPrice } from "../lib/shipping";
import { getQuoteTotals } from "../lib/tax";
import { STICKER_ORDER_MINIMUM, STICKER_SETUP_FEE, STICKER_SETUP_FEE_ADDITIONAL } from "../lib/pricing";

/**
 * THE 3% RETAIL UPLIFT — Gabe, 2026-11-11.
 *
 *   "We will not charge 3%, we will increase our retail price by 3% and
 *    discount those who pay via ACH."
 *
 * Then, option A: retail everywhere, the 3% refunded after an ACH payment;
 * sales tax always on the retail price. These tests pin the RULE. The dollar
 * figures live in the price sheets (price-sheet, signs-price-sheet,
 * apparel-price-sheet), which were regenerated and refused any row that was
 * not within rounding of (old x 1.03).
 */

describe("the rule", () => {
  test("it is three percent", () => {
    assert.equal(RETAIL_UPLIFT, 0.03);
    assert.equal(RETAIL_MULTIPLIER, 1.03);
  });

  test("cents round half up, even where binary floating point sits just under", () => {
    // 7.5 x 1.03 is 7.725 — stored as 7.72499999…, which a bare Math.round
    // would send to 7.72. The setup fee for a second design is 7.73.
    assert.equal(retail2(7.5), 7.73);
    assert.equal(cents(0.005), 0.01);
    assert.equal(retail2(15), 15.45);
    assert.equal(retail2(45), 46.35);
    assert.equal(retail2(0), 0);
  });

  test("a per-sticker unit keeps four decimals, because Printavo stores four", () => {
    assert.equal(retail4(0.7), 0.721);
    assert.equal(retail4(0.239555), 0.2467);
    assert.equal(retail4(1.365), 1.406);
  });

  test("a retail subtotal converts back to the old price book for comparing with a threshold", () => {
    assert.equal(engineTerms(77.25), 75);
    assert.equal(engineTerms(206), 200);
    assert.equal(engineTerms(0), 0);
  });
});

describe("the bank-transfer refund undoes the 3% exactly", () => {
  test("Gabe's example: $1,000 lists at $1,030 and bank transfer pays $1,000", () => {
    assert.equal(achRefund(1030), 30);
    assert.equal(achPrice(1030), 1000);
  });

  test("the skill's worked example: retail $327.13 refunds $9.53", () => {
    assert.equal(achRefund(327.13), 9.53);
    assert.equal(achPrice(327.13), 317.6);
  });

  test("nothing priced, nothing to refund", () => {
    assert.equal(achRefund(0), 0);
    assert.equal(achRefund(-5), 0);
    assert.equal(achRefund(Number.NaN), 0);
    assert.equal(achRefund(Number("x")), 0);
  });

  test("the refund is never more than the 3% and never negative", () => {
    for (const retail of [0.01, 1, 45.99, 87.55, 327.13, 1030, 5165, 20000.37]) {
      const refund = achRefund(retail);

      assert.ok(refund >= 0);
      assert.ok(refund <= retail * 0.03 + 0.005, `${retail}: refund ${refund} is more than 3%`);
      assert.ok(achPrice(retail) <= retail);
    }
  });

  test("it rides on QuoteTotals, on the PRE-TAX figure — tax is never refunded", () => {
    const totals = getQuoteTotals({ flow: "stickers", taxableSubtotal: 100, preTaxTotal: 103 });

    assert.equal(totals.achRefund, 3);
    // 103 pre-tax + 6.25 tax. The refund is 3, not 3 plus anything on the tax.
    assert.equal(totals.estimatedTotal, 109.25);
    assert.equal(totals.estimatedTax, 6.25);
  });

  test("apparel carries it too, though apparel is exempt from tax", () => {
    const totals = getQuoteTotals({ flow: "apparel", taxableSubtotal: 0, preTaxTotal: 206 });

    assert.equal(totals.taxed, false);
    assert.equal(totals.achRefund, 6);
  });
});

describe("what moved, and what must not", () => {
  test("the sticker fee constants are the retail figures", () => {
    assert.equal(STICKER_SETUP_FEE, 15.45);
    assert.equal(STICKER_SETUP_FEE_ADDITIONAL, 7.73);
    assert.equal(STICKER_ORDER_MINIMUM, 46.35);
  });

  test("shipping tier PRICES rose; tier THRESHOLDS did not", () => {
    assert.deepEqual(
      SHIPPING_TIERS.map((tier) => tier.price),
      [8.24, 12.36, 18.54, 25.75]
    );
    assert.deepEqual(
      SHIPPING_TIERS.map((tier) => tier.upTo),
      [75, 200, 500, null]
    );
  });

  test("an order reaches a shipping tier at the same size as before the uplift", () => {
    // $75.00 of goods in the old book is $77.25 at retail. It is still the
    // first tier; one cent more is the second — the 3% did not push anyone
    // into a dearer tier.
    assert.equal(tieredShippingPrice(77.25), 8.24);
    assert.equal(tieredShippingPrice(77.26), 12.36);
    assert.equal(tieredShippingPrice(206), 12.36);
    assert.equal(tieredShippingPrice(206.01), 18.54);
    assert.equal(tieredShippingPrice(515), 18.54);
    assert.equal(tieredShippingPrice(515.02), 25.75);
  });
});

/**
 * COMPLETENESS. The signs and apparel configs are written as an engine book
 * plus a retail copy built field by field. A walker would also have inflated
 * quantities and ratios, so the copy lists every PRICE by hand — which means a
 * price added later could be forgotten and ship at the old figure with the
 * suite green. This walks both books and fails on any numeric leaf that is
 * neither a known non-price nor exactly retail2() of its engine twin.
 */
// Paths are arrays joined with " > " because real keys contain dots ('AlumaCorr 0.2"').
const SEP = " > ";

function leaves(value: unknown, path: string[] = []): Array<{ path: string; value: number }> {
  if (typeof value === "number") return [{ path: path.join(SEP), value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => leaves(item, [...path, String(i)]));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key]));
  }
  return [];
}

function leaf(value: unknown, path: string): number {
  return path.split(SEP).reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], value) as number;
}

describe("every price in the signs and apparel books carries the 3%", () => {
  /** Numbers in those books that are NOT dollar prices. */
  const SIGNS_NON_PRICES = [
    / > minQuantity$/,
    /^rigid > secondSideFactor$/,
    /^banner > recommendReinforcementOverSqft$/,
    /^velcro > placements > /,
  ];
  const APPAREL_NON_PRICES = [/ > minQuantity$/, / > garmentMarkup$/, /^maxColorsPerLocation$/, /^baseGarmentMarkup$/];

  function check(
    engine: unknown,
    retail: unknown,
    nonPrices: RegExp[],
    label: string
  ) {
    const found = leaves(engine);
    assert.ok(found.length > 40, `${label}: the walk found almost nothing`);

    let prices = 0;
    for (const { path, value } of found) {
      const got = leaf(retail, path);

      if (nonPrices.some((rule) => rule.test(path))) {
        assert.equal(got, value, `${label} ${path}: a non-price changed`);
        continue;
      }

      prices += 1;
      assert.equal(got, retail2(value), `${label} ${path}: ${value} should be ${retail2(value)} at retail, is ${got}`);
    }

    assert.ok(prices > 30, `${label}: only ${prices} prices were checked`);
  }

  test("signs & banners", () => {
    check(engineSignsConfig, signsPricingConfig, SIGNS_NON_PRICES, "signs");
  });

  test("apparel print cells and the screen fee", () => {
    check(engineApparelConfig, apparelPricingConfig, APPAREL_NON_PRICES, "apparel");
  });

  test("the retail books have no leaf the engine books lack, and the reverse", () => {
    assert.deepEqual(
      leaves(signsPricingConfig).map((l) => l.path),
      leaves(engineSignsConfig).map((l) => l.path)
    );
    assert.deepEqual(
      leaves(apparelPricingConfig).map((l) => l.path),
      leaves(engineApparelConfig).map((l) => l.path)
    );
  });
});
