/**
 * INK IS A QUESTION PER PLACEMENT, NOT PER ORDER.
 *
 * Gabe, 2026-09-07: "Each location should offer options for print color
 * amount. An order could be: Front is 2 color, back is 1, for example."
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
 * One ink count covered the whole order, so a two-colour front forced the
 * back to two colours as well. The customer paid for a screen that was never
 * burned ($25) and a print rate one column too far along the matrix, on
 * every job with an uneven design — which is most of them.
 *
 * ── THE RULE THIS FILE EXISTS FOR ─────────────────────────────────────────
 * The generalisation had to be EXACT, not merely similar. The old engine
 * computed `perPiece(colors) × locations` and `colors × locations × $25`;
 * the new one sums per location. With every location on the same count those
 * are the same arithmetic, so no existing quote may move by a cent —
 * tests/apparel-price-sheet.test.ts holds 66 committed totals to that, and
 * the first describe below states the equivalence directly.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { apparelPricingConfig } from "../lib/apparel-pricing-config";
import {
  calculateApparelPricing,
  describeInkColors,
  locationColorCounts,
  printPerPieceOneLocation,
  tierFor,
} from "../lib/apparel-pricing";
import { quoteApparelCart } from "../lib/apparel-cart";

const TEE = 6.23;

function price(input: {
  printLocations: string[];
  inkColors: string;
  inkColorsByLocation?: Record<string, string>;
  hasUnderbase?: boolean;
  quantity?: number;
}) {
  return calculateApparelPricing({
    quantity: input.quantity ?? 24,
    garmentUnitPrice: TEE,
    printLocations: input.printLocations,
    inkColors: input.inkColors,
    inkColorsByLocation: input.inkColorsByLocation,
    hasUnderbase: input.hasUnderbase ?? false,
  });
}

describe("an order that does not use this prices exactly as before", () => {
  /**
   * The safety property. Anything here failing means a live quote moved.
   */
  for (const locations of [["Front"], ["Front", "Back"]]) {
    for (const ink of ["1 color", "2 colors", "4 colors"]) {
      test(`${locations.length} location(s), ${ink}`, () => {
        const withoutOverrides = price({ printLocations: locations, inkColors: ink });

        // The old formula, written out: one cell times the location count,
        // and one colour count times the locations times $25.
        const tier = tierFor(24);
        const colors = Number(ink[0]);
        const expectedPrintUnit =
          printPerPieceOneLocation(tier, colors) * locations.length;
        const expectedSetup =
          colors * locations.length * apparelPricingConfig.setupFeePerColorPerLocation;

        assert.equal(withoutOverrides.printUnitPrice, expectedPrintUnit);
        assert.equal(withoutOverrides.setupTotal, expectedSetup);
      });
    }
  }

  test("an override equal to the default changes nothing", () => {
    const plain = price({ printLocations: ["Front", "Back"], inkColors: "2 colors" });
    const spelled = price({
      printLocations: ["Front", "Back"],
      inkColors: "2 colors",
      inkColorsByLocation: { Front: "2 colors", Back: "2 colors" },
    });

    assert.deepEqual(spelled, plain);
  });

  test("an override for a location that is not being printed is ignored", () => {
    const front = price({ printLocations: ["Front"], inkColors: "1 color" });
    const stale = price({
      printLocations: ["Front"],
      inkColors: "1 color",
      // Left behind after unticking Back — it must not be charged for.
      inkColorsByLocation: { Back: "4 colors" },
    });

    assert.deepEqual(stale, front);
  });
});

