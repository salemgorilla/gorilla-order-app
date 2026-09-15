/**
 * DISCOUNT CODES — OFF BEFORE PRINTAVO, RE-CHECKED ON SUBMIT.
 *
 * Gabe, 2026-09-15: "can we add a discount code section at the checkout
 * page? I could give you a list of codes that are always working, and
 * invent more as we go." / "code would discount before it gets to
 * printavo, or it could be added as a line item with negative money."
 *
 * Before: a percent code is folded into each design's four-decimal unit
 * price, so the invoice is built from the arithmetic that already
 * reconciles to the cent, and tax follows the discounted price. The
 * properties held here:
 *
 *   1. the code list is server-side and parses from env safely;
 *   2. the browser's claim about a code is never trusted — the server
 *      looks the code up again and bills what it is really worth;
 *   3. quote == invoice to the cent, with a code on;
 *   4. a code brings an order down to the $45 minimum, never through it;
 *   5. a free-shipping code zeroes shipping and nothing else.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { applyDiscountToUnit, describeDiscount, normalizeDiscountCode, type Discount } from "../lib/discount";
import { BUILT_IN_CODES, allDiscountCodes, findDiscountCode, parseDiscountCodes } from "../lib/discount-codes";
import { buildQuoteEmail } from "../lib/email";
import { STICKER_ORDER_MINIMUM, getStickerMaterialPrice, getStickerUnitMaterialPrice, quoteStickerCart } from "../lib/pricing";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { repriceStickers } from "../lib/sticker-repricing";
import { describeSubmission } from "../lib/submission-log";

const CODES: readonly Discount[] = [
  { code: "SALEM10", kind: "percent", percent: 10 },
  { code: "FREESHIP", kind: "shipping" },
];

const order = (extra: Record<string, unknown> = {}, items?: Record<string, unknown>[]) => ({
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod: "Pickup", needBy: "2026-10-01" },
  product: { type: "Custom Stickers", quantity: 100 },
  items: items ?? [
    { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Gloss White Vinyl", shape: "Circle", artwork: { file: { name: "a.png" } } },
  ],
  pricing: { total: 0 },
  ...extra,
});

/** The repo's model of Printavo's arithmetic: 4dp unit x qty, fees, once. */
function printavoTotal(plan: ReturnType<typeof buildPrintavoQuotePlan>) {
  const stored = (p: number) => Number(p.toFixed(4));
  const goods = plan.lineItems.reduce((s, l) => s + stored(l.price) * Math.max(1, l.quantity), 0);
  const fees = plan.feeLineItems.reduce((s, f) => s + stored(f.price), 0);
  return Math.round((goods + fees + stored(plan.shippingLineItem?.price ?? 0)) * 100) / 100;
}

describe("the code list", () => {
  test("Gabe's four always-working codes are built in", () => {
    assert.deepEqual(BUILT_IN_CODES, [
      { code: "FAMFRE", kind: "percent", percent: 40 },
      { code: "DOUBLEDIME", kind: "percent", percent: 20 },
      { code: "DIME", kind: "percent", percent: 10 },
      { code: "FIPPY", kind: "shipping" },
      { code: "SOCIALPATH", kind: "percent", percent: 5 },
    ]);
    assert.equal(allDiscountCodes({}).length, 5);
    // 5% on the reference 100 x 3" circle: $85 → $80.75.
    const social = findDiscountCode("socialpath")!;
    const list = getStickerMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle");
    const off = getStickerMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle", social);
    assert.equal(quoteStickerCart({ materialPrices: [off], listPrices: [list], deliveryMethod: "Pickup", discount: social }).total, 80.75);
    assert.deepEqual(findDiscountCode("fippy"), { code: "FIPPY", kind: "shipping" });
  });

  test("parses CODE=NN% and CODE=shipping from env, skipping junk without throwing", () => {
    const warnings: string[] = [];
    const parsed = parseDiscountCodes(" salem 10 = 10% , FREESHIP=shipping, BAD, WORSE=abc, ZERO=0%, BIG=150%, half=12.5% ", (w) => warnings.push(w));
    assert.deepEqual(parsed, [
      { code: "SALEM10", kind: "percent", percent: 10 },
      { code: "FREESHIP", kind: "shipping" },
      { code: "HALF", kind: "percent", percent: 12.5 },
    ]);
    assert.equal(warnings.length, 4);
  });

  test("env codes merge over built-ins and lookup is case- and space-insensitive", () => {
    const codes = allDiscountCodes({ DISCOUNT_CODES: "vip=15%,dime=11%" });
    assert.deepEqual(findDiscountCode("v i p", codes), { code: "VIP", kind: "percent", percent: 15 });
    assert.deepEqual(findDiscountCode("DIME", codes), { code: "DIME", kind: "percent", percent: 11 }, "env wins on a duplicate");
    assert.equal(codes.length, 6);
    assert.equal(findDiscountCode("nope", codes), null);
    assert.equal(findDiscountCode("", codes), null);
    assert.equal(normalizeDiscountCode(" salem 10 "), "SALEM10");
  });

  test("a bad env entry does not break the good ones beside it", () => {
    const codes = allDiscountCodes({ DISCOUNT_CODES: "GOOD=10%,,=5%,BROKEN" });
    assert.equal(codes.length, BUILT_IN_CODES.length + 1);
  });
});

