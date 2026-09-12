/**
 * SHIPPING BY WEIGHT AND ZONE — WITH THE TABLES EMPTY, NOTHING MOVES.
 *
 * Gabe, 2026-09-12: "We need to figure out how much each order weighs and
 * get cost by weight and dimensions of commonly used packages or packing
 * bags." / "I have a business account with usps" / "Ground advantage works."
 *
 * The two USPS tables (zone chart from 019, Commercial Ground Advantage
 * rates) were not reachable from where this was written, so they ship
 * empty and the engine falls back to the old dollar tiers. These tests pin
 * BOTH halves: the fallback is byte-for-byte the tiers that shipped before,
 * and a fixture table injected in place of the live one produces a zoned,
 * weighed rate — so the day the tables are pasted in, the behaviour that
 * turns on has already been exercised.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildQuoteEmail } from "../lib/email";
import { DECAL_SHIPPING_PRICE, SHIPPING_TIERS, getShippingPrice, quoteStickerCart } from "../lib/pricing";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import {
  PACKAGES,
  estimateParcel,
  groundAdvantageRate,
  quoteStickerShipping,
  tieredShippingPrice,
  zoneForZip,
  type ShippingTables,
} from "../lib/shipping";
import { FIELD_STEP } from "../lib/steps";
import { repriceStickers } from "../lib/sticker-repricing";
import { GROUND_ADVANTAGE_COMMERCIAL, ZONES_FROM_019 } from "../lib/usps-data";
import { getOrderFieldErrors, getOrderValidationErrors, isOrderReady, isUsZip } from "../lib/validation";

/** A made-up but well-formed pair of tables, shaped exactly as the real ones will be. */
const FIXTURE: ShippingTables = {
  zones: [
    [10, 27, 1], // New England
    [28, 99, 2],
    [100, 199, 3],
    [200, 399, 4],
    [400, 599, 5],
    [600, 799, 6],
    [800, 899, 7],
    [900, 966, 8],
    [967, 999, 9],
  ],
  rates: [
    { maxLb: 0.25, zones: [4.5, 4.5, 4.6, 4.8, 5.1, 5.4, 5.8, 6.2, 6.9] },
    { maxLb: 0.5, zones: [4.7, 4.7, 4.9, 5.2, 5.6, 6.1, 6.7, 7.4, 8.3] },
    { maxLb: 1, zones: [5.2, 5.2, 5.5, 6.0, 6.6, 7.3, 8.2, 9.1, 10.5] },
    { maxLb: 2, zones: [5.9, 5.9, 6.3, 7.1, 8.0, 9.2, 10.7, 12.4, 14.9] },
    { maxLb: 5, zones: [7.4, 7.4, 8.1, 9.6, 11.5, 13.9, 16.8, 20.2, 25.0] },
    { maxLb: 10, zones: [9.8, 9.8, 11.0, 13.6, 17.0, 21.3, 26.4, 32.3, 40.6] },
    { maxLb: 20, zones: [13.5, 13.5, 15.6, 20.1, 26.0, 33.4, 42.3, 52.5, 66.5] },
    { maxLb: 70, zones: [24.0, 24.0, 28.5, 38.0, 50.5, 66.0, 84.5, 106.0, 135.0] },
  ],
};

const hundredThreeInch = [{ quantity: 100, widthInches: 3, heightInches: 3 }];

