/**
 * The second side of a rigid sign costs one third less than the first —
 * Gabe, 2026-09-05. Relative to the material, replacing a flat +$8/sqft.
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
    ['PVC 1/8"', 9, 15],
    ['Dibond 1/8"', 11, 18.33],
    ['Dibond 1/4"', 13.5, 22.5],
  ] as const) {
    test(`${material}: $${rate}/sqft single, $${both}/sqft both sides`, () => {
      // 24" x 18" is 3 sqft; subtotal is the product line, before setup.
      assert.equal(sqft(material, false).subtotal, rate * 3);
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
    assert.match(note.label, /\$6\.00\/sqft/);
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

    assert.equal(double - single, 18 * signsPricingConfig.doubleSidedPerSqft);
  });
});
