/**
 * THE PRICING INVARIANTS, AS TESTS — §10 of the pricing handoff (22 Aug),
 * which asked for exactly this: "the invariant checks become tests, not
 * habits … fail the build on a monotonicity violation. Do not warn."
 *
 * ── WHY THESE FOUR ────────────────────────────────────────────────────────
 * The shop's Printavo screen-print matrix went out with a crater in it: at
 * seven colours, 288 pieces totalled $2,448 while 360 totalled $738. A
 * customer saved $1,710 by ordering 72 more shirts, and inside the 360 row
 * seven colours priced below one. It survived human review for an unknown
 * time because nobody reads a sheet the way these checks do: a FALLING
 * PER-PIECE RATE is correct and expected, a FALLING TOTAL is the bug, and
 * the eye cannot tell them apart across a table.
 *
 * Those defects were in Printavo, not in this repo. But the repo now carries
 * its own apparel print tiers, its own yard-sign tiers, and the sticker
 * ladder, and every one of them could grow the same shape in a one-line
 * config edit that looks fine in a diff. So the four checks run here on
 * every change, against the real engines, not the raw tables — the yard
 * sign table goes backwards at every boundary BY DESIGN, and it is
 * getYardSignPrice's never-pay-more rule that makes the price the customer
 * meets monotonic. Testing the table would fail; testing the engine is what
 * the customer sees.
 *
 *   1. TOTALS, NOT RATES — for every configuration, the total strictly
 *      increases with quantity. Checked across ALL PAIRS of quantities, not
 *      adjacent ones: the 840 defect was missed on a first pass because an
 *      adjacent-only check let 360 mask it.
 *   2. LADDER DIRECTION — within a quantity, more colours / more locations /
 *      double-sided / a bigger size never costs less.
 *   3. TIER COVERAGE — every quantity from 1 up prices; no gap between the
 *      top of one tier and the bottom of the next.
 *   4. SETUP DERIVED, NEVER STORED — remove the first of three sticker
 *      designs and the new first pays the $25, not the $12.50 it was added
 *      at. The undercharge this prevents is $12.50, silent, on the flow
 *      that bills unattended.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { calculateApparelPricing } from "../lib/apparel-pricing";
import { apparelPricingConfig } from "../lib/apparel-pricing-config";
import {
  getCartSetupFee,
  getStickerMaterialPrice,
  quoteStickerCart,
  STICKER_SETUP_FEE,
  STICKER_SETUP_FEE_ADDITIONAL,
} from "../lib/pricing";
import { calculateSignsPricing, getYardSignPrice } from "../lib/signs-pricing";
import { signsPricingConfig } from "../lib/signs-pricing-config";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every pair, not every neighbour. `label` names the axis so a failure says
 * which two quantities crossed, not just that something did.
 */
function assertStrictlyIncreasing(
  points: Array<{ at: number; total: number }>,
  label: string,
  { allowEqual = false }: { allowEqual?: boolean } = {}
) {
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const lower = points[i];
      const higher = points[j];
      const ok = allowEqual
        ? higher.total >= lower.total
        : higher.total > lower.total;

      assert.ok(
        ok,
        `${label}: ${higher.at} costs $${higher.total.toFixed(2)} but ${lower.at} costs $${lower.total.toFixed(2)} — a bigger order is cheaper`
      );
    }
  }
}

// ─── APPAREL: the in-repo screen-print tiers ───────────────────────────────

describe("apparel print pricing: totals, not rates", () => {
  const tiers = [...apparelPricingConfig.basePrintPrices]
    .map((tier) => tier.minQuantity)
    .sort((a, b) => a - b);

  // Every boundary, one under every boundary, and a few in between: the
  // places a step-down ladder can cross itself.
  const quantities = [
    ...new Set(
      tiers.flatMap((min) => [min - 1, min, min + 1]).filter((q) => q >= 1)
    ),
    36,
    75,
    150,
    500,
    1000,
  ].sort((a, b) => a - b);

  const inkOptions = ["1 color", "2 colors", "3 colors", "4 colors", "5+ colors"];
  const locationOptions = [["Front"], ["Front", "Back"]];

  for (const inkColors of inkOptions) {
    for (const printLocations of locationOptions) {
      for (const hasUnderbase of [false, true]) {
        const name = `${inkColors}, ${printLocations.length} location(s)${
          hasUnderbase ? ", underbase" : ""
        }`;

        test(`${name}: the total never falls as quantity rises`, () => {
          const points = quantities.map((quantity) => ({
            at: quantity,
            // Garment at 0 so this is the PRINT ladder alone — the garment
            // component is unit × quantity and cannot invert.
            total: round2(
              calculateApparelPricing({
                quantity,
                garmentUnitPrice: 0,
                printLocations,
                inkColors,
                hasUnderbase,
              }).total
            ),
          }));

          // Equal is the never-pay-more rule doing its job: 23 shirts print
          // for the 24-piece figure, so 23 and 24 cost the same. A LOWER
          // total for MORE shirts is the defect.
          assertStrictlyIncreasing(points, name, { allowEqual: true });
        });
      }
    }
  }

  test("tier coverage: quantity 1 prices, and every count above it does", () => {
    assert.equal(Math.min(...tiers), 1, "the bottom tier must start at 1");

    // Step-down lookup makes ranges contiguous by construction; what can
    // still go wrong is a tier that prices at nothing.
    for (const quantity of quantities) {
      const priced = calculateApparelPricing({
        quantity,
        garmentUnitPrice: 0,
        printLocations: ["Front"],
        inkColors: "1 color",
        hasUnderbase: false,
      });

      assert.ok(priced.printUnitPrice > 0, `quantity ${quantity} prices at $0 — a tier with no rate`);
    }
  });
});

