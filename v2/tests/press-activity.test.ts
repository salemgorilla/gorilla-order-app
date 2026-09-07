/**
 * THE ONE LIVE NUMBER ON THE HERO.
 *
 * Gabe chose "make it real rather than random" over a rotating slogan, so the
 * hero can carry a count of what the shop actually printed this week. A number
 * on a public page is a claim, and this file is what keeps it one the shop can
 * stand behind:
 *
 *   - only invoiced work counts, never quotes
 *   - fees, shipping and rush are not pieces
 *   - a quiet week publishes nothing rather than a small number
 *   - nothing identifies a customer
 *   - anything unrecognised is dropped, never guessed at
 *
 * The last one matters most: this reads a live API whose shape we do not
 * control, so every test below feeds it something malformed and expects a
 * shrug rather than a throw.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  MIN_PIECES,
  describePressActivity,
  nounForSku,
  summarisePressActivity,
  type PressOrder,
} from "../lib/press-activity";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { quoteApparelCart } from "../lib/apparel-cart";
import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart, withSignsRush } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceStickers } from "../lib/sticker-repricing";

const NOW = new Date("2026-09-07T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function order(createdAt: string, lineItems: Array<[string, number]>): PressOrder {
  return {
    createdAt,
    lineItems: lineItems.map(([itemNumber, quantity]) => ({ itemNumber, quantity })),
  };
}

describe("a SKU maps to what the customer calls it", () => {
  test("the three product families", () => {
    assert.equal(nounForSku("GORILLA-DECAL"), "stickers");
    assert.equal(nounForSku("GORILLA-DECAL-2"), "stickers");
    assert.equal(nounForSku("GORILLA-SIGN-YARD-SIGN"), "signs");
    assert.equal(nounForSku("GORILLA-APPAREL-39"), "garments");
  });

  test("a fee is not a piece — nobody printed a setup charge", () => {
    for (const fee of [
      "GORILLA-DECAL-SETUP",
      "GORILLA-APPAREL-SETUP",
      "GORILLA-APPAREL-PRINT",
      "GORILLA-SIGN-SETUP",
      "GORILLA-SIGN-ADDON-HOLES",
      "GORILLA-SIGN-MINIMUM",
      "GORILLA-RUSH",
      "GORILLA-SHIPPING",
    ]) {
      assert.equal(nounForSku(fee), null, `${fee} counted as a printed piece`);
    }
  });

  test("an unknown code is dropped, never guessed at", () => {
    // A number the shop cannot explain is worse than a smaller one it can.
    assert.equal(nounForSku("SOMETHING-ELSE"), null);
    assert.equal(nounForSku(""), null);
    assert.equal(nounForSku("   "), null);
  });
});

describe("what the week adds up to", () => {
  const ORDERS: PressOrder[] = [
    order(daysAgo(1), [["GORILLA-DECAL", 500], ["GORILLA-DECAL-SETUP", 1]]),
    order(daysAgo(3), [["GORILLA-SIGN-YARD-SIGN", 25], ["GORILLA-SIGN-SETUP", 1]]),
    order(daysAgo(6), [["GORILLA-APPAREL-39", 48], ["GORILLA-APPAREL-PRINT", 48]]),
    // Outside the window — last month's work is not this week's.
    order(daysAgo(30), [["GORILLA-DECAL", 10000]]),
  ];

  const activity = summarisePressActivity(ORDERS, { now: NOW });

  test("counts only the window, and only goods", () => {
    assert.ok(activity);
    assert.deepEqual(activity.counts, [
      { noun: "stickers", quantity: 500 },
      { noun: "garments", quantity: 48 },
      { noun: "signs", quantity: 25 },
    ]);
    // 48 print-fee units did NOT double the garments.
    assert.equal(activity.total, 573);
  });

  test("biggest first", () => {
    assert.ok(activity);
    const quantities = activity.counts.map((c) => c.quantity);
    assert.deepEqual(quantities, [...quantities].sort((a, b) => b - a));
  });

  test("and it reads as spec furniture", () => {
    assert.ok(activity);
    assert.equal(
      describePressActivity(activity),
      "500 stickers · 48 garments · 25 signs"
    );
  });

  test("thousands are grouped", () => {
    const big = summarisePressActivity(
      [order(daysAgo(1), [["GORILLA-DECAL", 1240]])],
      { now: NOW }
    );
    assert.ok(big);
    assert.match(describePressActivity(big), /1,240 stickers/);
  });
});

describe("a quiet week says nothing at all", () => {
  test("under the floor, there is no line", () => {
    const quiet = summarisePressActivity(
      [order(daysAgo(2), [["GORILLA-DECAL", MIN_PIECES - 1]])],
      { now: NOW }
    );

    assert.equal(quiet, null, "the hero would have announced a slow week");
  });

  test("at the floor, there is", () => {
    const busy = summarisePressActivity(
      [order(daysAgo(2), [["GORILLA-DECAL", MIN_PIECES]])],
      { now: NOW }
    );

    assert.ok(busy);
    assert.equal(busy.total, MIN_PIECES);
  });

  test("no orders at all is null, not zero", () => {
    assert.equal(summarisePressActivity([], { now: NOW }), null);
  });

  test("orders with nothing recognisable in them is null", () => {
    assert.equal(
      summarisePressActivity(
        [order(daysAgo(1), [["MYSTERY-SKU", 900]])],
        { now: NOW }
      ),
      null
    );
  });
});

describe("a shape we did not expect is a shrug, never a throw", () => {
  /**
   * This reads a live API. The failure that matters is not a wrong number —
   * it is the hero throwing because Printavo renamed a field.
   */
  const JUNK: unknown[] = [
    {},
    { createdAt: null, lineItems: null },
    { createdAt: "not a date", lineItems: [{ itemNumber: "GORILLA-DECAL", quantity: 100 }] },
    { createdAt: daysAgo(1), lineItems: "not an array" },
    { createdAt: daysAgo(1), lineItems: [null, undefined, 42, "x"] },
    { createdAt: daysAgo(1), lineItems: [{ itemNumber: 12345, quantity: "many" }] },
    { createdAt: daysAgo(1), lineItems: [{ itemNumber: "GORILLA-DECAL", quantity: -500 }] },
    { createdAt: daysAgo(1), lineItems: [{ itemNumber: "GORILLA-DECAL", quantity: Infinity }] },
  ];

  test("every malformed order is survived", () => {
    assert.doesNotThrow(() =>
      summarisePressActivity(JUNK as PressOrder[], { now: NOW })
    );
    // Nothing usable in any of them.
    assert.equal(summarisePressActivity(JUNK as PressOrder[], { now: NOW }), null);
  });

  test("a credit note cannot subtract from the week", () => {
    const withCredit = summarisePressActivity(
      [
        order(daysAgo(1), [["GORILLA-DECAL", 500]]),
        order(daysAgo(1), [["GORILLA-DECAL", -400]]),
      ],
      { now: NOW }
    );

    assert.ok(withCredit);
    assert.equal(withCredit.total, 500);
  });

  test("a future-dated order is not this week's work", () => {
    const future = summarisePressActivity(
      [{ createdAt: new Date(NOW.getTime() + 86400000).toISOString(), lineItems: [{ itemNumber: "GORILLA-DECAL", quantity: 900 }] }],
      { now: NOW }
    );

    assert.equal(future, null);
  });
});

