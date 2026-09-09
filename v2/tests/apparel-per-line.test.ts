/**
 * A PER-PIECE FIGURE FOR EACH GARMENT, NOT ONE AVERAGE FOR THE CART.
 *
 * Gabe, 2026-09-09: "I want the price per item to show for each item. If
 * there are two different items in the print run, they each need the cost
 * per item shown separately."
 *
 * The quote's `unitPrice` is total ÷ pieces. On 24 tees and 12 hoodies that
 * is a figure describing NEITHER garment — every tee is cheaper than it and
 * every hoodie dearer. The sticker cart and the signs cart have both been
 * fixed for exactly this shape already, with the same note: an average of
 * things that do not average reads as a real per-item figure the customer
 * can quote back at the shop.
 *
 * What is pinned here is the arithmetic, because the screens are only worth
 * as much as it: the per-garment figures must come back to the engine's
 * total, and the difference between two garments must be exactly the
 * difference between their blanks — nothing else.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { quoteApparelCart, withApparelRush } from "../lib/apparel-cart";
import {
  apparelEachVaries,
  apparelLineEach,
  apparelSharedPerPiece,
} from "../lib/apparel-per-line";

const PRINT = {
  printLocations: ["Front"],
  inkColors: "1 color",
  hasUnderbase: false,
};

/** A tee line and a hoodie line, at real blank prices. */
const TEE = {
  id: "tee",
  garmentLabel: "Basic Tee",
  colorName: "White",
  garmentPriceByMarkup: { "150": 5.24, "140": 5.0, "130": 4.75 },
  quantity: 24,
};

const HOODIE = {
  id: "hoodie",
  garmentLabel: "Classic Hoodie",
  colorName: "Black",
  garmentPriceByMarkup: { "150": 22.31, "140": 21.3, "130": 20.24 },
  quantity: 12,
};

describe("two garments, two figures", () => {
  const quote = quoteApparelCart([TEE, HOODIE], PRINT);
  const lines = apparelLineEach(quote);

  test("each garment gets its own", () => {
    assert.equal(lines.length, 2);
    assert.notEqual(
      lines[0].unitPrice,
      lines[1].unitPrice,
      "a tee and a hoodie came out at the same figure"
    );
  });

  test("the hoodie is dearer by exactly its blank, and by nothing else", () => {
    // Printing is per piece at one rate — the press does not care which
    // garment is under the platen — and setup is one set of screens shared
    // over every piece. So the ONLY thing that may separate the two figures
    // is the blank. Anything else means a component is being charged twice
    // to one garment.
    const [tee, hoodie] = lines;

    assert.equal(
      Math.round((hoodie.unitPrice - tee.unitPrice) * 100),
      Math.round((hoodie.garmentUnitPrice - tee.garmentUnitPrice) * 100)
    );
  });

  test("neither figure is the cart's blended average", () => {
    // The whole point. `unitPrice` on the quote describes no garment in it.
    assert.ok(lines[0].unitPrice < quote.unitPrice);
    assert.ok(lines[1].unitPrice > quote.unitPrice);
  });

  test("the figures come back to the engine's total", () => {
    // Rounding to the cent for display can drift by a cent or two on a run
    // whose setup does not divide evenly (25 ÷ 36). A cent per PIECE is the
    // tolerance; anything wider means a component was missed.
    const summed = lines.reduce(
      (total, line) => total + line.unitPrice * line.quantity,
      0
    );

    assert.ok(
      Math.abs(summed - quote.total) <= quote.quantity * 0.01,
      `${summed.toFixed(2)} vs ${quote.total.toFixed(2)}`
    );
  });
});

