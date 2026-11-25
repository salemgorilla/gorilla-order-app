/**
 * Minimum pieces by ink colours — Gabe, 2026-11-21: 1 colour 12, 2 colours
 * 24, 3 and up 48, per design; embroidery 6. lib/print-minimums.ts.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  EMBROIDERY_MINIMUM,
  designColorCount,
  screenPrintMinimum,
  screenPrintMinimumMessage,
} from "../lib/print-minimums";
import { getApparelFieldErrors, getApparelValidationSummary } from "../lib/validation";
import { apparelCatalog } from "../lib/apparel";

const TODAY = "2026-11-21";

const order = {
  customer: { customerName: "Dana Test", email: "dana@example.com" },
  artwork: { file: { name: "art.png" } },
  production: { needBy: "2027-02-01" },
};

const quote = (overrides: Partial<Parameters<typeof getApparelFieldErrors>[0]> = {}) => ({
  specialOrder: false,
  specialOrderNotes: "",
  quantity: 24,
  printLocations: ["Front"],
  inkColors: "1 color",
  inkColorsByLocation: {},
  ...overrides,
});

describe("the table", () => {
  test("1 colour 12, 2 colours 24, 3 and up 48", () => {
    assert.equal(screenPrintMinimum(1), 12);
    assert.equal(screenPrintMinimum(2), 24);
    assert.equal(screenPrintMinimum(3), 48);
    assert.equal(screenPrintMinimum(4), 48);
    assert.equal(screenPrintMinimum(7), 48);
  });

  test("every ink option on the form maps to Gabe's numbers", () => {
    const expected: Record<string, number> = {
      "1 color": 12,
      "2 colors": 24,
      "3 colors": 48,
      "4 colors": 48,
      "5+ colors / Full color / Not sure": 48,
    };
    for (const label of apparelCatalog.inkColors) {
      assert.equal(
        screenPrintMinimum(designColorCount({ printLocations: ["Front"], inkColors: label })),
        expected[label],
        label
      );
    }
  });

  test("embroidery is 6", () => {
    assert.equal(EMBROIDERY_MINIMUM, 6);
  });
});

describe("the design's colour count", () => {
  test("the most colours on any one placement, not the sum", () => {
    // Gabe's own example: "Front is 2 color, back is 1" is a 2-colour design.
    assert.equal(
      designColorCount({
        printLocations: ["Front", "Back"],
        inkColors: "1 color",
        inkColorsByLocation: { Front: "2 colors" },
      }),
      2
    );
    // Two 1-colour placements are still a 1-colour design: 12, not 24.
    assert.equal(
      designColorCount({ printLocations: ["Front", "Back"], inkColors: "1 color" }),
      1
    );
  });

  test("the white underbase counts as a color (Gabe: \"Under base counts as a colors\")", () => {
    assert.equal(
      designColorCount({ printLocations: ["Front"], inkColors: "1 color", hasUnderbase: true }),
      2
    );
    assert.equal(
      designColorCount({ printLocations: ["Front"], inkColors: "2 colors", hasUnderbase: true }),
      3
    );
  });

  test("no placement yet reads the order-level choice", () => {
    assert.equal(designColorCount({ printLocations: [], inkColors: "3 colors" }), 3);
  });
});

describe("the message", () => {
  test("meets the minimum: nothing to say", () => {
    assert.equal(screenPrintMinimumMessage(12, 1), null);
    assert.equal(screenPrintMinimumMessage(24, 2), null);
    assert.equal(screenPrintMinimumMessage(48, 3), null);
    assert.equal(screenPrintMinimumMessage(500, 5), null);
  });

  test("names the shortfall", () => {
    assert.equal(
      screenPrintMinimumMessage(8, 1),
      "Screen printing starts at 12 pieces. You have 8, so add 4 more."
    );
  });

  test("offers fewer colours only when their count already meets that minimum", () => {
    assert.equal(
      screenPrintMinimumMessage(18, 2),
      "A design with 2 colors starts at 24 pieces. You have 18, so add 6 more, or print it in 1 color (12 minimum)."
    );
    assert.equal(
      screenPrintMinimumMessage(30, 4),
      "A design with 3 or more colors starts at 48 pieces. You have 30, so add 18 more, or print it in 2 colors (24 minimum)."
    );
    assert.equal(
      screenPrintMinimumMessage(10, 3),
      "A design with 3 or more colors starts at 48 pieces. You have 10, so add 38 more."
    );
  });
});

describe("the message with an underbase", () => {
  test("says the underbase is what moved it", () => {
    assert.equal(
      screenPrintMinimumMessage(18, 2, { underbase: true }),
      "On a dark garment the white underbase counts as a color, so this design prints 2 colors and starts at 24 pieces. You have 18, so add 6 more."
    );
  });

  test("offers fewer INK colors, never below what the dark garment can print", () => {
    assert.equal(
      screenPrintMinimumMessage(30, 3, { underbase: true }),
      "On a dark garment the white underbase counts as a color, so this design prints 3 or more colors and starts at 48 pieces. You have 30, so add 18 more, or print it in 1 ink color (24 minimum)."
    );
  });
});

describe("the form refuses a design under its minimum", () => {
  test("11 one-colour shirts: refused; 12: fine", () => {
    assert.match(
      getApparelFieldErrors(quote({ quantity: 11 }), order, 0, TODAY).quantity ?? "",
      /starts at 12 pieces/
    );
    assert.equal(getApparelFieldErrors(quote({ quantity: 12 }), order, 0, TODAY).quantity, undefined);
  });

  test("2 colours at 23 refused, at 24 fine", () => {
    const two = { inkColors: "2 colors" };
    assert.match(
      getApparelFieldErrors(quote({ ...two, quantity: 23 }), order, 0, TODAY).quantity ?? "",
      /starts at 24 pieces/
    );
    assert.equal(getApparelFieldErrors(quote({ ...two, quantity: 24 }), order, 0, TODAY).quantity, undefined);
  });

  test("3 colours at 47 refused, at 48 fine", () => {
    const three = { inkColors: "3 colors" };
    assert.match(
      getApparelFieldErrors(quote({ ...three, quantity: 47 }), order, 0, TODAY).quantity ?? "",
      /starts at 48 pieces/
    );
    assert.equal(getApparelFieldErrors(quote({ ...three, quantity: 48 }), order, 0, TODAY).quantity, undefined);
  });

  test("a 2-colour front over a 1-colour back reads the front: 24", () => {
    const mixed = {
      printLocations: ["Front", "Back"],
      inkColorsByLocation: { Front: "2 colors" },
    };
    assert.match(
      getApparelFieldErrors(quote({ ...mixed, quantity: 20 }), order, 0, TODAY).quantity ?? "",
      /starts at 24 pieces/
    );
  });

  test("per design: every garment on the quote counts toward it", () => {
    // 12 tees + 12 hoodies, same 2-colour print = 24, meets the minimum.
    assert.equal(
      getApparelFieldErrors(
        quote({ inkColors: "2 colors", quantity: 12, totalQuantity: 24 }),
        order,
        0,
        TODAY
      ).quantity,
      undefined
    );
  });

  test("1-color print on a dark garment: underbase makes it 2 colors, 24", () => {
    const dark = { inkColors: "1 color", hasUnderbase: true };
    assert.match(
      getApparelFieldErrors(quote({ ...dark, quantity: 12 }), order, 0, TODAY).quantity ?? "",
      /underbase counts as a color.*starts at 24 pieces/
    );
    assert.equal(getApparelFieldErrors(quote({ ...dark, quantity: 24 }), order, 0, TODAY).quantity, undefined);
  });

  test("2 colors on a dark garment is 3 colors: 48", () => {
    assert.match(
      getApparelFieldErrors(quote({ inkColors: "2 colors", hasUnderbase: true, quantity: 47 }), order, 0, TODAY).quantity ?? "",
      /starts at 48 pieces/
    );
  });

  test("the checklist says it in the same words", () => {
    const summary = getApparelValidationSummary(quote({ quantity: 5 }), order, 0, TODAY);
    assert.ok(summary.includes("Screen printing starts at 12 pieces. You have 5, so add 7 more."), summary.join(" | "));
  });

  test("an empty box still asks how many first", () => {
    assert.match(
      getApparelFieldErrors(quote({ quantity: 0 }), order, 0, TODAY).quantity ?? "",
      /how many/
    );
  });

  test("a special order is priced by hand: no screen-print minimum", () => {
    assert.equal(
      getApparelFieldErrors(
        quote({ specialOrder: true, specialOrderNotes: "6 embroidered hats", quantity: 6 }),
        order,
        0,
        TODAY
      ).quantity,
      undefined
    );
  });
});