describe("nothing here can name a customer", () => {
  test("the summary carries counts and nouns, and no other field", () => {
    const activity = summarisePressActivity(
      [
        {
          createdAt: daysAgo(1),
          lineItems: [{ itemNumber: "GORILLA-DECAL", quantity: 500 }],
          // Whatever else the API sends must not survive into the summary.
          ...({ contact: { email: "someone@example.com" }, nickname: "GS-1" } as object),
        },
      ],
      { now: NOW }
    );

    assert.ok(activity);
    assert.deepEqual(Object.keys(activity).sort(), ["counts", "total", "windowDays"]);
    assert.doesNotMatch(JSON.stringify(activity), /example\.com|GS-1/);
  });
});


describe("driven against the SKUs the app really emits", () => {
  /**
   * THE TEST THAT KEEPS THE NUMBER HONEST.
   *
   * nounForSku has to tell a printed thing from a charge, and the charges are
   * a list that grows — rush, order minimums and the add-on services all
   * arrived after the first version of this file. A hand-written list of fee
   * codes is a list that goes stale silently, and the symptom would be the
   * hero quietly overstating what the shop printed.
   *
   * So: build the REAL Printavo plans, take every line the app can produce,
   * and require that each one is classified deliberately — goods counted,
   * fees not. A new fee kind fails here rather than inflating the hero.
   */
  const CONTACT = { customerName: "Press", email: "press@example.com" };
  const TODAY = "2026-09-04";
  const RUSH_DATE = "2026-09-17";

  function signsPlan(designs: SignsDesign[], needBy: string) {
    const pricing = withSignsRush(quoteSignsCart(designs), {
      needBy,
      lane: "slow",
      today: TODAY,
    });

    return buildPrintavoQuotePlan({
      quoteNumber: "GS-PRESS",
      order: {
        customer: CONTACT,
        production: { needBy, deliveryMethod: "Pickup" },
        ...buildSignsPayloadParts(designs, pricing, "signs"),
      },
      artworkAnalysis: null,
    });
  }

  const plans = [
    // Stickers, shipped, three designs — setup and shipping lines.
    (() => {
      const priced = repriceStickers({
        customer: CONTACT,
        production: { needBy: "2026-10-14", deliveryMethod: "Ship" },
        product: { type: "Custom Stickers", quantity: 450 },
        items: [
          { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
          { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss" },
          { id: "d3", quantity: 100, widthInches: 4, heightInches: 6, material: "Chrome" },
        ],
        pricing: { total: 0 },
      });

      return buildPrintavoQuotePlan({
        quoteNumber: "GS-PRESS",
        order: priced.order,
        artworkAnalysis: null,
      });
    })(),

    // Signs: rush, add-ons, an order minimum and a multi-design cart.
    signsPlan(
      [
        createSignsDesign({
          productId: "yard-sign",
          quantity: 25,
          material: "Coroplast",
          finishing: "With Step Stakes",
          signAddOns: ["holes"],
        }),
        createSignsDesign({
          productId: "vinyl-banner",
          quantity: 2,
          customWidthInches: 72,
          customHeightInches: 36,
          material: "13 oz Scrim Vinyl",
          finishing: "Hemmed + Grommets",
          bannerAddOns: ["polePockets"],
          velcro: "all",
        }),
      ],
      RUSH_DATE
    ),

    // A single tiny sign, which trips the order minimum.
    signsPlan(
      [createSignsDesign({ productId: "yard-sign", quantity: 1, material: "Coroplast", finishing: "Signs Only" })],
      "2026-10-14"
    ),

    // Apparel: a cart, so garment rows plus print and screens.
    (() => {
      const cart = quoteApparelCart(
        [
          { id: "l1", garmentLabel: "Basic Tee", colorName: "White", catalogStyle: "39", garmentUnitPrice: 6.23, quantity: 24 },
          { id: "l2", garmentLabel: "Classic Hoodie", colorName: "Black", garmentUnitPrice: 14.87, quantity: 12 },
        ],
        { printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false }
      );

      return buildPrintavoQuotePlan({
        quoteNumber: "GS-PRESS",
        order: {
          customer: CONTACT,
          production: { needBy: "2026-10-14", deliveryMethod: "Pickup" },
          product: {
            type: "T-Shirts & Apparel",
            garmentType: "T-Shirts",
            quantity: cart.quantity,
            printLocations: ["Front"],
            inkColors: "1 color",
            garmentLines: cart.lines,
            supplier: { productName: "Gildan 2000", catalogStyle: "39", markedUpGarmentPrice: cart.garmentUnitPrice },
          },
          pricing: { ...cart, quoteRequired: false },
        },
        artworkAnalysis: null,
      });
    })(),
  ];

  test("every GOODS line counts as a printed thing", () => {
    for (const plan of plans) {
      for (const item of plan.lineItems) {
        assert.ok(
          nounForSku(item.itemNumber),
          `${item.itemNumber} is a product line but was not counted`
        );
      }
    }
  });

  test("and every FEE line counts as nothing", () => {
    const fees = plans.flatMap((plan) => [
      ...plan.feeLineItems.map((f) => f.itemNumber),
      ...(plan.shippingLineItem ? [plan.shippingLineItem.itemNumber] : []),
    ]);

    assert.ok(fees.length >= 6, `only ${fees.length} fee lines exercised`);

    for (const itemNumber of fees) {
      assert.equal(
        nounForSku(itemNumber),
        null,
        `${itemNumber} is a charge but would be counted as a printed piece`
      );
    }
  });

  test("so a real week's invoices add up to the goods alone", () => {
    // The whole point, end to end: feed the real plans in as orders and check
    // the total is the pieces, with not one fee among them.
    const orders: PressOrder[] = plans.map((plan) => ({
      createdAt: daysAgo(1),
      lineItems: [
        ...plan.lineItems,
        ...plan.feeLineItems,
        ...(plan.shippingLineItem ? [plan.shippingLineItem] : []),
      ].map((line) => ({
        itemNumber: line.itemNumber,
        quantity: (line as { quantity?: number }).quantity ?? 1,
      })),
    }));

    const activity = summarisePressActivity(orders, { now: NOW });

    assert.ok(activity);

    const goods = plans
      .flatMap((plan) => plan.lineItems)
      .reduce((sum, item) => sum + item.quantity, 0);

    assert.equal(activity.total, goods);
  });
});


describe("the hero can never break over a decoration", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(
    new URL("../app/api/press/route.ts", import.meta.url),
    "utf8"
  );

  test("the number is fetched after mount, never during render", () => {
    /**
     * THE CONSTRAINT THAT SHAPED THIS.
     *
     * app/page.tsx is a client component that Next prerenders to static HTML
     * at build time. A value that differs between the server's HTML and the
     * browser's first render is a hydration error, so the press line may only
     * arrive in an effect. Reading it during render would be the bug, and it
     * would show up as a console error on every visit rather than as a
     * missing line.
     */
    const effect = page.slice(
      page.indexOf("const [pressLine, setPressLine]"),
      page.indexOf("const estimateBar")
    );

    assert.ok(effect.includes("useEffect"), "the fetch left its effect");
    assert.match(effect, /fetch\("\/api\/press"\)/);
    assert.match(effect, /\.catch\(/, "an API failure would reach the customer");
  });

  test("and it renders nothing at all when there is no number", () => {
    assert.match(page, /\{pressLine && \(/);
  });

  test("the route answers 200 with a null line rather than an error", () => {
    // A 500 here would be a broken-looking hero in exchange for a decoration.
    assert.doesNotMatch(route, /status:\s*5\d\d/);
    assert.match(route, /console\.warn/);
    assert.match(route, /line: null|line \}/);
  });

  test("the public response carries the line and nothing else", () => {
    // The probe branch may return raw order data; the public one may not.
    const publicBranch = route.slice(route.indexOf("if (cached"));

    assert.doesNotMatch(publicBranch, /raw/);
    assert.doesNotMatch(publicBranch, /activity,/);
  });

  test("the probe is admin-guarded", () => {
    assert.match(route, /adminSecretMatches/);
    // And never cached, since it carries raw orders.
    assert.match(route, /no-store/);
  });
});
