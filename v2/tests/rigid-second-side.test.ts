/**
 * The second side of a rigid sign costs one third less than the first —
 * Gabe, 2026-09-05. Relative to the material, replacing a flat +$8/sqft.
 *
 * RETAIL, 2026-11-11 (+3%, lib/retail.ts): the single-side rates are $13.39 /
 * $15.45 / $18.03 a sqft (old book $13 / $15 / $17.50) and the second side is
 * two thirds of THAT rate, rounded to the cent ($8.93, $10.30, $12.02). The
 * ratio is a ratio, not a price, and is asserted unchanged.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { calculateSignsPricing } from "../lib/signs-pricing";
import { signsPricingConfig } from "../lib/signs-pricing-config";

const sqft = (material: string, doubleSided: boolean) =>
  calculateSignsPricing({
    method: "rigid",
    quantity: 1,
    widthInches: 24,
    heightInches: 18,
    material,
    doubleSided,
  });

describe("rigid, double-sided: the second side at two thirds", () => {
  test("the factor is the decision", () => {
    assert.equal(signsPricingConfig.rigid.secondSideFactor, 2 / 3);
  });

  for (const [material, rate, both] of [
    // [material, retail single, retail both sides]; old book 13 / 21.67,
    // 15 / 25, 17.50 / 29.17.
    ['PVC 1/8"', 13.39, 22.32],
    ['Dibond 1/8"', 15.45, 25.75],
    ['Dibond 1/4"', 18.03, 30.05],
  ] as const) {
    test(`${material}: $${rate}/sqft single, $${both}/sqft both sides`, () => {
      // 24" x 18" is 3 sqft; subtotal is the product line, before setup.
      assert.equal(sqft(material, false).subtotal, Math.round(rate * 3 * 100) / 100);
      assert.equal(
        sqft(material, true).subtotal,
        Math.round(both * 3 * 100) / 100
      );
    });
  }

  test("the second side is always cheaper than the first, never a flat add", () => {
    for (const material of Object.keys(signsPricingConfig.rigid.perSqftByMaterial)) {
      const single = sqft(material, false).subtotal;
      const double = sqft(material, true).subtotal;
      const second = double - single;

      assert.ok(second > 0, `${material}: no second-side charge`);
      assert.ok(second < single, `${material}: the second side costs as much as the first`);
      assert.equal(
        Math.round((second / single) * 100) / 100,
        0.67,
        `${material}: second side is not a third less`
      );
    }
  });

  test("the line says so", () => {
    const note = sqft('PVC 1/8"', true).lines.find((l) => /second side/.test(l.label));

    assert.ok(note);
    // $8.67 in the old book (13 / 3 x 2); $8.93 at retail ($13.39 x 2/3).
    assert.match(note.label, /\$8\.93\/sqft/);
    assert.match(note.label, /a third less/);
  });

  test("banners still take the flat 18 oz surcharge — this is rigid only", () => {
    const single = calculateSignsPricing({
      method: "banner", quantity: 1, widthInches: 72, heightInches: 36,
      material: "18 oz Heavy Duty Vinyl", doubleSided: false,
    }).subtotal;
    const double = calculateSignsPricing({
      method: "banner", quantity: 1, widthInches: 72, heightInches: 36,
      material: "18 oz Heavy Duty Vinyl", doubleSided: true,
    }).subtotal;

    // 18 sqft x $8.24 (the old $8, +3%); rounded to the cent against float noise.
    assert.equal(
      Math.round((double - single) * 100) / 100,
      Math.round(18 * signsPricingConfig.doubleSidedPerSqft * 100) / 100
    );
  });
});
