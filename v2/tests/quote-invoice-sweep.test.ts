/**
 * THE MONEY INVARIANT, SWEPT: whatever the website quoted, Printavo invoices.
 *
 * ── WHY THIS EXISTS ALONGSIDE tests/money-path.test.ts ────────────────────
 * money-path is a curated file — every case in it is a bug that actually
 * shipped, kept as its own named regression. It asserts this same invariant,
 * and it did not catch the rush defect (#107), for a reason worth stating
 * plainly rather than fixing quietly:
 *
 *   its signs cases BUILD THE PAYLOAD BY HAND. They call the pricing engine,
 *   then assemble `{ total, unitPrice, lines }` themselves and hand that to
 *   buildPrintavoQuotePlan. The real page builds its payload through
 *   buildSignsPayloadParts, which is where the rush fee was being dropped —
 *   so the tests agreed with themselves about a payload nothing sends.
 *
 * The result: a rushed two-design signs quote invoiced $655.00 against
 * $818.75 quoted, and no test in the repo could see it. This file closes
 * that by construction. Everything below goes through the REAL composition
 * the browser uses — withSignsRush / withApparelRush / buildSignsPayloadParts
 * / repriceStickers — and sweeps the dimensions where a charge can hide:
 * rush or not, one design or a cart, pickup or shipped, add-ons or not.
 *
 * It is a sweep, not a set of stories. When one of these fails, look for the
 * charge that reached one side and not the other.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { quoteApparelCart, withApparelRush } from "../lib/apparel-cart";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { defaultSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart, withSignsRush } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceStickers } from "../lib/sticker-repricing";
import { getSignsTotals, getStickerTotals } from "../lib/tax";

type Plan = ReturnType<typeof buildPrintavoQuotePlan>;

/**
 * What Printavo will actually invoice, pre-tax.
 *
 * Every price goes through toFixed(4) FIRST, because that is what Printavo
 * stores — a unit price at four decimals, multiplied by the count. Summing
 * raw floats would reproduce our own arithmetic and agree no matter what we
 * sent. (The same reasoning, and the same helper, as money-path.)
 */
function invoiceTotal(plan: Plan): number {
  const stored = (price: number) => Number(price.toFixed(4));

  const goods = plan.lineItems.reduce(
    (sum, line) => sum + stored(line.price) * Math.max(1, line.quantity),
    0
  );
  const fees = plan.feeLineItems.reduce((sum, fee) => sum + stored(fee.price), 0);
  const shipping = stored(plan.shippingLineItem?.price ?? 0);

  return Math.round((goods + fees + shipping) * 100) / 100;
}

/** What Printavo will tax: the lines whose own flag says so. */
function invoiceTaxableBase(plan: Plan): number {
  const goods =
    plan.salesTaxRate !== null
      ? plan.lineItems.reduce(
          (sum, line) => sum + line.price * Math.max(1, line.quantity),
          0
        )
      : 0;
  const fees = plan.feeLineItems
    .filter((fee) => fee.taxed)
    .reduce((sum, fee) => sum + fee.price, 0);

  return Math.round((goods + fees) * 100) / 100;
}

const CONTACT = { customerName: "Sweep", email: "sweep@example.com" };

// Fixed dates so the sweep is the same sweep every day. 2026-09-04 is a
// Friday; 09-17 is inside the rush window for the slow lane, 10-14 is past
// the standard 14-business-day floor.
const TODAY = "2026-09-04";
const RUSH_DATE = "2026-09-17";
const STANDARD_DATE = "2026-10-14";

// ─── SIGNS ─────────────────────────────────────────────────────────────────

