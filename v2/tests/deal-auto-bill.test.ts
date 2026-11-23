/**
 * THE BLACK FRIDAY DEALS PAY IN FULL AT CHECKOUT (lib/auto-bill.ts).
 *
 * Gabe, 2026-11-23: "they can pay in full at checkout with any of these
 * Black Friday deals. As well as the 50 hoody deal." A deal takes a card only
 * at its own fixed price, worked out on the server, on the same rules as
 * stickers: no kiosk, no special order, a Printavo quote, under the ceiling.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  decideDealAutoBill,
  dealServerTotal,
  isFixedPriceDealOrder,
  shopPaymentNote,
} from "../lib/auto-bill";

const teeOrder = (product: Record<string, unknown> = {}, pricing: Record<string, unknown> = {}) => ({
  product: {
    type: "T-Shirts & Apparel",
    promo: "tees-24-2c",
    quantity: 24,
    garmentColor: "Navy",
    printLocations: ["Front"],
    inkColors: "1 color",
    sizeBreakdown: "M-12, L-12",
    supplier: { catalogStyle: "16" },
    ...product,
  },
  pricing: { promo: "tees-24-2c", unitPrice: 11.01, total: 264.24, setupTotal: 0, ...pricing },
});

const hoodieOrder = (product: Record<string, unknown> = {}, pricing: Record<string, unknown> = {}) => ({
  product: {
    type: "T-Shirts & Apparel",
    promo: "hoodie-50",
    quantity: 50,
    garmentColor: "Black",
    printLocations: ["Front", "Back"],
    inkColors: "Front 2 colors · Back 1 color",
    ...product,
  },
  pricing: { unitPrice: 33, total: 1650, ...pricing },
});

const open = "2026-11-25";
const decide = (order: Record<string, unknown>, extra: Partial<Parameters<typeof decideDealAutoBill>[0]> = {}) =>
  decideDealAutoBill({ order, kioskSession: false, printavoCreated: true, today: open, ...extra });

describe("which orders are deals", () => {
  test("the tee deals and the hoodie special, nothing else", () => {
    assert.equal(isFixedPriceDealOrder(teeOrder()), true);
    assert.equal(isFixedPriceDealOrder(hoodieOrder()), true);
    assert.equal(isFixedPriceDealOrder(teeOrder({ promo: "" })), false);
    assert.equal(isFixedPriceDealOrder({ product: { type: "Custom Stickers" } }), false);
  });

  test("the server works out the deal's total itself", () => {
    assert.equal(dealServerTotal(teeOrder()), 264.24);
    assert.equal(dealServerTotal(teeOrder({ promo: "tees-12-1c" })), 130.32);
    assert.equal(dealServerTotal(hoodieOrder()), 1650);
    assert.equal(dealServerTotal(hoodieOrder({ printLocations: ["Front"], quantity: 60 })), 1620);
  });
});

describe("a deal that fits pays in full", () => {
  test("tee deal", () => {
    assert.deepEqual(decide(teeOrder()), {
      bill: true,
      deposit: false,
      reason: "fixed deal price, under the ceiling",
    });
  });
  test("hoodie special", () => {
    assert.equal(decide(hoodieOrder()).bill, true);
    assert.equal(decide(hoodieOrder()).deposit, false);
  });
  test("a very large hoodie order is a 50% deposit, as for every other flow", () => {
    const big = hoodieOrder({ quantity: 200 }, { total: 6600 });
    assert.deepEqual(
      { bill: decide(big).bill, deposit: decide(big).deposit },
      { bill: true, deposit: true }
    );
  });
});

describe("what never takes a card", () => {
  test("a price that is not the deal's", () => {
    assert.equal(decide(teeOrder({}, { total: 200 })).bill, false);
    assert.equal(decide(teeOrder({}, { unitPrice: 9 })).bill, false);
    assert.equal(decide(hoodieOrder({}, { total: 100 })).bill, false);
  });
  test("an order that does not fit the deal", () => {
    assert.equal(decide(teeOrder({ inkColors: "2 colors" })).bill, false); // 2 inks on a dark tee
    assert.equal(decide(teeOrder({ sizeBreakdown: "M-24, L-1" })).bill, false);
    assert.equal(decide(teeOrder({ supplier: { catalogStyle: "39" } })).bill, false);
    assert.equal(decide(hoodieOrder({ quantity: 40 }, { total: 1320 })).bill, false);
  });
  test("the counter, a special order, no Printavo quote", () => {
    assert.equal(decide(teeOrder(), { kioskSession: true }).bill, false);
    assert.equal(decide(teeOrder({ specialOrder: true })).bill, false);
    assert.equal(decide(teeOrder(), { printavoCreated: false }).bill, false);
  });
  test("the hoodie special after its last day", () => {
    assert.equal(decide(hoodieOrder(), { today: "2026-12-02" }).bill, false);
  });
  test("an ordinary apparel quote", () => {
    assert.equal(decide(teeOrder({ promo: "" })).bill, false);
  });
});

describe("the shop's email", () => {
  test("says a deal was charged, or why not", () => {
    const order = teeOrder();
    assert.match(
      shopPaymentNote({ order, signs: null, stickers: null, deal: decide(order) })!,
      /Charged automatically/
    );
    const kiosk = decide(order, { kioskSession: true });
    assert.match(shopPaymentNote({ order, signs: null, stickers: null, deal: kiosk })!, /NOT charged/);
  });
});
