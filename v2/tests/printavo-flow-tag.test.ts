/**
 * WHICH PRODUCT IS THIS? — the tag Printavo needs to tell the pipelines apart.
 *
 * Gabe, 2026-09-17, asking to automate "paid in full" into the Lab Order
 * Placed status: *"For all but the apparel products."*
 *
 * Printavo's automations are account-wide — one trigger, every order — so
 * "all but apparel" needs something ON the order that says which pipeline it
 * came from. Nothing did: a sticker quote, a banner and a 24-shirt run were
 * tagged identically (#GorillaOrder, #WebQuote, #Unconfirmed).
 *
 * What is pinned here is the property that makes a filter writable at all:
 * EXACTLY ONE of the three, on EVERY order, whatever else is going on with
 * it. A missing tag on some third case is a filter with a silent hole, and
 * the hole would be an apparel order swept into the lab workflow by an
 * automation written to skip it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";

const FLOW_TAGS = ["#Stickers", "#Signs", "#Apparel"] as const;

const base = {
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod: "Pickup", needBy: "2026-10-05", deadlineType: "Flexible" },
  pricing: { total: 85, stickerPrice: 70, setupPrice: 15 },
};

const plan = (order: Record<string, unknown>) =>
  buildPrintavoQuotePlan({
    quoteNumber: "GS-TEST",
    order: { ...base, ...order },
    artworkAnalysis: null,
  });

/** One row per pipeline, shaped the way each flow really submits. */
const ORDERS: Array<[string, string, Record<string, unknown>]> = [
  [
    "a sticker order",
    "#Stickers",
    {
      product: { type: "Custom Stickers", quantity: 100, widthInches: 3, heightInches: 3 },
      items: [
        {
          id: "d1",
          quantity: 100,
          widthInches: 3,
          heightInches: 3,
          material: "Gloss White Vinyl",
          shape: "Circle",
          linePrice: 70,
          lineUnitPrice: 0.7,
        },
      ],
    },
  ],
  [
    "a banner",
    "#Signs",
    {
      product: { type: "Banners & Signs", signType: "Vinyl banner", quantity: 1, size: '48" x 24"' },
      pricing: { total: 87, unitPrice: 87, lines: [] },
    },
  ],
  [
    "a yard sign",
    "#Signs",
    {
      product: { type: "Yard Signs", signType: "Coroplast", quantity: 5, size: '18" x 24"' },
      pricing: { total: 108, unitPrice: 21.6, lines: [] },
    },
  ],
  [
    "an apparel request",
    "#Apparel",
    {
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "Basic Tee",
        quantity: 24,
        garmentColor: "White",
        printLocations: ["Front"],
        inkColors: "1 color",
      },
      pricing: { total: 0, quoteRequired: true },
    },
  ],
];

describe("every Printavo order says which pipeline it is", () => {
  for (const [name, expected, order] of ORDERS) {
    test(`${name} is tagged ${expected}, and only that`, () => {
      const tags = plan(order).tags;

      assert.ok(tags.includes(expected), `missing ${expected} — got ${tags.join(" ")}`);

      const others = FLOW_TAGS.filter((tag) => tag !== expected);
      for (const tag of others) {
        assert.equal(tags.includes(tag), false, `also tagged ${tag}`);
      }
    });
  }

  test("exactly one flow tag, on every order, with no gap in the middle", () => {
    for (const [name, , order] of ORDERS) {
      const matched = plan(order).tags.filter((tag) =>
        (FLOW_TAGS as readonly string[]).includes(tag)
      );

      assert.equal(matched.length, 1, `${name} carries ${matched.length} flow tags`);
    }
  });

  test("the tag survives a counter order and a hand-quoted one", () => {
    // The two states that change the rest of the tag list. An automation
    // written as "is not #Apparel" must not be defeated by a walk-in.
    const counter = plan({
      ...ORDERS[0][2],
      kiosk: { mode: "staff", staffName: "Sam" },
    }).tags;

    assert.ok(counter.includes("#Stickers"));
    assert.ok(counter.includes("#InStore"), "fixture no longer exercises the kiosk path");

    const handQuoted = plan(ORDERS[3][2]).tags;
    assert.ok(handQuoted.includes("#Apparel"));
    assert.ok(
      handQuoted.includes("#NeedsPricing"),
      "fixture no longer exercises the hand-pricing path"
    );
  });

  test("the tags Printavo already filtered on are untouched", () => {
    const tags = plan(ORDERS[0][2]).tags;

    for (const tag of ["#GorillaOrder", "#WebQuote", "#Unconfirmed"]) {
      assert.ok(tags.includes(tag), `lost ${tag}`);
    }
  });
});