describe("signs: every shape, rushed and not, quote === invoice", () => {
  const YARD: SignsDesign = {
    ...defaultSignsDesign,
    productId: "yard-sign",
    quantity: 25,
    size: '18" x 24"',
  };
  const STAKED: SignsDesign = { ...YARD, id: "staked", finishing: "With Step Stakes" };
  const BANNER: SignsDesign = {
    ...defaultSignsDesign,
    id: "banner",
    productId: "vinyl-banner",
    quantity: 2,
    size: "3' x 6'",
  };
  const BANNER_ADDONS: SignsDesign = {
    ...BANNER,
    id: "banner-addons",
    bannerAddOns: ["polePockets"],
  };
  const RIGID: SignsDesign = {
    ...defaultSignsDesign,
    id: "rigid",
    productId: "rigid-sign",
    quantity: 4,
    size: '18" x 24"',
    // Rigid signs price per square foot BY MATERIAL, and the default design's
    // material is a banner vinyl — an unpriceable combination that falls into
    // the hand-quote branch. The priceable/hand-quote guard above caught the
    // fixture; without it this whole case would have passed while testing
    // nothing, which is the failure mode a sweep is most prone to.
    material: 'PVC 1/8"',
    finishing: "Drilled Holes",
  };

  const shapes: Array<[string, SignsDesign[]]> = [
    ["one yard sign order", [YARD]],
    ["yard signs with step stakes", [STAKED]],
    ["a banner", [BANNER]],
    ["a banner with finishing add-ons", [BANNER_ADDONS]],
    ["a rigid sign", [RIGID]],
    ["a two-design cart", [YARD, BANNER]],
    ["a three-design cart with everything on it", [STAKED, BANNER_ADDONS, RIGID]],
  ];

  for (const [name, designs] of shapes) {
    for (const [when, needBy] of [
      ["standard", STANDARD_DATE],
      ["rushed", RUSH_DATE],
    ] as const) {
      test(`${name}, ${when}`, () => {
        const pricing = withSignsRush(quoteSignsCart(designs), {
          needBy,
          lane: "slow",
          today: TODAY,
        });

        assert.equal(
          pricing.priceable,
          true,
          "fell into the hand-quote branch — the fixture is wrong and this case tests nothing"
        );
        assert.equal(
          (pricing.rushFee ?? 0) > 0,
          when === "rushed",
          "the rush dimension is not actually varying"
        );

        const plan = buildPrintavoQuotePlan({
          quoteNumber: "GS-SWEEP",
          order: {
            customer: CONTACT,
            production: { needBy, deliveryMethod: "Pickup" },
            ...buildSignsPayloadParts(designs, pricing, "signs"),
          },
          artworkAnalysis: null,
        });

        assert.equal(
          invoiceTotal(plan),
          pricing.total,
          `Printavo would bill ${invoiceTotal(plan)} for a ${pricing.total} quote`
        );

        // And the tax the customer was shown is the tax Printavo will
        // compute — the second half of "agrees with the invoice", and the
        // half that moved on 4 Sep when fees stopped being taxed.
        assert.equal(
          getSignsTotals({ total: pricing.total, feeTotal: pricing.feeTotal })
            .taxableSubtotal,
          invoiceTaxableBase(plan),
          "the estimate and the invoice tax different amounts"
        );
      });
    }
  }
});

// ─── APPAREL ───────────────────────────────────────────────────────────────

describe("apparel: cart lines and rush, quote === invoice", () => {
  const carts: Array<[string, Parameters<typeof quoteApparelCart>[0]]> = [
    [
      "one garment",
      [{ id: "l1", garmentLabel: "Tee", colorName: "White", garmentUnitPrice: 3.49, quantity: 24 }],
    ],
    [
      "two garments, combined into one tier",
      [
        { id: "l1", garmentLabel: "Tee", colorName: "White", garmentUnitPrice: 3.49, quantity: 20 },
        { id: "l2", garmentLabel: "Hoodie", colorName: "Black", garmentUnitPrice: 14.87, quantity: 20 },
      ],
    ],
    [
      // Quantities and prices chosen to land off clean cents once divided.
      "three lines at awkward quantities",
      [
        { id: "l1", garmentLabel: "Tee", colorName: "White", garmentUnitPrice: 5.49, quantity: 7 },
        { id: "l2", garmentLabel: "Tee", colorName: "Navy", garmentUnitPrice: 5.83, quantity: 33 },
        { id: "l3", garmentLabel: "Long sleeve", colorName: "Red", garmentUnitPrice: 9.12, quantity: 111 },
      ],
    ],
  ];

  const print = {
    printLocations: ["Front", "Back"],
    inkColors: "3 colors",
    hasUnderbase: true,
  };

  for (const [name, lines] of carts) {
    for (const [when, needBy] of [
      ["standard", STANDARD_DATE],
      ["rushed", RUSH_DATE],
    ] as const) {
      test(`${name}, ${when}`, () => {
        const pricing = withApparelRush(quoteApparelCart(lines, print), {
          needBy,
          lane: "slow",
          today: TODAY,
        });

        assert.equal((pricing.rushFee ?? 0) > 0, when === "rushed");

        const plan = buildPrintavoQuotePlan({
          quoteNumber: "GS-SWEEP",
          order: {
            customer: CONTACT,
            production: { needBy, deliveryMethod: "Pickup" },
            product: {
              type: "T-Shirts & Apparel",
              garmentType: "T-Shirts",
              quantity: pricing.quantity,
              printLocations: print.printLocations,
              inkColors: print.inkColors,
              supplier: {
                productName: "Gildan 5000",
                markedUpGarmentPrice: pricing.garmentUnitPrice,
              },
            },
            // The live payload spreads the pricing object, so the sweep does
            // too — that spread is exactly what carried `rushFee` on apparel
            // while signs, which names its fields, dropped it.
            pricing: { ...pricing, quoteRequired: false },
          },
          artworkAnalysis: null,
        });

        assert.equal(
          invoiceTotal(plan),
          pricing.total,
          `Printavo would bill ${invoiceTotal(plan)} for a ${pricing.total} quote`
        );

        // Clothing is MA-exempt: no rate, and nothing to tax.
        assert.equal(plan.salesTaxRate, null);
        assert.equal(invoiceTaxableBase(plan), 0);
      });
    }
  }
});