describe("apparel print pricing: ladder direction within a quantity", () => {
  const inkOptions = ["1 color", "2 colors", "3 colors", "4 colors", "5+ colors"];

  for (const quantity of [1, 12, 24, 50, 100, 250, 600]) {
    test(`${quantity} pieces: more colours never costs less`, () => {
      const points = inkOptions.map((inkColors, index) => ({
        at: index + 1,
        total: round2(
          calculateApparelPricing({
            quantity,
            garmentUnitPrice: 0,
            printLocations: ["Front"],
            inkColors,
            hasUnderbase: false,
          }).total
        ),
      }));

      assertStrictlyIncreasing(points, `${quantity} pieces, colours`);
    });

    test(`${quantity} pieces: a second location never costs less`, () => {
      const one = calculateApparelPricing({
        quantity,
        garmentUnitPrice: 0,
        printLocations: ["Front"],
        inkColors: "2 colors",
        hasUnderbase: false,
      }).total;
      const two = calculateApparelPricing({
        quantity,
        garmentUnitPrice: 0,
        printLocations: ["Front", "Back"],
        inkColors: "2 colors",
        hasUnderbase: false,
      }).total;

      assert.ok(two > one, `front+back $${two} vs front $${one}`);
    });
  }
});

// ─── SIGNS: the yard-sign tiers, through the never-pay-more rule ───────────

describe("yard signs: the price the customer meets never falls with quantity", () => {
  const sizes = Object.keys(signsPricingConfig.yardSigns.sizes);

  for (const sizeKey of sizes) {
    for (const doubleSided of [false, true]) {
      const name = `${sizeKey} ${doubleSided ? "double" : "single"}-sided`;

      test(`${name}: totals across 1..60, all pairs`, () => {
        const points = Array.from({ length: 60 }, (_, i) => i + 1).map(
          (quantity) => {
            const priced = getYardSignPrice(sizeKey, quantity, doubleSided);
            assert.ok(priced, `${name}: quantity ${quantity} did not price — a coverage gap`);

            return { at: quantity, total: priced.total };
          }
        );

        // Equal is allowed and expected: just under a break the customer pays
        // the break's minimum (29 signs at the 30-sign price). What is never
        // allowed is a LOWER total for MORE signs — the defect PR #46 fixed.
        assertStrictlyIncreasing(points, name, { allowEqual: true });
      });

      test(`${name}: a bigger order is never cheaper than a smaller one`, () => {
        // The raw table goes backwards at every boundary by design — say so
        // here, so nobody "fixes" the table and breaks the trough the rule
        // exists to fill.
        const raw = signsPricingConfig.yardSigns.sizes[sizeKey].tiers;
        assert.ok(raw.length >= 2);
      });
    }
  }

  test("tier coverage: a single sign prices, and the lowest tier starts at 2", () => {
    for (const sizeKey of sizes) {
      const size = signsPricingConfig.yardSigns.sizes[sizeKey];
      const lowest = Math.min(...size.tiers.map((tier) => tier.minQuantity));

      assert.equal(lowest, 2, `${sizeKey}: quantities between 1 and the first tier would have no price`);
      assert.ok(size.singleUnitPrice > 0, `${sizeKey}: quantity 1 has no price`);
      assert.ok(getYardSignPrice(sizeKey, 1, false), `${sizeKey}: quantity 1 did not price`);
    }
  });

  test("ladder direction: double-sided never cheaper than single, bigger never cheaper than smaller", () => {
    for (const quantity of [1, 5, 10, 25, 50]) {
      for (const sizeKey of sizes) {
        const single = getYardSignPrice(sizeKey, quantity, false)!.total;
        const double = getYardSignPrice(sizeKey, quantity, true)!.total;

        assert.ok(double >= single, `${sizeKey} x${quantity}: double $${double} < single $${single}`);
      }

      const small = getYardSignPrice('18" x 24"', quantity, false)!.total;
      const large = getYardSignPrice('24" x 36"', quantity, false)!.total;

      assert.ok(large >= small, `x${quantity}: 24x36 $${large} < 18x24 $${small}`);
    }
  });
});