describe("the live tables are empty, and the engine says so by falling back", () => {
  test("both USPS tables ship empty — filling them is a deliberate commit", () => {
    assert.equal(ZONES_FROM_019.length, 0);
    assert.equal(GROUND_ADVANTAGE_COMMERCIAL.length, 0);
  });

  test("a shipped order with a ZIP is still priced on the old tiers", () => {
    const q = quoteStickerShipping({ deliveryMethod: "Ship", goodsSubtotal: 85, items: hundredThreeInch, destZip: "02116" });
    assert.equal(q.method, "tier");
    assert.equal(q.price, tieredShippingPrice(85));
    assert.equal(q.price, DECAL_SHIPPING_PRICE);
    assert.match(q.note, /tiered on order size/);
    // The weight is still estimated so the shop email can show it.
    assert.ok(q.parcel && q.parcel.billableLbPerBox > 0);
  });

  test("the tiers are the old site's, unchanged, and pickup is free", () => {
    assert.deepEqual(
      SHIPPING_TIERS.map((t) => [t.upTo, t.price]),
      [[75, 8], [200, 12], [500, 18], [null, 25]]
    );
    assert.equal(getShippingPrice("Ship", 50), 8);
    assert.equal(getShippingPrice("Ship", 75), 8);
    assert.equal(getShippingPrice("Ship", 75.01), 12);
    assert.equal(getShippingPrice("Ship", 500), 18);
    assert.equal(getShippingPrice("Ship", 9999), 25);
    assert.equal(getShippingPrice("Pickup", 9999), 0);
    assert.equal(quoteStickerShipping({ deliveryMethod: "Pickup", goodsSubtotal: 500 }).method, "none");
  });

  test("the cart quote is unchanged by the new inputs while the tables are empty", () => {
    const before = quoteStickerCart({ materialPrices: [70], deliveryMethod: "Ship" });
    const after = quoteStickerCart({ materialPrices: [70], deliveryMethod: "Ship", items: hundredThreeInch, destZip: "90210" });
    assert.equal(after.total, before.total);
    assert.equal(after.shippingPrice, before.shippingPrice);
    assert.equal(typeof after.shippingNote, "string");
  });
});

describe("the weight model", () => {
  test("100 x 3\" is about a pound of vinyl in a small box", () => {
    const p = estimateParcel(hundredThreeInch);
    // 900 sq in = 6.25 sq ft, x1.25 waste = 7.81 sq ft, x0.1 lb = 0.78 lb
    assert.equal(p.vinylSqFt, 7.81);
    assert.equal(p.vinylLb, 0.78);
    assert.equal(p.package.name, "small box");
    assert.equal(p.boxes, 1);
    assert.ok(p.billableLbPerBox > 1 && p.billableLbPerBox < 1.5, `got ${p.billableLbPerBox} lb`);
  });

  test("a handful of small stickers goes in a rigid mailer, and a huge run in several boxes", () => {
    assert.equal(estimateParcel([{ quantity: 25, widthInches: 2, heightInches: 2 }]).package.name, "rigid mailer");
    const big = estimateParcel([{ quantity: 5000, widthInches: 6, heightInches: 6 }]);
    assert.equal(big.package.name, PACKAGES[PACKAGES.length - 1].name);
    assert.ok(big.boxes > 1, "1,250 sq ft of vinyl does not fit one box");
    assert.ok(big.billableLbPerBox <= 70, "no box may exceed Ground Advantage's 70 lb");
  });

  test("more designs weigh more; nothing weighs less than its box", () => {
    const one = estimateParcel(hundredThreeInch);
    const two = estimateParcel([...hundredThreeInch, { quantity: 100, widthInches: 2, heightInches: 2 }]);
    assert.ok(two.billableLbPerBox > one.billableLbPerBox);
    assert.ok(estimateParcel([{ quantity: 0, widthInches: 0, heightInches: 0 }]).billableLbPerBox >= PACKAGES[0].emptyLb);
  });

  test("dimensional weight only bites over a cubic foot", () => {
    for (const pkg of PACKAGES) {
      const cuIn = pkg.dims[0] * pkg.dims[1] * pkg.dims[2];
      assert.ok(cuIn <= 1728, `${pkg.name} is over a cubic foot and would be DIM-rated`);
    }
  });
});

