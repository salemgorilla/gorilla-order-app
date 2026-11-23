/**
 * BLACK FRIDAY TEE DEALS (lib/tee-deal.ts): exactly 24 Basic Tees, one front
 * print, one fixed price.
 *
 * Gabe, 2026-11-23: "everything will be canned pricing ... so it'll always be
 * the same price", "They can't add more, they can't add less", and "2 color
 * is strictly 2 color. No 3 color no underbase after 1 color images."
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import {
  TEE_DEALS,
  TEE_DEAL_QUANTITY,
  TEE_DEAL_STYLE,
  quoteTeeDeal,
  teeDealFor,
  teeDealProblem,
  teeDealSubmissionProblem,
  teeDealTotal,
} from "../lib/tee-deal";

const oneColor = teeDealFor("tees-24-1c")!;
const twoColor = teeDealFor("tees-24-2c")!;

const spec = (extra: Partial<Parameters<typeof teeDealProblem>[1]> = {}) => ({
  catalogStyle: TEE_DEAL_STYLE,
  garmentColor: "White",
  printLocations: ["Front"],
  inkColors: "1 color",
  sizeBreakdown: "M-12, L-12",
  ...extra,
});

describe("the deals' numbers", () => {
  test("two deals, exactly 24 tees each, at Gabe's fixed prices", () => {
    assert.deepEqual(TEE_DEALS.map((d) => d.id), ["tees-24-1c", "tees-24-2c"]);
    assert.equal(TEE_DEAL_QUANTITY, 24);
    assert.equal(oneColor.unitPrice, 8.59);
    assert.equal(twoColor.unitPrice, 10.31);
    assert.equal(teeDealTotal(oneColor), 206.16);
    assert.equal(teeDealTotal(twoColor), 247.44);
  });

  test("the quote is one row, 24 x the flat price, nothing else", () => {
    for (const deal of TEE_DEALS) {
      for (const colorName of ["White", "Black"]) {
        const q = quoteTeeDeal(deal, { colorName, sizeBreakdown: "S-4, M-8, L-8, 2XL-4" });
        assert.equal(q.lines.length, 1);
        assert.equal(q.lines[0].quantity, 24);
        assert.equal(q.lines[0].garmentUnitPrice, deal.unitPrice);
        assert.equal(q.total, teeDealTotal(deal));
        assert.equal(q.setupTotal, 0);
        assert.equal(q.printTotal, 0);
        assert.equal(q.rushFee, 0);
      }
    }
  });
});

describe("what fits each deal", () => {
  test("1-color deal: 1 ink, light tees only", () => {
    assert.equal(teeDealProblem(oneColor, spec()), null);
    assert.equal(teeDealProblem(oneColor, spec({ garmentColor: "Ash" })), null);
    assert.match(teeDealProblem(oneColor, spec({ garmentColor: "Black" }))!, /light tees/);
    assert.match(teeDealProblem(oneColor, spec({ garmentColor: "Sport Grey" }))!, /2-color deal/);
    assert.match(teeDealProblem(oneColor, spec({ inkColors: "2 colors" }))!, /1 color/);
  });

  test("2-color deal: 2 inks on a light tee, 1-color art on a dark one, never 3", () => {
    assert.equal(teeDealProblem(twoColor, spec({ inkColors: "2 colors" })), null);
    assert.equal(teeDealProblem(twoColor, spec({ inkColors: "1 color", garmentColor: "Black" })), null);
    assert.match(
      teeDealProblem(twoColor, spec({ inkColors: "2 colors", garmentColor: "Black" }))!,
      /underbase counts as a color/
    );
    assert.ok(teeDealProblem(twoColor, spec({ inkColors: "3 colors" })));
    assert.ok(teeDealProblem(twoColor, spec({ inkColors: "5+ colors / Full color / Not sure" })));
  });

  test("sizes must add up to exactly 24, S to 3XL", () => {
    assert.match(teeDealProblem(oneColor, spec({ sizeBreakdown: "" }))!, /exactly 24/);
    assert.match(teeDealProblem(oneColor, spec({ sizeBreakdown: "M-12, L-11" }))!, /add 1/);
    assert.match(teeDealProblem(oneColor, spec({ sizeBreakdown: "M-12, L-13" }))!, /take off 1/);
    assert.equal(teeDealProblem(oneColor, spec({ sizeBreakdown: "S-2, M-6, L-6, XL-4, 2XL-4, 3XL-2" })), null);
    assert.match(teeDealProblem(oneColor, spec({ sizeBreakdown: "M-20, 4XL-4" }))!, /4XL/);
  });

  test("one front print on the Basic Tee, one garment", () => {
    assert.ok(teeDealProblem(oneColor, spec({ printLocations: ["Back"] })));
    assert.ok(teeDealProblem(oneColor, spec({ printLocations: ["Front", "Back"] })));
    assert.equal(teeDealProblem(oneColor, spec({ printLocations: ["Left Chest"] })), null);
    assert.ok(teeDealProblem(oneColor, spec({ catalogStyle: "7584" })));
    assert.ok(teeDealProblem(oneColor, spec({ extraLines: 1 })));
  });

  test("a per-placement ink count is the one that counts", () => {
    assert.ok(teeDealProblem(oneColor, spec({ inkColorsByLocation: { Front: "2 colors" } })));
  });
});

describe("the quote endpoint's check", () => {
  const product = (extra: Record<string, unknown> = {}) => ({
    promo: "tees-24-2c",
    promoName: "24 Tees, 2-Color Front",
    quantity: 24,
    garmentColor: "White",
    printLocations: ["Front"],
    inkColors: "2 colors",
    sizeBreakdown: "M-12, L-12",
    supplier: { catalogStyle: TEE_DEAL_STYLE },
    ...extra,
  });
  const pricing = { promo: "tees-24-2c", unitPrice: 10.31, total: 247.44, setupTotal: 0 };

  test("passes a deal quote that fits", () => {
    assert.equal(teeDealSubmissionProblem(product(), pricing), null);
  });
  test("ignores a quote with no tee deal on it", () => {
    assert.equal(teeDealSubmissionProblem(product({ promo: "" }), undefined), null);
    assert.equal(teeDealSubmissionProblem(product({ promo: "hoodie-50" }), undefined), null);
  });
  test("refuses one that skipped the form", () => {
    assert.ok(teeDealSubmissionProblem(product({ garmentColor: "Black" }), pricing));
    assert.ok(teeDealSubmissionProblem(product({ quantity: 25 }), pricing));
    assert.ok(teeDealSubmissionProblem(product({ sizeBreakdown: "M-24, L-1" }), pricing));
    assert.ok(teeDealSubmissionProblem(product({ supplier: { catalogStyle: "7584" } }), pricing));
    assert.ok(teeDealSubmissionProblem(product(), { ...pricing, total: 200 }));
    assert.ok(teeDealSubmissionProblem(product(), { ...pricing, unitPrice: 9 }));
    assert.ok(teeDealSubmissionProblem(product(), undefined));
  });
});

describe("Printavo", () => {
  test("one row, 24 x the flat price, and the note says it is the deal", () => {
    const deal = twoColor;
    const q = quoteTeeDeal(deal, { colorName: "White", sizeBreakdown: "M-12, L-12" });
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEE",
      artworkAnalysis: null,
      order: {
        customer: { customerName: "Dana", email: "dana@example.com" },
        production: { deliveryMethod: "Pickup", needBy: "2026-12-20" },
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "Basic Tee",
          garmentColor: "White",
          quantity: 24,
          printLocations: ["Front"],
          inkColors: "2 colors",
          sizeBreakdown: "M-12, L-12",
          promo: deal.id,
          promoName: deal.name,
          supplier: { catalogStyle: TEE_DEAL_STYLE, source: "S&S Activewear" },
        },
        pricing: { ...q, promo: deal.id, quoteRequired: false },
      },
    });
    const goods = plan.lineItems.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0);
    const fees = plan.feeLineItems.reduce((s, f) => s + f.price, 0);
    assert.equal(Math.round((goods + fees) * 100) / 100, 247.44);
    assert.match(JSON.stringify(plan), /24 Tees, 2-Color Front: flat \$10\.31 each/);
  });
});
