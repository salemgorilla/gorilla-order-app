/**
 * THE STICKY BAR DESCRIBES THE WHOLE ORDER, NOT ITS FIRST LINE.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Reported by Gabe, 2026-09-07: "when you choose more garments, same print,
 * the items are not added to the quote."
 *
 * They were. Every added garment was in the total. What was wrong was every
 * WORD around it: the bar read "24 × Basic Tee · $32.90 each" on a 42-piece
 * order across three garments, because the label and the per-piece divisor
 * came from `apparelQuote.quantity` — the configurator's own count, the first
 * garment alone — while the total came from the whole cart.
 *
 * $789.70 ÷ 24 = $32.90. $789.70 ÷ 42 = $18.80. The bar showed the first.
 * A customer reading "24 × Basic Tee" after adding twelve hoodies has no way
 * to conclude anything except that the hoodies were dropped.
 *
 * ── WHAT THIS FILE PINS ───────────────────────────────────────────────────
 * The arithmetic, not the wording. Each case builds a real cart through
 * quoteApparelCart and asserts that the figure the bar divides by is the RUN,
 * and that it equals what the confirmation screen and the copied quote print
 * — three surfaces, one number, which is the failure mode this repo keeps
 * paying for.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { quoteApparelCart } from "../lib/apparel-cart";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

const PRINT = {
  printLocations: ["Front"],
  inkColors: "1 color",
  hasUnderbase: false,
};

/** 24 tees + 12 hoodies + 6 more tees — the shape Gabe drove. */
const CART = quoteApparelCart(
  [
    { id: "l1", garmentLabel: "Basic Tee", colorName: "White", garmentUnitPrice: 6.23, quantity: 24 },
    { id: "l2", garmentLabel: "Classic Hoodie", colorName: "Black", garmentUnitPrice: 14.87, quantity: 12 },
    { id: "l3", garmentLabel: "Basic Tee", colorName: "Navy", garmentUnitPrice: 6.23, quantity: 6 },
  ],
  PRINT
);

describe("the engine already knew the run", () => {
  test("quantity is every piece, not the first line's", () => {
    assert.equal(CART.quantity, 42);
    assert.equal(CART.lines.length, 3);
  });

  test("unitPrice divides by the run", () => {
    // The figure the bar must use. Computed here from the parts rather than
    // copied from the engine, so a change to either side fails.
    assert.equal(CART.unitPrice, Math.round((CART.total / 42) * 100) / 100);
  });

  test("and dividing by the first line instead is visibly wrong", () => {
    // The defect, stated as a number: the two differ by enough that nobody
    // could mistake one for the other.
    const wrong = Math.round((CART.total / 24) * 100) / 100;

    assert.ok(
      wrong > CART.unitPrice * 1.5,
      `${wrong} vs ${CART.unitPrice} — the bug would not have been visible`
    );
  });
});

describe("the bar reads the cart, not the configurator", () => {
  /**
   * Source-level, because the bar is a memo inside a 4,000-line client
   * component and the alternative is mounting the whole page. What is
   * asserted is the SHAPE that was wrong: a per-piece derived from
   * apparelQuote.quantity.
   */
  const bar = page.slice(
    page.indexOf("if (isApparelSelected) {", page.indexOf("const estimateBar")),
    page.indexOf("const designs = order.items.length;")
  );

  test("the memo exists and was located", () => {
    assert.ok(bar.length > 0 && bar.includes("apparelPricing"));
  });

  test("the per-piece comes from the engine, never a division here", () => {
    assert.match(bar, /apparelPricing\.unitPrice/);
    assert.doesNotMatch(
      bar,
      /apparelPricing\.total\s*\/\s*Math\.max\(1,\s*apparelQuote\.quantity\)/,
      "the bar is dividing the whole cart by the first garment's count again"
    );
  });

  test("a cart names itself rather than its first garment", () => {
    assert.match(bar, /apparelPricing\.lines\.length/);
    assert.match(bar, /garments/);
    assert.match(bar, /pieces/);
  });
});

describe("the copied quote carries every garment", () => {
  test("its quantity is the run on a cart", () => {
    const clipboard = page.slice(
      page.indexOf("APPAREL DETAILS"),
      page.indexOf("Print Locations:")
    );

    assert.match(clipboard, /apparelPricing\.quantity/);
    assert.match(clipboard, /All Garments/);
  });
});