describe("with tables supplied, it rates by zone and weight", () => {
  test("zone lookup reads the first three digits and refuses short input", () => {
    assert.equal(zoneForZip("02116", FIXTURE), 1);
    assert.equal(zoneForZip("10001", FIXTURE), 3);
    assert.equal(zoneForZip("90210-1234", FIXTURE), 8);
    assert.equal(zoneForZip("021", FIXTURE), null);
    assert.equal(zoneForZip("", FIXTURE), null);
    assert.equal(zoneForZip("02116"), null, "the live table is empty, so no zone");
  });

  test("the rate is the first weight step at or above the parcel, in the zone's column", () => {
    assert.equal(groundAdvantageRate(0.2, 1, FIXTURE), 4.5);
    assert.equal(groundAdvantageRate(1, 3, FIXTURE), 5.5);
    assert.equal(groundAdvantageRate(1.01, 3, FIXTURE), 6.3);
    assert.equal(groundAdvantageRate(70, 9, FIXTURE), 135);
    assert.equal(groundAdvantageRate(70.5, 9, FIXTURE), null, "over 70 lb is not a Ground Advantage parcel");
    assert.equal(groundAdvantageRate(1, 10, FIXTURE), null);
    assert.equal(groundAdvantageRate(0, 1, FIXTURE), null);
  });

  test("100 x 3\" to Boston is one small box at the 2 lb step, zone 1", () => {
    const q = quoteStickerShipping({ deliveryMethod: "Ship", goodsSubtotal: 85, items: hundredThreeInch, destZip: "02116", tables: FIXTURE });
    assert.equal(q.method, "ground-advantage");
    assert.equal(q.zone, 1);
    assert.equal(q.price, 5.9);
    assert.match(q.note, /USPS Ground Advantage to 02116 \(zone 1\), small box at ~1\.2\d? lb/);
  });

  test("the same box to California costs more, and several boxes multiply", () => {
    const east = quoteStickerShipping({ deliveryMethod: "Ship", goodsSubtotal: 85, items: hundredThreeInch, destZip: "02116", tables: FIXTURE });
    const west = quoteStickerShipping({ deliveryMethod: "Ship", goodsSubtotal: 85, items: hundredThreeInch, destZip: "90210", tables: FIXTURE });
    assert.ok(west.price > east.price);

    const big = [{ quantity: 5000, widthInches: 6, heightInches: 6 }];
    const q = quoteStickerShipping({ deliveryMethod: "Ship", goodsSubtotal: 2000, items: big, destZip: "02116", tables: FIXTURE });
    assert.equal(q.method, "ground-advantage");
    assert.ok(q.parcel && q.parcel.boxes > 1);
    const perBox = groundAdvantageRate(q.parcel!.billableLbPerBox, 1, FIXTURE)!;
    assert.equal(q.price, Math.round(perBox * q.parcel!.boxes * 100) / 100);
    assert.match(q.note, new RegExp(`${q.parcel!.boxes} x medium box`));
  });

  test("no ZIP, an unzoned ZIP, or no items each fall back to the tiers — never zero", () => {
    const base = { deliveryMethod: "Ship", goodsSubtotal: 85, items: hundredThreeInch, tables: FIXTURE };
    assert.equal(quoteStickerShipping({ ...base }).method, "tier");
    assert.equal(quoteStickerShipping({ ...base, destZip: "00500" }).method, "tier");
    assert.equal(quoteStickerShipping({ deliveryMethod: "Ship", goodsSubtotal: 85, destZip: "02116", tables: FIXTURE }).method, "tier");
    for (const q of [
      quoteStickerShipping({ ...base }),
      quoteStickerShipping({ ...base, destZip: "00500" }),
    ]) {
      assert.ok(q.price > 0, "a shipped order never ships for free");
    }
  });
});