describe("the apparel cart's rows are additive, not a rewrite", () => {
  /**
   * The live flow prices a cart of ONE (app/page.tsx routes the single
   * garment configurator through the cart engine), so the one-line shape is
   * what every apparel order in production actually is. It has to reach
   * Printavo exactly as it always has — one row, the S&S style as its SKU,
   * the real size breakdown on it — or this change repriced live orders
   * while claiming to prepare for a UI that does not exist yet.
   */
  const single = quoteApparelCart(
    [{ id: "l1", garmentLabel: "Tee", colorName: "White", garmentUnitPrice: 3.49, quantity: 24 }],
    { printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false }
  );

  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-SWEEP",
    order: {
      customer: CONTACT,
      production: { needBy: STANDARD_DATE, deliveryMethod: "Pickup" },
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "T-Shirts",
        quantity: 24,
        sizeBreakdown: "M-24",
        printLocations: ["Front"],
        inkColors: "1 color",
        supplier: {
          productName: "Gildan 5000",
          catalogStyle: "5000",
          markedUpGarmentPrice: 3.49,
        },
      },
      pricing: { ...single, quoteRequired: false },
    },
    artworkAnalysis: null,
  });

  test("one garment is still one row, under the style SKU", () => {
    assert.equal(plan.lineItems.length, 1);
    assert.equal(plan.lineItems[0].itemNumber, "GORILLA-APPAREL-5000");
    assert.equal(plan.lineItems[0].price, 3.49);
    assert.equal(plan.lineItems[0].quantity, 24);
  });

  test("and it still carries the size breakdown", () => {
    // The per-line size counts a cart cannot state yet. Losing these would
    // hand the shop 24 pieces of "size_other" to sort out by hand.
    assert.deepEqual(plan.lineItems[0].sizes, [{ size: "size_m", count: 24 }]);
  });

  test("a two-line cart bills each garment at its own price", () => {
    const cart = quoteApparelCart(
      [
        { id: "l1", garmentLabel: "Tee", colorName: "White", garmentUnitPrice: 3.49, quantity: 20 },
        { id: "l2", garmentLabel: "Hoodie", colorName: "Black", garmentUnitPrice: 14.87, quantity: 20 },
      ],
      { printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false }
    );

    const cartPlan = buildPrintavoQuotePlan({
      quoteNumber: "GS-SWEEP",
      order: {
        customer: CONTACT,
        production: { needBy: STANDARD_DATE, deliveryMethod: "Pickup" },
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "T-Shirts",
          quantity: cart.quantity,
          supplier: { productName: "Mixed", markedUpGarmentPrice: cart.garmentUnitPrice },
        },
        pricing: { ...cart, quoteRequired: false },
      },
      artworkAnalysis: null,
    });

    assert.equal(cartPlan.lineItems.length, 2);
    assert.deepEqual(
      cartPlan.lineItems.map((line) => [line.itemNumber, line.price, line.quantity]),
      [
        ["GORILLA-APPAREL-TEE", 3.49, 20],
        ["GORILLA-APPAREL-HOODIE", 14.87, 20],
      ]
    );
    // The blended figure is still what the HEADLINE reads; it is simply not
    // what anything is billed at.
    assert.notEqual(cart.garmentUnitPrice, 3.49);
    assert.equal(invoiceTotal(cartPlan), cart.total);
  });
});

// ─── STICKERS ──────────────────────────────────────────────────────────────

describe("stickers: the auto-billing flow, quote === invoice", () => {
  // Stickers never carry rush — the fast lane does not sell it, because they
  // check out unattended (lib/rush.ts says why). The dimensions that DO vary
  // are cart size and delivery.
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
    [
      "awkward quantities",
      [
        { id: "d1", quantity: 7, widthInches: 2.25, heightInches: 1.75, material: "Matte" },
        { id: "d2", quantity: 33, widthInches: 2.25, heightInches: 1.75, material: "Chrome" },
      ],
    ],
  ];

  for (const [name, items] of carts) {
    for (const deliveryMethod of ["Pickup", "Ship"] as const) {
      test(`${name}, ${deliveryMethod.toLowerCase()}`, () => {
        const priced = repriceStickers({
          customer: CONTACT,
          production: { needBy: STANDARD_DATE, deliveryMethod },
          product: {
            type: "Custom Stickers",
            quantity: items.reduce((sum, i) => sum + Number(i.quantity), 0),
          },
          items,
          pricing: { total: 0 },
        });

        const pricing = priced.order.pricing as {
          stickerPrice: number;
          setupPrice: number;
          shippingPrice: number;
          total: number;
        };

        const plan = buildPrintavoQuotePlan({
          quoteNumber: "GS-SWEEP",
          order: priced.order,
          artworkAnalysis: null,
        });

        assert.equal(
          invoiceTotal(plan),
          pricing.total,
          `Printavo would bill ${invoiceTotal(plan)} for a ${pricing.total} quote`
        );

        assert.equal(
          getStickerTotals(pricing).taxableSubtotal,
          invoiceTaxableBase(plan),
          "the estimate and the invoice tax different amounts"
        );

        // The dimension has to actually vary, or half this sweep is the
        // same test twice.
        assert.equal(pricing.shippingPrice > 0, deliveryMethod === "Ship");
      });
    }
  }
});