describe("Gabe's example: front 2 colours, back 1", () => {
  const mixed = price({
    printLocations: ["Front", "Back"],
    inkColors: "1 color",
    inkColorsByLocation: { Front: "2 colors" },
  });

  const tier = tierFor(24);

  test("each placement is charged at its own matrix cell", () => {
    assert.equal(
      mixed.printUnitPrice,
      printPerPieceOneLocation(tier, 2) + printPerPieceOneLocation(tier, 1)
    );
  });

  test("screens are the colours across the job — three, not four", () => {
    assert.equal(
      mixed.setupTotal,
      3 * apparelPricingConfig.setupFeePerColorPerLocation
    );
  });

  test("and it costs LESS than forcing both to two colours", () => {
    // The whole point. Before this the customer had no way to express the
    // cheaper job, so they were quoted the dearer one.
    const forced = price({ printLocations: ["Front", "Back"], inkColors: "2 colors" });

    assert.ok(
      mixed.total < forced.total,
      `${mixed.total} should be under ${forced.total}`
    );
    // One screen's difference, exactly.
    assert.equal(
      forced.setupTotal - mixed.setupTotal,
      apparelPricingConfig.setupFeePerColorPerLocation
    );
  });

  test("but more than one colour on both", () => {
    const cheapest = price({ printLocations: ["Front", "Back"], inkColors: "1 color" });
    assert.ok(mixed.total > cheapest.total);
  });
});

describe("the underbase is per placement, because each one needs its own", () => {
  test("a dark shirt printed twice burns two underbase screens", () => {
    const counts = locationColorCounts({
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      inkColorsByLocation: { Front: "2 colors" },
      hasUnderbase: true,
    });

    assert.deepEqual(counts, [3, 2]);
  });

  test("the catalogue's top option plus an underbase is six, not the cap", () => {
    // "5+ colors / Full color / Not sure" parses to 5 (getInkColorCount), so
    // a dark shirt is six screens at that placement. Asserted because the
    // obvious guess is that "5+" means the maximum, and it does not — the
    // shop quotes anything past five by hand.
    assert.deepEqual(
      locationColorCounts({
        printLocations: ["Front"],
        inkColors: "5+ colors / Full color / Not sure",
        hasUnderbase: true,
        inkColorsByLocation: {},
      }),
      [6]
    );
  });

  test("and nothing can push a location past the screen limit", () => {
    // The cap is not reachable from the catalogue today; it is reachable
    // from a payload, which is where a stale or hand-edited label arrives.
    assert.deepEqual(
      locationColorCounts({
        printLocations: ["Front"],
        inkColors: "7 colors",
        hasUnderbase: true,
        inkColorsByLocation: {},
      }),
      [apparelPricingConfig.maxColorsPerLocation]
    );
  });
});

describe("the cart engine takes the same spec", () => {
  test("a mixed-ink cart matches the single-garment engine", () => {
    const cart = quoteApparelCart(
      [{ id: "l1", garmentLabel: "Basic Tee", colorName: "White", garmentUnitPrice: TEE, quantity: 24 }],
      {
        printLocations: ["Front", "Back"],
        inkColors: "1 color",
        inkColorsByLocation: { Front: "2 colors" },
        hasUnderbase: false,
      }
    );

    const single = price({
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      inkColorsByLocation: { Front: "2 colors" },
    });

    assert.equal(cart.total, single.total);
    assert.equal(cart.setupTotal, single.setupTotal);
    assert.deepEqual(cart.colorsByLocation, [2, 1]);
  });
});

describe("what the shop reads back", () => {
  test("a uniform order keeps the string it always had", () => {
    // Every order predating this feature, and every order that does not use
    // it — the quote email and Printavo description must not change shape.
    assert.equal(
      describeInkColors({
        printLocations: ["Front", "Back"],
        inkColors: "2 colors",
        inkColorsByLocation: {},
      }),
      "2 colors"
    );
  });

  test("a mixed order names each placement", () => {
    assert.equal(
      describeInkColors({
        printLocations: ["Front", "Back"],
        inkColors: "1 color",
        inkColorsByLocation: { Front: "2 colors" },
      }),
      "Front 2 colors · Back 1 color"
    );
  });

  test("overrides that all agree still read as one figure", () => {
    assert.equal(
      describeInkColors({
        printLocations: ["Front", "Back"],
        inkColors: "1 color",
        inkColorsByLocation: { Front: "3 colors", Back: "3 colors" },
      }),
      "3 colors"
    );
  });
});