describe("the ZIP field", () => {
  test("five digits, ZIP+4 accepted, everything else refused", () => {
    assert.equal(isUsZip("01970"), true);
    assert.equal(isUsZip(" 01970 "), true);
    assert.equal(isUsZip("01970-1234"), true);
    assert.equal(isUsZip("0197"), false);
    assert.equal(isUsZip("0197a"), false);
    assert.equal(isUsZip(""), false);
    assert.equal(isUsZip(undefined), false);
  });

  test("required when shipping, not when picking up, and it lives on the details step", () => {
    const order = (production: Record<string, string>) =>
      ({
        items: [{ id: "a", widthInches: 3, heightInches: 3, quantity: 100, artwork: { file: { name: "a.png" } } }],
        production: { needBy: "2026-10-01", ...production },
        customer: { customerName: "Dana", email: "dana@example.com" },
      }) as unknown as Parameters<typeof getOrderFieldErrors>[0];

    assert.equal(getOrderFieldErrors(order({ deliveryMethod: "Ship", shipZip: "" })).shipZip, "Enter the 5-digit ZIP code we're shipping to.");
    assert.equal(getOrderFieldErrors(order({ deliveryMethod: "Ship", shipZip: "021" })).shipZip, "Enter the 5-digit ZIP code we're shipping to.");
    assert.equal(getOrderFieldErrors(order({ deliveryMethod: "Ship", shipZip: "02116" })).shipZip, undefined);
    assert.equal(getOrderFieldErrors(order({ deliveryMethod: "Pickup", shipZip: "" })).shipZip, undefined);
    assert.equal(FIELD_STEP.shipZip, "details");
  });

  test("submit refuses a shipped order with no ZIP — the field list and the problem list agree", () => {
    const order = (production: Record<string, string>) =>
      ({
        items: [{ id: "a", widthInches: 3, heightInches: 3, quantity: 100, artwork: { file: { name: "a.png" } } }],
        production: { needBy: "2026-10-01", ...production },
        customer: { customerName: "Dana", email: "dana@example.com" },
      }) as unknown as Parameters<typeof getOrderFieldErrors>[0];

    // The first browser drive submitted "1234" and reached the confirmation
    // screen: the ZIP rule was in the field map, but not in the problem list
    // that submit reads. This is the property, not the instance.
    const short = getOrderValidationErrors(order({ deliveryMethod: "Ship", shipZip: "1234" }));
    assert.ok(short.some((m) => /5-digit ZIP/.test(m)), "a 4-digit ZIP must block submit");
    assert.equal(isOrderReady(order({ deliveryMethod: "Ship", shipZip: "1234" })), false);
    assert.equal(isOrderReady(order({ deliveryMethod: "Ship", shipZip: "02116" })), true);
    assert.equal(isOrderReady(order({ deliveryMethod: "Pickup", shipZip: "" })), true);

    // Every field key the sticker flow can raise must surface as a problem.
    // width/height fold into one "width" problem by design.
    const emptyShipped = order({ deliveryMethod: "Ship", shipZip: "" });
    (emptyShipped as unknown as { items: Array<Record<string, unknown>> }).items[0] = {
      id: "a", widthInches: 0, heightInches: 0, quantity: 0, artwork: { file: null },
    };
    (emptyShipped as unknown as { production: Record<string, string> }).production.needBy = "";
    (emptyShipped as unknown as { customer: Record<string, string> }).customer = { customerName: "", email: "" };
    const fields = getOrderFieldErrors(emptyShipped);
    const problems = getOrderValidationErrors(emptyShipped);
    // width and height fold into one problem, so the count is one less than
    // the field map — and not a single one fewer than that.
    assert.equal(problems.length, Object.keys(fields).length - 1, `fields ${Object.keys(fields).join(",")} vs problems ${problems.join(" | ")}`);
    assert.ok(problems.some((m) => /5-digit ZIP/.test(m)));
  });
});

describe("the ZIP and the basis reach the shop, and the server bills what the browser showed", () => {
  const shipped = {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: { deliveryMethod: "Ship", shipZip: "02116", needBy: "2026-10-01" },
    product: { type: "Custom Stickers", quantity: 100 },
    items: [
      { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Gloss White Vinyl", shape: "Circle", artwork: { file: { name: "a.png" } } },
    ],
    pricing: { total: 0 },
  };

  test("repriceStickers carries the shipping note and the tiered price", () => {
    const priced = repriceStickers(shipped);
    const pricing = priced.order.pricing as Record<string, unknown>;
    assert.equal(pricing.shippingPrice, DECAL_SHIPPING_PRICE);
    assert.match(String(pricing.shippingNote), /Shipping \(tiered on order size\) — est\. 1\.\d+ lb, small box/);
    assert.equal(priced.unpriceable, false);
  });

  test("the shop email shows the ZIP and the shipping basis", () => {
    const priced = repriceStickers(shipped);
    const text = buildQuoteEmail({ quoteNumber: "GS-TEST", receivedAt: new Date().toISOString(), order: priced.order, artworkAnalysis: null }).text;
    assert.match(text, /Ship to customer — ZIP 02116/);
    assert.match(text, /Shipping basis/);
    assert.match(text, /tiered on order size/);
  });

  test("the Printavo note names the ZIP and the basis beside the shipping figure", () => {
    const priced = repriceStickers(shipped);
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-TEST", order: priced.order, artworkAnalysis: null });
    assert.match(plan.customerNote, /Ship to ZIP: 02116/);
    assert.match(plan.customerNote, /Shipping: \$12\.00 — Shipping \(tiered on order size\)/);
    assert.equal(plan.shippingLineItem?.price, DECAL_SHIPPING_PRICE);
  });
});