describe("the arithmetic", () => {
  test("a percent code comes off the four-decimal unit, to four decimals", () => {
    assert.equal(applyDiscountToUnit(0.85, CODES[0]), 0.765);
    assert.equal(applyDiscountToUnit(0.8533, CODES[0]), 0.768);
    assert.equal(applyDiscountToUnit(0.85, CODES[1]), 0.85);
    assert.equal(applyDiscountToUnit(0.85, null), 0.85);
    assert.equal(describeDiscount(CODES[0]), "10% off your order (not shipping)");
    assert.equal(describeDiscount(CODES[1]), "Free shipping");
  });

  test("the reference 100 x 3\" circle: $85 at list, $76.50 with a 10% code — setup takes it too", () => {
    const list = getStickerMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle");
    const off = getStickerMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle", CODES[0]);
    assert.equal(list, 70);
    assert.equal(off, 63);
    assert.equal(getStickerUnitMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle", CODES[0]), 0.63);

    const cart = quoteStickerCart({ materialPrices: [off], listPrices: [list], deliveryMethod: "Pickup", discount: CODES[0] });
    assert.equal(cart.stickerPrice, 63);
    assert.equal(cart.stickerListPrice, 70);
    assert.equal(cart.setupPrice, 13.5);
    assert.equal(cart.setupListPrice, 15);
    assert.equal(cart.discountPrice, 8.5);
    assert.equal(cart.discountCode, "SALEM10");
    assert.equal(cart.total, 76.5);
    // 40% off: FAMFRE on the same order.
    const fam = quoteStickerCart({ materialPrices: [getStickerMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle", { code: "FAMFRE", kind: "percent", percent: 40 })], listPrices: [list], deliveryMethod: "Pickup", discount: { code: "FAMFRE", kind: "percent", percent: 40 } });
    assert.equal(fam.total, 51);
    assert.equal(fam.discountPrice, 34);
  });

  test("the code is off the ORDER — the $45 minimum top-up takes it too", () => {
    // 20 x 2x2 gloss squares: $10 of stickers + $15 setup, topped to $45 (Catherine's order).
    const list = getStickerMaterialPrice(20, "Gloss White Vinyl", undefined, { widthInches: 2, heightInches: 2 }, "Square Corners");
    const off = getStickerMaterialPrice(20, "Gloss White Vinyl", undefined, { widthInches: 2, heightInches: 2 }, "Square Corners", CODES[0]);
    const cart = quoteStickerCart({ materialPrices: [off], listPrices: [list], deliveryMethod: "Pickup", discount: CODES[0] });
    assert.equal(cart.minimumListPrice, 20);
    assert.equal(cart.minimumPrice, 18);
    assert.equal(cart.setupPrice, 13.5);
    assert.equal(cart.stickerPrice, 9);
    assert.equal(cart.discountPrice, 4.5);
    assert.equal(cart.total, STICKER_ORDER_MINIMUM - 4.5);
  });

  test("shipping is tiered on the list goods — a code never buys a cheaper tier", () => {
    // 3 x 3 x 500 gloss: about $244 of stickers at list, the $18 tier ($200–$500).
    const list = getStickerMaterialPrice(500, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle");
    const fam = { code: "FAMFRE", kind: "percent", percent: 40 } as const;
    const off = getStickerMaterialPrice(500, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle", fam);
    const plain = quoteStickerCart({ materialPrices: [list], deliveryMethod: "Ship" });
    const coded = quoteStickerCart({ materialPrices: [off], listPrices: [list], deliveryMethod: "Ship", discount: fam });
    assert.equal(coded.shippingPrice, plain.shippingPrice);
  });

  test("a free-shipping code zeroes shipping and nothing else", () => {
    const list = getStickerMaterialPrice(100, "Gloss White Vinyl", undefined, { widthInches: 3, heightInches: 3 }, "Circle");
    const plain = quoteStickerCart({ materialPrices: [list], deliveryMethod: "Ship" });
    const free = quoteStickerCart({ materialPrices: [list], deliveryMethod: "Ship", discount: CODES[1] });
    assert.ok(plain.shippingPrice > 0);
    assert.equal(free.shippingPrice, 0);
    assert.equal(free.discountPrice, 0);
    assert.equal(free.stickerPrice, plain.stickerPrice);
    assert.equal(free.total, plain.total - plain.shippingPrice);
    assert.match(free.shippingNote, /Free shipping \(code FREESHIP\)/);
    // On pickup there is nothing to make free, and the note stays honest.
    assert.equal(quoteStickerCart({ materialPrices: [list], deliveryMethod: "Pickup", discount: CODES[1] }).shippingNote, "Local pickup in Salem");
  });
});

describe("the server never trusts the browser's discount", () => {
  test("a real code is looked up and applied; the invoice equals the quote to the cent", () => {
    const priced = repriceStickers(order({ discount: { code: "salem10", kind: "percent", percent: 10 } }), { discountCodes: CODES });
    const pricing = priced.order.pricing as Record<string, number | string>;
    assert.equal(priced.discountRejected, false);
    assert.equal(pricing.stickerPrice, 63);
    assert.equal(pricing.setupPrice, 13.5);
    assert.equal(pricing.discountPrice, 8.5);
    assert.equal(pricing.discountCode, "SALEM10");
    assert.equal(pricing.total, 76.5);
    assert.equal(priced.unpriceable, false);

    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-TEST", order: priced.order, artworkAnalysis: null });
    assert.equal(plan.lineItems[0].price, 0.63);
    const setup = plan.feeLineItems.find((f) => f.itemNumber === "GORILLA-DECAL-SETUP");
    assert.equal(setup?.price, 13.5);
    assert.match(setup?.description ?? "", /net of code SALEM10/);
    assert.equal(printavoTotal(plan), 76.5);
    assert.equal(plan.feeLineItems.some((f) => f.price < 0), false, "no negative line item — the discount is in the rows");
    assert.match(plan.customerNote, /Discount code SALEM10: -\$8\.50 off the order \(not shipping\), already in the unit prices, setup and minimum rows/);
  });

  test("a fabricated 90% claim on a real 10% code bills at 10%", () => {
    const priced = repriceStickers(order({ discount: { code: "SALEM10", kind: "percent", percent: 90 } }), { discountCodes: CODES });
    assert.equal((priced.order.pricing as Record<string, number>).total, 76.5);
    assert.deepEqual(priced.order.discount, CODES[0]);
  });

  test("an unknown code bills at list, is flagged, and the shop email says so", () => {
    const priced = repriceStickers(order({ discount: { code: "NOTOURS", kind: "percent", percent: 50 }, pricing: { total: 50 } }), { discountCodes: CODES });
    assert.equal(priced.discountRejected, true);
    assert.equal(priced.order.discount, null);
    const pricing = priced.order.pricing as Record<string, number | string>;
    assert.equal(pricing.total, 85);
    assert.equal(pricing.discountCode, "");
    assert.equal(priced.mismatch, true, "the browser claimed $50; the server charges $85 — that is a mismatch worth logging");

    const text = buildQuoteEmail({ quoteNumber: "GS-T", receivedAt: new Date().toISOString(), order: priced.order, artworkAnalysis: null, discountRejected: "NOTOURS" }).text;
    assert.match(text, /"NOTOURS" is NOT a configured code — priced at full price/);
  });

  test("no codes configured means every code is rejected, and a payload with none is untouched", () => {
    const priced = repriceStickers(order({ discount: { code: "SALEM10", kind: "percent", percent: 10 } }), { discountCodes: [] });
    assert.equal(priced.discountRejected, true);
    assert.equal((priced.order.pricing as Record<string, number>).total, 85);
    const plain = repriceStickers(order(), { discountCodes: CODES });
    assert.equal(plain.discountRejected, false);
    assert.equal((plain.order.pricing as Record<string, number>).total, 85);
    assert.equal((plain.order.pricing as Record<string, string>).discountCode, "");
  });

  test("a cart of three designs with a code: exact lines, one rounding, invoice equals quote", () => {
    const items = [
      { id: "d1", quantity: 25, widthInches: 1, heightInches: 1, material: "Matte White Vinyl", shape: "Circle", artwork: { file: { name: "a.png" } } },
      { id: "d2", quantity: 137, widthInches: 2.5, heightInches: 1.75, material: "Holographic", shape: "Die Cut", artwork: { file: { name: "b.png" } } },
      { id: "d3", quantity: 400, widthInches: 3, heightInches: 3, material: "Gloss White Vinyl", shape: "Oval", artwork: { file: { name: "c.png" } } },
    ];
    const priced = repriceStickers(order({ discount: { code: "SALEM10", kind: "percent", percent: 10 }, production: { deliveryMethod: "Ship", shipZip: "02116", needBy: "2026-10-01" } }, items), { discountCodes: CODES });
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-TEST", order: priced.order, artworkAnalysis: null });
    const pricing = priced.order.pricing as Record<string, number>;
    assert.equal(printavoTotal(plan), pricing.total);
    assert.ok(pricing.discountPrice > 0);
    for (const [i, row] of plan.lineItems.entries()) {
      const item = (priced.order.items as Record<string, number>[])[i];
      assert.equal(row.price, item.lineUnitPrice);
      assert.equal(item.lineUnitPrice, applyDiscountToUnit(getStickerUnitMaterialPrice(item.quantity, String(item.material), undefined, { widthInches: item.widthInches, heightInches: item.heightInches }, String(item.shape)), CODES[0]));
    }
  });

  test("the shop email carries the discount line; the log carries the code", () => {
    const priced = repriceStickers(order({ discount: { code: "SALEM10", kind: "percent", percent: 10 } }), { discountCodes: CODES });
    const text = buildQuoteEmail({ quoteNumber: "GS-T", receivedAt: new Date().toISOString(), order: priced.order, artworkAnalysis: null }).text;
    assert.match(text, /Discount: SALEM10 — -\$8\.50 off the order, not shipping/);
    // The receipt reads at list, with the subtraction — not the net lines.
    assert.match(text, /Stickers: \$70\.00/);
    assert.match(text, /Setup: \$15\.00/);
    assert.match(text, /Estimated Total: \$76\.50/);

    const line = describeSubmission({ quoteNumber: "GS-T", flow: "stickers", door: "priced", quantity: 100, total: 76.5, needBy: "", earliest: "", artwork: "form", delivered: true, billed: true, deposit: false, kiosk: false, discount: "SALEM10" });
    assert.match(line, / code=SALEM10$/);
    assert.doesNotMatch(describeSubmission({ quoteNumber: "GS-T", flow: "stickers", door: "priced", quantity: 100, total: 85, needBy: "", earliest: "", artwork: "form", delivered: true, billed: true, deposit: false, kiosk: false, discount: "" }), /code=/);
  });
});
