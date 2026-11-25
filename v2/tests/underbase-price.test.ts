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
import { readFileSync } from "node:fs";

import { apparelPrintSpec } from "../lib/apparel-cart-lines";
import { apparelCatalog } from "../lib/apparel";
import { isLightGarment, OFF_WHITE_NAMES } from "../lib/light-garments";
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

  test("prices as 2 colours: $477.50 (was $471.20 before the 3% retail uplift), not the 1-colour figure it showed", () => {
    // 24 × the 2-colour cell + two $25 screens + the blank.
    // Retail (+3%, 2026-11-11): the cell and the screen fee both carry the 3%.
    const expected = 24 * row24.perPieceByColors[1] + 2 * apparelPricingConfig.setupFeePerColorPerLocation + 24 * BLANK;
    assert.equal(expected.toFixed(2), "477.50");
    assert.equal(cart.total.toFixed(2), "477.50");
    assert.equal(cart.printTotal.toFixed(2), "164.40");
    assert.equal(cart.setupTotal.toFixed(2), "51.50");
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
  test("24 white tees, 1-colour front: still the 1-colour figure, $398.71 retail, one screen", () => {
    const spec = apparelPrintSpec(quoteFor("White"), []);
    const cart = quoteApparelCart([tees("White")], spec);

    assert.equal(spec.hasUnderbase, false);
    assert.equal(cart.total.toFixed(2), "398.71");
    assert.equal(cart.setupTotal.toFixed(2), "25.75");
    assert.equal(screenPrintMinimum(designColorCount(spec)), 12);
  });

  test("Solid White Blend is white too: no underbase, 1-colour minimum", () => {
    // The Premium Soft Tee has no colour named plain "White".
    const spec = apparelPrintSpec(quoteFor("Solid White Blend"), []);
    const cart = quoteApparelCart([tees("Solid White Blend")], spec);
    assert.equal(spec.hasUnderbase, false);
    assert.equal(cart.total.toFixed(2), "398.71");
    assert.equal(screenPrintMinimum(designColorCount(spec)), 12);
  });

  test("white, off-white, Ash, Natural and Sand price like white", () => {
    // Gabe, 23 Nov: "the only ones that aren't dark and would be considered
    // light is ash. White, natural," and "If there's an off-white, that
    // would be considered light." and "Sand is light".
    for (const name of ["Ash", "Natural", "Heather Natural", "Heather Soft Cream", "Heather French Vanilla", "Sand"]) {
      const spec = apparelPrintSpec(quoteFor(name), []);
      const cart = quoteApparelCart([tees(name)], spec);
      assert.equal(spec.hasUnderbase, false, name);
      assert.equal(cart.total.toFixed(2), "398.71", name);
      assert.equal(screenPrintMinimum(designColorCount(spec)), 12, name);
    }
  });

  test("which names read as light, and which as dark", () => {
    for (const name of [
      "White", "Solid White Blend", "PFD White", "white", "White/Black",
      "Off White", "Off-White", "Ivory", "Cream", "Heather Soft Cream",
      "Heather French Vanilla", "Ash", "ash ", "Ash Grey", "Natural",
      "Heather Natural", "Heather Prism Natural", "Sand", "Heather Sand Dune",
    ]) {
      assert.equal(isLightGarment(name), true, name);
    }
    for (const name of [
      "Solid Black Blend", "Black/White", "Black", "Navy", "Heather Navy",
      "Sport Grey", "Athletic Heather", "Heather Gray", "Ice Grey", "Heather Cement",
      "Light Pink", "Light Blue", "Heather Mint", "Heather Oatmeal",
      "Cornsilk", "Charcoal", "Dark Grey Heather", "Heather Red", "Royal",
      "Neon Yellow", "Safety Green", "Whitewater Blue", "Solid Asphalt Blend",
      "Custom / Not Sure", "",
    ]) {
      assert.equal(isLightGarment(name), false, name);
    }
  });

  test("exactly these catalogue colours are light today", () => {
    // Pins the live S&S names so a change to the rule shows up as a diff.
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/ss-color-names-2026-11-21.json", import.meta.url), "utf8")
    ) as { styles: Record<string, string[]> };
    const names = [...new Set([...Object.values(fixture.styles).flat(), ...apparelCatalog.garmentColors])];
    assert.deepEqual(names.filter(isLightGarment).sort(), [
      "Ash", "Heather French Vanilla", "Heather Natural", "Heather Prism Natural",
      "Heather Sand Dune", "Heather Soft Cream", "Natural", "PFD White", "Sand",
      "Solid White Blend", "White",
    ]);
    for (const name of OFF_WHITE_NAMES) assert.ok(names.includes(name), name);
  });

  test("white tees plus black hoodies still prices the run with it", () => {
    const spec = apparelPrintSpec(quoteFor("White"), [
      { id: "g1", productId: "hoodie", colorName: "Black", quantity: 12 },
    ]);
    assert.equal(spec.hasUnderbase, true);
  });
});

describe("Sport Grey prices as dark (Gabe, 23 Nov: \"Make Sport Grey dark\")", () => {
  test("24 Sport Grey tees, 1-colour front: underbase, $477.50, 24 minimum", () => {
    const spec = apparelPrintSpec(quoteFor("Sport Grey"), []);
    const cart = quoteApparelCart([tees("Sport Grey")], spec);
    assert.equal(spec.hasUnderbase, true);
    assert.equal(cart.total.toFixed(2), "477.50");
    assert.equal(screenPrintMinimum(designColorCount(spec)), 24);
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
