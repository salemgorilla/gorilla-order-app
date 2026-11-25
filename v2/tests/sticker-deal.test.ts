/**
 * BLACK FRIDAY STICKER DEAL: 50 stickers up to 3" for $25 (lib/sticker-deal.ts).
 *
 * Gabe, 2026-11-23: "50 stickers for $25" / "the stickers can be up to three
 * inches in size" / "Build the prices in". Stickers bill with nobody in the
 * loop, so the properties held here are the server's:
 *
 *   1. an order that fits the deal is billed $25 for the stickers, setup
 *      included, no minimum, shipping as usual, and the invoice row is
 *      50 x $0.50;
 *   2. an order that claims the deal without fitting it comes back with a
 *      reason (the quote route refuses it) and is priced at list, never $25;
 *   3. no discount code rides on the deal;
 *   4. an order that does not claim the deal prices exactly as before.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Discount } from "../lib/discount";
import { buildQuoteEmail } from "../lib/email";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { STICKER_DEAL, STICKER_DEAL_UNIT, stickerDealProblem } from "../lib/sticker-deal";
import { repriceStickers } from "../lib/sticker-repricing";

const CODES: readonly Discount[] = [{ code: "SALEM10", kind: "percent", percent: 10 }];

const item = (extra: Record<string, unknown> = {}) => ({
  id: "d1",
  quantity: 50,
  widthInches: 3,
  heightInches: 3,
  material: "Gloss White Vinyl",
  shape: "Die Cut",
  artwork: { file: { name: "a.png" } },
  ...extra,
});

const order = (extra: Record<string, unknown> = {}, items = [item()]) => ({
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod: "Pickup", needBy: "2026-12-10" },
  product: { type: "Custom Stickers", quantity: 50 },
  items,
  pricing: { total: 0 },
  ...extra,
});

const pricing = (o: unknown) => (o as { pricing: Record<string, number | string> }).pricing;

describe("the deal's numbers", () => {
  test("are Gabe's: 50 for $25, up to 3 inches, the default stock", () => {
    assert.equal(STICKER_DEAL.quantity, 50);
    assert.equal(STICKER_DEAL.price, 25);
    assert.equal(STICKER_DEAL.maxInches, 3);
    assert.equal(STICKER_DEAL.material, "Gloss White Vinyl");
    assert.equal(STICKER_DEAL_UNIT, 0.5);
  });
});

describe("an order on the deal", () => {
  test("is billed $25 with setup included and no minimum, at pickup", () => {
    const priced = repriceStickers(order({ deal: STICKER_DEAL.id }));
    assert.equal(priced.dealProblem, null);
    const p = pricing(priced.order);
    assert.equal(p.stickerPrice, 25);
    assert.equal(p.setupPrice, 0);
    assert.equal(p.minimumPrice, 0);
    assert.equal(p.total, 25);
    assert.equal(p.promo, STICKER_DEAL.id);
  });

  test("any shape and size up to 3 inches prices the same", () => {
    for (const extra of [
      { widthInches: 1, heightInches: 1, shape: "Circle" },
      { widthInches: 3, heightInches: 2, shape: "Rectangle" },
      { widthInches: 2.5, heightInches: 3, shape: "Die Cut" },
    ]) {
      const priced = repriceStickers(order({ deal: STICKER_DEAL.id }, [item(extra)]));
      assert.equal(priced.dealProblem, null, JSON.stringify(extra));
      assert.equal(pricing(priced.order).total, 25, JSON.stringify(extra));
    }
  });

  test("ships at the usual rate on top of the $25", () => {
    const priced = repriceStickers(
      order({ deal: STICKER_DEAL.id, production: { deliveryMethod: "Ship", needBy: "2026-12-10", shipZip: "01970" } })
    );
    const p = pricing(priced.order);
    assert.equal(p.stickerPrice, 25);
    assert.ok(Number(p.shippingPrice) >= 0);
    assert.equal(p.total, Math.round((25 + Number(p.shippingPrice)) * 100) / 100);
  });

  test("takes no discount code", () => {
    const priced = repriceStickers(
      order({ deal: STICKER_DEAL.id, discount: { code: "SALEM10", kind: "percent", percent: 10 } }),
      { discountCodes: CODES }
    );
    const p = pricing(priced.order);
    assert.equal(p.total, 25);
    assert.equal(p.discountPrice, 0);
  });

  test("reaches Printavo as 50 x $0.50 with no setup or minimum row", () => {
    const priced = repriceStickers(order({ deal: STICKER_DEAL.id }));
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-DEAL", order: priced.order, artworkAnalysis: null });
    const stickerRows = plan.lineItems.filter((l) => l.quantity === 50);
    assert.equal(stickerRows.length, 1);
    assert.equal(stickerRows[0].price, 0.5);
    const goods = plan.lineItems.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0);
    const fees = plan.feeLineItems.reduce((s, f) => s + f.price, 0);
    assert.equal(Math.round((goods + fees) * 100) / 100, 25);
  });

  test("tells the shop it is the deal", () => {
    const priced = repriceStickers(order({ deal: STICKER_DEAL.id }));
    const text = buildQuoteEmail({ quoteNumber: "GS-T", receivedAt: new Date().toISOString(), order: priced.order, artworkAnalysis: null }).text;
    assert.match(text, /50 Stickers for \$25/);
  });
});

describe("an order that claims the deal but does not fit it", () => {
  const cases: Array<[string, Record<string, unknown>[]]> = [
    ["49 stickers", [item({ quantity: 49 })]],
    ["100 stickers", [item({ quantity: 100 })]],
    ["4 inches wide", [item({ widthInches: 4 })]],
    ["3.5 inches tall", [item({ heightInches: 3.5 })]],
    ["another stock", [item({ material: "Clear Vinyl" })]],
    ["two designs", [item(), item({ id: "d2" })]],
  ];
  for (const [name, items] of cases) {
    test(`${name}: refused with a reason, never billed $25`, () => {
      const priced = repriceStickers(order({ deal: STICKER_DEAL.id }, items as ReturnType<typeof item>[]));
      assert.ok(priced.dealProblem, name);
      assert.equal(priced.dealProblem, stickerDealProblem(items));
      assert.notEqual(pricing(priced.order).total, 25);
    });
  }
});

describe("a regular order", () => {
  test("prices exactly as it did, plus the 3% retail uplift: 50 x 3 inch die cut is $43.26 plus $15.45 setup", () => {
    const priced = repriceStickers(order());
    assert.equal(priced.dealProblem, null);
    const p = pricing(priced.order);
    assert.equal(p.stickerPrice, 43.26); // 42 x 1.03
    assert.equal(p.setupPrice, 15.45); // 15 x 1.03
    assert.equal(p.total, 58.71); // 57 x 1.03
    assert.equal(p.promo, undefined);
  });

  test("an unknown deal id is ignored, not refused", () => {
    const priced = repriceStickers(order({ deal: "stickers-1000-1" }));
    assert.equal(priced.dealProblem, null);
    assert.equal(pricing(priced.order).total, 58.71);
  });
});