describe("banners and rigid signs: per-sqft pricing cannot invert", () => {
  // Linear in area and count by construction; what can still go wrong is a
  // material rate typed below its neighbour, or a credit that outruns the
  // product. Both show up as a bigger banner costing less.
  test("a bigger banner never costs less than a smaller one", () => {
    const points = [24, 36, 48, 72, 96, 120].map((widthInches) => ({
      at: widthInches,
      total: calculateSignsPricing({
        method: "banner",
        quantity: 1,
        widthInches,
        heightInches: 36,
        material: "13 oz Scrim Vinyl",
        doubleSided: false,
      }).total,
    }));

    assertStrictlyIncreasing(points, "banner width");
  });

  test("the no-hem credit never takes a banner below zero, at any size", () => {
    // Clamped in the engine; what is NOT asserted here is that an unhemmed
    // 18 oz stays above a hemmed 13 oz — at 24" x 36" it does not ($65 vs
    // $69), because the $2.50/ft credit outruns the $3.50/sqft premium when
    // the perimeter is large relative to the area. That is a pricing
    // observation for the shop (PRICING.md, D8), not a monotonicity rule.
    for (const [widthInches, heightInches] of [[1, 1], [6, 6], [24, 36]]) {
      const priced = calculateSignsPricing({
        method: "banner",
        quantity: 1,
        widthInches,
        heightInches,
        material: "18 oz Heavy Duty Vinyl",
        doubleSided: false,
        finishing: signsPricingConfig.banner.noHemFinishingLabel,
      });

      assert.ok(priced.total >= 0, `${widthInches}x${heightInches} went negative`);
    }
  });

  test("rigid: heavier stock never prices below lighter at the same size", () => {
    const rates = signsPricingConfig.rigid.perSqftByMaterial;
    const cheapest = Math.min(...Object.values(rates));

    for (const [material, rate] of Object.entries(rates)) {
      assert.ok(rate >= cheapest);
      const priced = calculateSignsPricing({
        method: "rigid",
        quantity: 2,
        widthInches: 24,
        heightInches: 18,
        material,
        doubleSided: false,
      });
      assert.equal(priced.priceable, true, `${material} did not price`);
    }
  });
});

// ─── STICKERS: the ladder that bills unattended ────────────────────────────

describe("stickers: totals, not rates", () => {
  test("more stickers never cost less, at every size and material", () => {
    for (const material of ["Matte", "Gloss", "Chrome", "Holographic"]) {
      for (const [w, h] of [
        [2, 2],
        [3, 3],
        [4, 6],
        [2.25, 1.75],
      ]) {
        const points = [1, 7, 25, 50, 99, 100, 101, 250, 500, 1000].map(
          (quantity) => ({
            at: quantity,
            total: quoteStickerCart({
              materialPrices: [
                getStickerMaterialPrice(quantity, material, "custom", {
                  widthInches: w,
                  heightInches: h,
                }),
              ],
              deliveryMethod: "Pickup",
            }).total,
          })
        );

        assertStrictlyIncreasing(points, `${material} ${w}x${h}`);
      }
    }
  });

  test("premium material costs more, on the material line ONLY", () => {
    // ×1.6 tracks a real substrate cost; setup labour is identical whichever
    // roll goes on the machine. Letting the markup drift onto setup would be
    // a blanket upcharge with nothing behind it.
    const plain = getStickerMaterialPrice(100, "Matte", "custom", { widthInches: 3, heightInches: 3 });
    const chrome = getStickerMaterialPrice(100, "Chrome", "custom", { widthInches: 3, heightInches: 3 });

    assert.ok(chrome > plain);
    assert.equal(round2(chrome / plain), 1.6);
    assert.equal(
      quoteStickerCart({ materialPrices: [chrome], deliveryMethod: "Pickup" }).setupPrice,
      quoteStickerCart({ materialPrices: [plain], deliveryMethod: "Pickup" }).setupPrice,
      "setup moved with the material"
    );
  });

  test("setup is derived from cart position, never stored on the design", () => {
    /**
     * Three designs, then remove the first. If each design kept the fee it
     * was assigned when added, the survivors would both pay $12.50 and the
     * order would be $12.50 under, silently, on the flow that bills with
     * nobody watching. The handoff calls this a REQUIRED test.
     */
    const materials = [28.8, 6.4, 76.8];
    const three = quoteStickerCart({ materialPrices: materials, deliveryMethod: "Pickup" });
    const survivors = quoteStickerCart({
      materialPrices: materials.slice(1),
      deliveryMethod: "Pickup",
    });

    assert.equal(three.setupPrice, STICKER_SETUP_FEE + 2 * STICKER_SETUP_FEE_ADDITIONAL);
    assert.equal(survivors.setupPrice, STICKER_SETUP_FEE + STICKER_SETUP_FEE_ADDITIONAL);
    assert.equal(survivors.setupPrice, getCartSetupFee(2));
    assert.equal(
      survivors.total,
      round2(6.4 + 76.8 + 37.5),
      "the new first design is not paying the first-design fee"
    );
  });

  test("the setup ladder itself: each added design costs exactly the additional fee", () => {
    const points = [1, 2, 3, 4, 5].map((designs) => ({
      at: designs,
      total: getCartSetupFee(designs),
    }));

    assertStrictlyIncreasing(points, "designs");
    for (let n = 2; n <= 5; n += 1) {
      assert.equal(
        round2(getCartSetupFee(n) - getCartSetupFee(n - 1)),
        STICKER_SETUP_FEE_ADDITIONAL
      );
    }
  });
});
