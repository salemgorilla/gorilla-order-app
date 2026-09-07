/**
 * THE CODE THE CUSTOMER SEES IS THE CODE THE SHOP BILLS UNDER.
 *
 * The review screen and the confirmation ticket print an item number on
 * every line — GORILLA-DECAL-2, GORILLA-SIGN-YARD-SIGNS, GORILLA-APPAREL-5000.
 * The house rule on spec furniture is that it points at a real value, and
 * the only real value for a line's code is the item number Printavo files
 * that line under. Both surfaces derive their codes from lib/sku.ts; this
 * test drives the REAL payload composition through buildPrintavoQuotePlan
 * and holds the invoice's item numbers equal to what those same functions
 * say. If someone hand-types a code into a component, or the plan renames
 * a SKU, the two sides part and this fails.
 *
 * Same fixtures and same composition as tests/quote-invoice-sweep.test.ts:
 * the sweep holds the MONEY equal, this holds the NAMES equal.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { quoteApparelCart } from "../lib/apparel-cart";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { defaultSignsDesign, getSignProduct, type SignsDesign } from "../lib/signs";
import { quoteSignsCart, withSignsRush } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import {
  SKU,
  SKU_FAMILY,
  apparelLineSku,
  apparelSku,
  decalSku,
  signFeeSku,
  signSku,
} from "../lib/sku";
import { repriceStickers } from "../lib/sticker-repricing";

const CONTACT = { customerName: "Sku", email: "sku@example.com" };
const TODAY = "2026-09-04";
const RUSH_DATE = "2026-09-17";
const STANDARD_DATE = "2026-10-14";

describe("stickers: the review's codes are the invoice's item numbers", () => {
  const carts: Array<[string, Array<Record<string, unknown>>]> = [
    ["one design", [{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" }]],
    [
      "three designs",
      [
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss" },
        { id: "d3", quantity: 100, widthInches: 4, heightInches: 6, material: "Chrome" },
      ],
    ],
  ];

  for (const [name, items] of carts) {
    test(name, () => {
      const priced = repriceStickers({
        customer: CONTACT,
        production: { needBy: STANDARD_DATE, deliveryMethod: "Ship" },
        product: {
          type: "Custom Stickers",
          quantity: items.reduce((sum, i) => sum + Number(i.quantity), 0),
        },
        items,
        pricing: { total: 0 },
      });
      const plan = buildPrintavoQuotePlan({
        quoteNumber: "GS-SKU",
        order: priced.order,
        artworkAnalysis: null,
      });

      // What QuoteReviewCard and QuoteConfirmation render per design.
      assert.deepEqual(
        plan.lineItems.map((l) => l.itemNumber),
        items.map((_, index) => decalSku(index, items.length))
      );
      assert.deepEqual(
        plan.feeLineItems.map((f) => f.itemNumber),
        [SKU.DECAL_SETUP]
      );
      assert.equal(plan.shippingLineItem?.itemNumber, SKU.SHIPPING);
      for (const code of plan.lineItems.map((l) => l.itemNumber)) {
        assert.ok(code.startsWith(SKU_FAMILY.stickers), code);
      }
    });
  }

  test("a single design is the bare family code, a cart is numbered", () => {
    assert.equal(decalSku(0, 1), "GORILLA-DECAL");
    assert.equal(decalSku(0, 2), "GORILLA-DECAL-1");
    assert.equal(decalSku(1, 2), "GORILLA-DECAL-2");
  });
});

describe("signs: product codes and charge codes", () => {
  const YARD: SignsDesign = {
    ...defaultSignsDesign,
    productId: "yard-sign",
    quantity: 25,
    size: '18" x 24"',
    signAddOns: ["holes"],
  };
  const BANNER: SignsDesign = {
    ...defaultSignsDesign,
    id: "banner",
    productId: "vinyl-banner",
    quantity: 2,
    size: "3' x 6'",
    bannerAddOns: ["polePockets"],
  };

  for (const [name, designs, needBy] of [
    ["one yard sign order, rushed", [YARD], RUSH_DATE],
    ["a two-design cart", [YARD, BANNER], STANDARD_DATE],
  ] as Array<[string, SignsDesign[], string]>) {
    test(name, () => {
      const pricing = withSignsRush(quoteSignsCart(designs), {
        needBy,
        lane: "slow",
        today: TODAY,
      });
      assert.equal(pricing.priceable, true);

      const plan = buildPrintavoQuotePlan({
        quoteNumber: "GS-SKU",
        order: {
          customer: CONTACT,
          production: { needBy, deliveryMethod: "Pickup" },
          ...buildSignsPayloadParts(designs, pricing, "signs"),
        },
        artworkAnalysis: null,
      });

      // One row per design, named by the product — exactly what the review
      // card's CodeRow computes from the design's productId.
      assert.deepEqual(
        plan.lineItems.map((l) => l.itemNumber),
        designs.map((d) => signSku(getSignProduct(d.productId).label))
      );

      // Every fee row is a charge code under the signs family, or rush.
      const fees = plan.feeLineItems.map((f) => f.itemNumber);
      assert.ok(fees.length > 0, "the fixture produced no fee rows");
      for (const code of fees) {
        assert.ok(
          code === SKU.RUSH || code.startsWith(`${SKU_FAMILY.signs}-`),
          code
        );
      }
      assert.ok(fees.includes(signFeeSku("SETUP")), fees.join(", "));
      assert.ok(fees.includes(signFeeSku("ADDON-HOLES")), fees.join(", "));
      assert.equal(fees.includes(SKU.RUSH), needBy === RUSH_DATE);
    });
  }

  test("the same product files under the same code, cart or not", () => {
    assert.equal(signSku("Yard Signs"), "GORILLA-SIGN-YARD-SIGNS");
    assert.equal(signSku("Vinyl Banners"), "GORILLA-SIGN-VINYL-BANNERS");
  });
});

describe("apparel: the style is the code", () => {
  const print = { printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false };

  test("one garment files under its S&S style", () => {
    const single = quoteApparelCart(
      [{ id: "l1", garmentLabel: "Tee", colorName: "White", garmentUnitPrice: 3.49, quantity: 24 }],
      print
    );
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-SKU",
      order: {
        customer: CONTACT,
        production: { needBy: STANDARD_DATE, deliveryMethod: "Pickup" },
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "T-Shirts",
          quantity: 24,
          sizeBreakdown: "M-24",
          printLocations: print.printLocations,
          inkColors: print.inkColors,
          supplier: { productName: "Gildan 5000", catalogStyle: "5000", markedUpGarmentPrice: 3.49 },
        },
        pricing: { ...single, quoteRequired: false },
      },
      artworkAnalysis: null,
    });

    assert.deepEqual(
      plan.lineItems.map((l) => l.itemNumber),
      [apparelSku("5000")]
    );
    assert.deepEqual(
      plan.feeLineItems.map((f) => f.itemNumber),
      [SKU.APPAREL_PRINT, SKU.APPAREL_SETUP]
    );
  });

  test("a cart files each garment line under its own code", () => {
    const lines = [
      { id: "l1", garmentLabel: "Basic Tee", colorName: "White", catalogStyle: "5000", garmentUnitPrice: 3.49, quantity: 20 },
      { id: "l2", garmentLabel: "Classic Hoodie", colorName: "Black", garmentUnitPrice: 14.87, quantity: 20 },
    ];
    const cart = quoteApparelCart(lines, print);
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-SKU",
      order: {
        customer: CONTACT,
        production: { needBy: STANDARD_DATE, deliveryMethod: "Pickup" },
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "T-Shirts",
          quantity: cart.quantity,
          printLocations: print.printLocations,
          inkColors: print.inkColors,
          garmentLines: lines,
          supplier: { productName: "Gildan 5000", catalogStyle: "5000", markedUpGarmentPrice: cart.garmentUnitPrice },
        },
        pricing: { ...cart, quoteRequired: false },
      },
      artworkAnalysis: null,
    });

    // What the review card prints under each garment.
    assert.deepEqual(
      plan.lineItems.map((l) => l.itemNumber),
      cart.lines.map((line, index) => apparelLineSku(line, index))
    );
    assert.deepEqual(
      plan.lineItems.map((l) => l.itemNumber),
      ["GORILLA-APPAREL-5000", "GORILLA-APPAREL-CLASSIC-HOODIE"]
    );
  });
});

describe("nobody hand-types a code", () => {
  /**
   * The point of lib/sku.ts is that there is one spelling of each code. A
   * literal "GORILLA-" in a component or in printavo.ts is a second
   * spelling waiting to drift; comments may mention codes, code may not.
   */
  const files = [
    "../lib/printavo.ts",
    "../features/QuoteReviewCard.tsx",
    "../features/QuoteConfirmation.tsx",
    "../app/page.tsx",
  ];

  for (const file of files) {
    test(`${file} builds codes from lib/sku.ts`, () => {
      const source = readFileSync(new URL(file, import.meta.url), "utf8")
        .split("\n")
        // Strip comment lines — they are allowed to talk about codes.
        .filter((line) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
        .join("\n");

      assert.doesNotMatch(
        source,
        /["'`]GORILLA-/,
        `${file} spells a GORILLA- code by hand`
      );
    });
  }
});
