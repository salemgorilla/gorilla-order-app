/**
 * BLACK FRIDAY TEE DEALS (lib/tee-deal.ts): 24 tees, one front print, the
 * regular price less 25%, no screen fee.
 *
 * Gabe, 2026-11-23: "it's the same price it would be, but take 25% off. and
 * no screen fee." And: "2 color is strictly 2 color. No 3 color no underbase
 * after 1 color images." So never more than 2 screens, underbase included.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { quoteApparelCart } from "../lib/apparel-cart";
import {
  TEE_DEALS,
  TEE_DEAL_STYLES,
  applyTeeDeal,
  teeDealFor,
  teeDealProblem,
  teeDealSubmissionProblem,
} from "../lib/tee-deal";

const oneColor = teeDealFor("tees-24-1c")!;
const twoColor = teeDealFor("tees-24-2c")!;

const regular = (inkColors: string, hasUnderbase: boolean) =>
  quoteApparelCart(
    [{ id: "l1", garmentLabel: "Basic Tee", colorName: hasUnderbase ? "Black" : "White", garmentUnitPrice: 5.37, quantity: 24 }],
    { printLocations: ["Front"], inkColors, hasUnderbase }
  );

const spec = (extra: Partial<Parameters<typeof teeDealProblem>[1]> = {}) => ({
  quantity: 24,
  catalogStyle: TEE_DEAL_STYLES[0],
  garmentColor: "White",
  printLocations: ["Front"],
  inkColors: "1 color",
  ...extra,
});

describe("the deals' numbers", () => {
  test("two deals, both 24 tees, never more than 2 screens", () => {
    assert.deepEqual(TEE_DEALS.map((d) => d.id), ["tees-24-1c", "tees-24-2c"]);
    for (const deal of TEE_DEALS) assert.equal(deal.maxScreens, 2);
    assert.equal(oneColor.maxInks, 1);
    assert.equal(twoColor.maxInks, 2);
  });
  test("are for the builder's tees only", () => {
    assert.deepEqual([...TEE_DEAL_STYLES].sort(), ["39", "7584"]);
  });
});

describe("the price: regular less 25%, no screens", () => {
  for (const [ink, dark] of [["1 color", false], ["1 color", true], ["2 colors", false]] as const) {
    test(`${ink} on a ${dark ? "dark" : "light"} tee`, () => {
      const base = regular(ink, dark);
      const deal = applyTeeDeal(base);
      assert.ok(base.setupTotal > 0, "the regular quote has screens");
      assert.equal(deal.setupTotal, 0);
      // Per unit, to the cent, so unit x quantity is what Printavo shows.
      assert.equal(deal.printUnitPrice, Math.round(base.printUnitPrice * 0.75 * 100) / 100);
      assert.equal(deal.lines[0].garmentUnitPrice, Math.round(5.37 * 0.75 * 100) / 100);
      assert.equal(deal.total, Math.round((deal.garmentTotal + deal.printTotal) * 100) / 100);
      // Within a cent a piece of 75% of the regular goods.
      const target = 0.75 * (base.garmentTotal + base.printTotal);
      assert.ok(Math.abs(deal.total - target) <= 0.01 * 24 * 2, `${deal.total} vs ${target}`);
      assert.equal(deal.unitPrice, Math.round((deal.total / 24) * 100) / 100);
    });
  }

  test("does not touch the regular quote it was given", () => {
    const base = regular("1 color", false);
    const copy = JSON.parse(JSON.stringify(base));
    applyTeeDeal(base);
    assert.deepEqual(base, copy);
  });
});

describe("what fits each deal", () => {
  test("1-color deal: 1 ink, light or dark tee", () => {
    assert.equal(teeDealProblem(oneColor, spec()), null);
    assert.equal(teeDealProblem(oneColor, spec({ garmentColor: "Black" })), null);
    assert.match(teeDealProblem(oneColor, spec({ inkColors: "2 colors" }))!, /1 color/);
  });

  test("2-color deal: 2 inks on a light tee, 1-color art on a dark one, never 3", () => {
    assert.equal(teeDealProblem(twoColor, spec({ inkColors: "2 colors" })), null);
    assert.equal(teeDealProblem(twoColor, spec({ inkColors: "2 colors", garmentColor: "Ash" })), null);
    assert.equal(teeDealProblem(twoColor, spec({ inkColors: "1 color", garmentColor: "Black" })), null);
    assert.match(
      teeDealProblem(twoColor, spec({ inkColors: "2 colors", garmentColor: "Black" }))!,
      /underbase counts as a color/
    );
    assert.match(
      teeDealProblem(twoColor, spec({ inkColors: "2 colors", garmentColor: "Sport Grey" }))!,
      /underbase/
    );
    assert.ok(teeDealProblem(twoColor, spec({ inkColors: "3 colors" })));
    assert.ok(teeDealProblem(twoColor, spec({ inkColors: "5+ colors / Full color / Not sure" })));
  });

  test("exactly 24, one front print, one tee", () => {
    assert.match(teeDealProblem(oneColor, spec({ quantity: 23 }))!, /exactly 24/);
    assert.match(teeDealProblem(oneColor, spec({ quantity: 48 }))!, /exactly 24/);
    assert.ok(teeDealProblem(oneColor, spec({ printLocations: ["Back"] })));
    assert.ok(teeDealProblem(oneColor, spec({ printLocations: ["Front", "Back"] })));
    assert.equal(teeDealProblem(oneColor, spec({ printLocations: ["Left Chest"] })), null);
    assert.ok(teeDealProblem(oneColor, spec({ catalogStyle: "395" })));
    assert.ok(teeDealProblem(oneColor, spec({ extraLines: 1 })));
  });

  test("a per-placement ink count is the one that counts", () => {
    assert.ok(
      teeDealProblem(oneColor, spec({ inkColors: "1 color", inkColorsByLocation: { Front: "2 colors" } }))
    );
  });
});

describe("the quote endpoint's check", () => {
  const product = (extra: Record<string, unknown> = {}) => ({
    promo: "tees-24-2c",
    quantity: 24,
    garmentColor: "White",
    printLocations: ["Front"],
    inkColors: "2 colors",
    supplier: { catalogStyle: "39" },
    ...extra,
  });
  const pricing = { promo: "tees-24-2c", setupTotal: 0 };

  test("passes a deal quote that fits", () => {
    assert.equal(teeDealSubmissionProblem(product(), pricing), null);
  });
  test("ignores a quote with no tee deal on it", () => {
    assert.equal(teeDealSubmissionProblem(product({ promo: "" }), undefined), null);
    assert.equal(teeDealSubmissionProblem(product({ promo: "hoodie-50" }), undefined), null);
  });
  test("refuses one that skipped the form", () => {
    assert.ok(teeDealSubmissionProblem(product({ garmentColor: "Black" }), pricing));
    assert.ok(teeDealSubmissionProblem(product({ quantity: 12 }), pricing));
    assert.ok(teeDealSubmissionProblem(product({ supplier: { catalogStyle: "Not selected" } }), pricing));
    assert.ok(teeDealSubmissionProblem(product(), { promo: "tees-24-2c", setupTotal: 50 }));
    assert.ok(teeDealSubmissionProblem(product(), undefined));
  });
});