describe("what every piece pays whatever it is", () => {
  test("everything the engine charged that is not a garment", () => {
    const quote = quoteApparelCart([TEE, HOODIE], PRINT);
    const shared = apparelSharedPerPiece(quote);

    // Derived from the total, so it cannot miss a component — see the
    // never-pay-more test below for what missing one cost.
    assert.equal(
      Math.round(shared * 10000),
      Math.round(((quote.total - quote.garmentTotal) / quote.quantity) * 10000)
    );
  });

  test("NEVER-PAY-MORE: the print charge is not printUnitPrice × pieces", () => {
    /**
     * THE BUG THIS FILE SHIPPED WITH FOR AN HOUR, caught in a browser and
     * not by a fixture.
     *
     * printTotal is printUnitPrice × printTierQuantity. When a 36-piece run
     * is charged at the 48-piece rate because that costs less
     * (lib/apparel-pricing.ts), printUnitPrice × 36 is $72 short of what
     * the customer was quoted — and the per-garment figures summed $72.12
     * under the total on screen.
     *
     * Two colours over 36 pieces is the real configuration that did it.
     */
    // The real configuration that did it: two inks on a coloured garment,
    // so the underbase makes three, over 36 pieces — charged at the
    // 48-piece rate because that costs less.
    const quote = quoteApparelCart([TEE, HOODIE], {
      ...PRINT,
      inkColors: "2 colors",
      hasUnderbase: true,
    });

    assert.ok(
      quote.printTierQuantity > quote.quantity,
      "fixture no longer exercises never-pay-more"
    );
    assert.notEqual(
      Math.round(quote.printUnitPrice * quote.quantity * 100),
      Math.round(quote.printTotal * 100),
      "fixture no longer separates the tier count from the run"
    );

    const lines = apparelLineEach(quote);
    const summed = lines.reduce(
      (total, line) => total + line.unitPrice * line.quantity,
      0
    );

    assert.ok(
      Math.abs(summed - quote.total) <= quote.quantity * 0.01,
      `${summed.toFixed(2)} vs ${quote.total.toFixed(2)} — the tier rate was missed`
    );
  });

  test("rush rides with it, so the figures still reach the total", () => {
    // Rush is charged on the goods and lands in the total. A per-piece
    // figure that ignored it would sum short of the number the customer is
    // shown — the same class of gap that invoiced a rushed signs cart
    // $163.75 under its own quote.
    const base = quoteApparelCart([TEE, HOODIE], PRINT);
    const rushed = withApparelRush(base, {
      needBy: "2026-09-20",
      lane: "slow",
      today: "2026-09-09",
    });

    assert.ok((rushed.rushFee ?? 0) > 0, "fixture is not a rush order");

    const lines = apparelLineEach(rushed);
    const summed = lines.reduce(
      (total, line) => total + line.unitPrice * line.quantity,
      0
    );

    assert.ok(
      Math.abs(summed - rushed.total) <= rushed.quantity * 0.01,
      `${summed.toFixed(2)} vs ${rushed.total.toFixed(2)}`
    );
  });

  test("an empty quote prices nothing", () => {
    const empty = quoteApparelCart([], PRINT);

    assert.deepEqual(apparelLineEach(empty), []);
    assert.equal(apparelSharedPerPiece(empty), 0);
  });
});

describe("one garment still gets one figure", () => {
  test("a single line equals the quote's own unit price", () => {
    // The invariant that keeps the single-garment screens unchanged: with
    // one line, per-line and per-cart are the same question.
    const quote = quoteApparelCart([TEE], PRINT);
    const [only] = apparelLineEach(quote);

    assert.equal(only.unitPrice, quote.unitPrice);
  });

  test("a line nobody ordered is left out", () => {
    const quote = quoteApparelCart([TEE, { ...HOODIE, quantity: 0 }], PRINT);

    assert.equal(apparelLineEach(quote).length, 1);
  });
});

describe("the screens only list them when they differ", () => {
  test("two garments at the same blank produce one figure, not two", () => {
    // Printing the identical figure twice is noise dressed as detail.
    const quote = quoteApparelCart(
      [TEE, { ...TEE, id: "tee-2", colorName: "Black", quantity: 12 }],
      PRINT
    );

    assert.equal(apparelEachVaries(apparelLineEach(quote)), false);
  });

  test("a tee and a hoodie do", () => {
    const quote = quoteApparelCart([TEE, HOODIE], PRINT);

    assert.equal(apparelEachVaries(apparelLineEach(quote)), true);
  });

  test("one line never varies", () => {
    const quote = quoteApparelCart([TEE], PRINT);

    assert.equal(apparelEachVaries(apparelLineEach(quote)), false);
  });
});

describe("a worked example, in figures a human can check", () => {
  test("24 tees and 12 hoodies", () => {
    const quote = quoteApparelCart([TEE, HOODIE], PRINT);
    const [tee, hoodie] = apparelLineEach(quote);
    const shared = apparelSharedPerPiece(quote);

    // Committed so a repricing shows up as a readable diff here, the way
    // tests/price-sheet.test.ts does for the totals.
    assert.equal(quote.quantity, 36);
    assert.equal(tee.quantity, 24);
    assert.equal(hoodie.quantity, 12);

    assert.equal(
      tee.unitPrice,
      Math.round((tee.garmentUnitPrice + shared) * 100) / 100
    );
    assert.equal(
      hoodie.unitPrice,
      Math.round((hoodie.garmentUnitPrice + shared) * 100) / 100
    );

    // And the blended figure sits between them, which is precisely why it
    // cannot be shown as either.
    assert.ok(tee.unitPrice < quote.unitPrice);
    assert.ok(quote.unitPrice < hoodie.unitPrice);
  });
});
