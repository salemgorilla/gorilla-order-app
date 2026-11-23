/**
 * The white underbase is in the PRICE from the start, not only the minimum.
 *
 * Health check, 23 Nov 2026: with the apparel step opening on Black, 24
 * tees with a 1-colour front showed $394.60 (the 1-colour rate, one $25
 * screen) while the minimum notice already counted the underbase. Gabe's
 * rule (21 Nov, "Under base counts as a colors") makes that a 2-colour run.
 * The price only picked the underbase up once uploaded artwork had been
 * read, so a customer who emailed the file never saw it at all.
 *
 * The fix is one print spec (apparelPrintSpec) that the price, the minimum
 * and the validation all read. These tests hold the figures to the matrix
 * in lib/apparel-pricing-config.ts, and hold the 50 Hoodie Special, which
 * is flat priced and does not count its underbase, exactly where it was.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { quoteApparelCart, type ApparelCartLine } from "../lib/apparel-cart";
import { apparelPrintSpec } from "../lib/apparel-cart-lines";
import { apparelPricingConfig } from "../lib/apparel-pricing-config";
import { quoteHoodieSpecial } from "../lib/hoodie-special";
import { designColorCount, screenPrintMinimum } from "../lib/print-minimums";

/**
 * The blank in the health check's run: $394.60 − $108 print − $25 screen
 * = $261.60 for 24, so $10.90 a shirt at the 24 row's markup. Held fixed
 * across colours here so the only thing that can move the total is ink.
 */
const BLANK = 10.9;

const tees = (colorName: string, quantity = 24): ApparelCartLine => ({
  id: "line-1",
  garmentLabel: "Premium Soft Tee",
  colorName,
  garmentUnitPrice: BLANK,
  quantity,
});

const quoteFor = (garmentColor: string, inkColors = "1 color") => ({
  garmentColor,
  printLocations: ["Front"],
  inkColors,
  inkColorsByLocation: {} as Record<string, string>,
});

/** The 24–47 row of the matrix, read from the config, not retyped. */
const row24 = apparelPricingConfig.tiers.find((tier) => tier.minQuantity === 24)!;

describe("24 black tees, 1-colour front, no artwork uploaded", () => {
  const spec = apparelPrintSpec(quoteFor("Solid Black Blend"), []);
  const cart = quoteApparelCart([tees("Solid Black Blend")], spec);

  test("the underbase is on from the garment alone", () => {
    assert.equal(spec.hasUnderbase, true);
  });

  test("prices as 2 colours: $471.20, not the $394.60 it showed", () => {
    // 24 × the 2-colour cell + two $25 screens + the blank.
    const expected = 24 * row24.perPieceByColors[1] + 2 * 25 + 24 * BLANK;
    assert.equal(expected.toFixed(2), "471.20");
    assert.equal(cart.total.toFixed(2), "471.20");
    assert.equal(cart.printTotal.toFixed(2), "159.60");
    assert.equal(cart.setupTotal.toFixed(2), "50.00");
    assert.deepEqual(cart.colorsByLocation, [2]);
  });

  test("is the same figure as choosing 2 colours on a white shirt", () => {
    const white2 = quoteApparelCart(
      [tees("White")],
      apparelPrintSpec(quoteFor("White", "2 colors"), [])
    );
    assert.equal(cart.total.toFixed(2), white2.total.toFixed(2));
  });

  test("price and minimum read the same colour count", () => {
    assert.equal(designColorCount(spec), Math.max(...cart.colorsByLocation));
    assert.equal(screenPrintMinimum(designColorCount(spec)), 24);
  });

  test("2 inks on black: 3 colours in the price AND a 48 minimum", () => {
    const spec2 = apparelPrintSpec(quoteFor("Solid Black Blend", "2 colors"), []);
    const cart2 = quoteApparelCart([tees("Solid Black Blend", 48)], spec2);
    assert.deepEqual(cart2.colorsByLocation, [3]);
    assert.equal(screenPrintMinimum(designColorCount(spec2)), 48);
  });
});

describe("a light shirt does not change", () => {
  test("24 white tees, 1-colour front: still $394.60, one screen", () => {
    const spec = apparelPrintSpec(quoteFor("White"), []);
    const cart = quoteApparelCart([tees("White")], spec);

    assert.equal(spec.hasUnderbase, false);
    assert.equal(cart.total.toFixed(2), "394.60");
    assert.equal(cart.setupTotal.toFixed(2), "25.00");
    assert.equal(screenPrintMinimum(designColorCount(spec)), 12);
  });

  test("white tees plus black hoodies still prices the run with it", () => {
    const spec = apparelPrintSpec(quoteFor("White"), [
      { id: "g1", productId: "hoodie", colorName: "Black", quantity: 12 },
    ]);
    assert.equal(spec.hasUnderbase, true);
  });
});

describe("the 50 Hoodie Special stays flat", () => {
  for (const colorName of ["Black", "Dark Navy", "White"]) {
    test(`${colorName}: $27 front, $33 front and back, underbase or not`, () => {
      const front = quoteHoodieSpecial({
        quantity: 50,
        colorName,
        printLocations: ["Front"],
        sizeBreakdown: "M-25, L-25",
      });
      const both = quoteHoodieSpecial({
        quantity: 50,
        colorName,
        printLocations: ["Front", "Back"],
        sizeBreakdown: "M-25, L-25",
      });

      assert.equal(front.unitPrice, 27);
      assert.equal(front.total, 1350);
      assert.equal(both.unitPrice, 33);
      assert.equal(both.total, 1650);
      assert.equal(both.setupTotal, 0);
      assert.equal(both.underbaseFeePerPiece, 0);
    });
  }
});
