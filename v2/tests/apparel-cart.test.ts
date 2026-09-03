/**
 * The apparel cart — several garments in one quote.
 *
 * The first describe block is the load-bearing one: a ONE-LINE cart must
 * price exactly as the single-garment configurator does today, or the
 * committed price sheet and the audit driver stop describing the product.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  apparelCartRules,
  combinedTierQuantity,
  describeCartSaving,
  quoteApparelCart,
  type ApparelCartLine,
} from "../lib/apparel-cart";
import { calculateApparelPricing } from "../lib/apparel-pricing";

const FRONT_ONE_COLOR = {
  printLocations: ["Front"],
  inkColors: "1 color",
  hasUnderbase: false,
};

const line = (
  id: string,
  garmentUnitPrice: number,
  quantity: number
): ApparelCartLine => ({
  id,
  garmentLabel: `Garment ${id}`,
  colorName: "White",
  garmentUnitPrice,
  quantity,
});

describe("THE INVARIANT: one line prices exactly as today", () => {
  /**
   * The audit's standing example — 24 Starter Tees at $3.49, front, one
   * colour — is $252.76 on the committed price sheet and was reconciled
   * on screen in Chromium. A cart of one must not move it by a cent.
   */
  test("24 tees at $3.49 is still $252.76", () => {
    const cart = quoteApparelCart([line("a", 3.49, 24)], FRONT_ONE_COLOR);

    assert.equal(cart.total.toFixed(2), "252.76");
    assert.equal(cart.garmentTotal.toFixed(2), "83.76");
    assert.equal(cart.printTotal.toFixed(2), "144.00");
    assert.equal(cart.setupTotal.toFixed(2), "25.00");
  });

  test("and matches the engine directly, across the whole grid", () => {
    // Not one example: every tier boundary, both ink counts, both
    // location counts. A cart of one IS the old flow.
    for (const quantity of [1, 23, 24, 49, 50, 99, 100, 249, 250]) {
      for (const inkColors of ["1 color", "3 colors"]) {
        for (const printLocations of [["Front"], ["Front", "Back"]]) {
          const spec = { printLocations, inkColors, hasUnderbase: false };
          const cart = quoteApparelCart([line("a", 4.1, quantity)], spec);
          const direct = calculateApparelPricing({
            quantity,
            garmentUnitPrice: 4.1,
            ...spec,
          });

          assert.equal(
            cart.total.toFixed(2),
            direct.total.toFixed(2),
            `${quantity} @ ${inkColors} ${printLocations.length}loc`
          );
        }
      }
    }
  });
});

describe("several garments, one run", () => {
  const twoLines = [line("tee", 3.49, 20), line("hoodie", 14.0, 20)];

  test("the print tier is read from the COMBINED count", () => {
    // 20 + 20 is a 40-piece run: the 24+ rate ($6.00), not the under-24
    // rate ($8.00) charged twice. This is what the press actually does.
    const cart = quoteApparelCart(twoLines, FRONT_ONE_COLOR);

    assert.equal(cart.quantity, 40);
    assert.equal(cart.printUnitPrice.toFixed(2), "6.00");
    assert.equal(cart.printTotal.toFixed(2), "240.00");
  });

  test("setup is charged ONCE — the same screens print both", () => {
    const cart = quoteApparelCart(twoLines, FRONT_ONE_COLOR);

    assert.equal(apparelCartRules.shareSetupAcrossLines, true);
    assert.equal(cart.setupTotal.toFixed(2), "25.00");
  });

  test("each line keeps its own garment total", () => {
    const cart = quoteApparelCart(twoLines, FRONT_ONE_COLOR);

    assert.equal(cart.lines[0].garmentTotal.toFixed(2), "69.80");
    assert.equal(cart.lines[1].garmentTotal.toFixed(2), "280.00");
    assert.equal(cart.garmentTotal.toFixed(2), "349.80");
  });

  test("the grand total is the three parts, to the cent", () => {
    const cart = quoteApparelCart(twoLines, FRONT_ONE_COLOR);

    assert.equal(cart.total.toFixed(2), "614.80");
    assert.equal(
      (cart.garmentTotal + cart.printTotal + cart.setupTotal).toFixed(2),
      cart.total.toFixed(2)
    );
  });

  test("ordering together beats ordering separately", () => {
    // The reason the cart exists, as arithmetic: separately, each 20-piece
    // run pays the under-24 print rate AND its own screens.
    const together = quoteApparelCart(twoLines, FRONT_ONE_COLOR).total;
    const apart =
      quoteApparelCart([twoLines[0]], FRONT_ONE_COLOR).total +
      quoteApparelCart([twoLines[1]], FRONT_ONE_COLOR).total;

    assert.ok(together < apart, `${together} should beat ${apart}`);
    assert.equal((apart - together).toFixed(2), "105.00");
  });

  test("the saving is named for the screen, not left implied", () => {
    assert.match(
      describeCartSaving(quoteApparelCart(twoLines, FRONT_ONE_COLOR)) ?? "",
      /One set of screens covers all 2 garments/
    );
  });

  test("a single-line cart claims no saving", () => {
    assert.equal(
      describeCartSaving(quoteApparelCart([line("a", 3.49, 24)], FRONT_ONE_COLOR)),
      null
    );
  });
});

describe("empty and edge carts", () => {
  test("an empty cart is ZERO — no phantom shirt, no screens", () => {
    /**
     * This test found a real defect. The pricing engine floors quantity at
     * 1 (so a real order never divides by zero), which meant an empty cart
     * quoted one shirt's print rate plus a full set of screens: $33 for an
     * order containing nothing. Nothing ordered is nothing owed.
     */
    const cart = quoteApparelCart([], FRONT_ONE_COLOR);

    assert.equal(cart.quantity, 0);
    assert.equal(cart.total, 0);
    assert.equal(cart.setupTotal, 0);
    assert.equal(cart.printTotal, 0);
    assert.equal(cart.unitPrice, 0);
    assert.equal(cart.lines.length, 0);
  });

  test("a cart of only zero-quantity lines is also zero", () => {
    const cart = quoteApparelCart(
      [line("a", 3.49, 0), line("b", 14, 0)],
      FRONT_ONE_COLOR
    );

    assert.equal(cart.total, 0);
  });

  test("zero-quantity lines drop out rather than distorting the tier", () => {
    const cart = quoteApparelCart(
      [line("a", 3.49, 24), line("b", 14, 0)],
      FRONT_ONE_COLOR
    );

    assert.equal(cart.lines.length, 1);
    assert.equal(cart.quantity, 24);
    assert.equal(cart.total.toFixed(2), "252.76");
  });

  test("the next tier is named so the screen can offer it", () => {
    assert.equal(combinedTierQuantity(quoteApparelCart([line("a", 4, 40)], FRONT_ONE_COLOR)), 50);
    assert.equal(combinedTierQuantity(quoteApparelCart([line("a", 4, 400)], FRONT_ONE_COLOR)), null);
  });
});
