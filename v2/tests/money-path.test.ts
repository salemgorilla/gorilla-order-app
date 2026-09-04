import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { repriceStickers, isStickerOrder } from "../lib/sticker-repricing";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { readKioskSession } from "../lib/kiosk";
import { calculateSignsPricing } from "../lib/signs-pricing";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { apparelCatalog } from "../lib/apparel";

/**
 * The path that takes money, with nobody watching.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * Six defects were found in one working session, and every one of them was
 * caught by a human running the real thing and looking at the output. Nothing
 * in the repository would have caught any of them, because there were no tests
 * at all.
 *
 * Every case below is a bug that actually shipped. They are not hypotheticals
 * and they are not coverage for its own sake — each one names the thing that
 * went wrong and asserts it cannot come back.
 *
 * The shape they share: a path that was correct for ONE design and wrong for a
 * cart, or correct on one flow and wrong on the other two. That is the pattern
 * to keep testing for.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** What the browser posts for a sticker cart, before the server touches it. */
function stickerOrder(
  items: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {}
) {
  return {
    customer: { customerName: "T", email: "t@example.com" },
    production: { deliveryMethod: "Pickup" },
    product: {
      type: "Custom Stickers",
      ...items[0],
      quantity: items.reduce((sum, i) => sum + Number(i.quantity), 0),
    },
    items,
    pricing: { total: 0 },
    ...extra,
  };
}

/**
 * What Printavo will actually invoice, from the plan we hand it.
 *
 * Every price goes through toFixed(4) FIRST, because that is what Printavo
 * stores — it keeps a unit price at four decimal places and multiplies by the
 * count. Summing the raw JavaScript floats instead would reproduce our own
 * arithmetic and agree with itself no matter what we sent.
 *
 * That is not hypothetical. Before this line existed the apparel cases below
 * passed against the blended single-line code they were written to catch: the
 * blend only drifts once it is truncated to 4dp.
 */
function printavoTotal(plan: ReturnType<typeof buildPrintavoQuotePlan>) {
  const stored = (price: number) => Number(price.toFixed(4));

  const goods = plan.lineItems.reduce(
    (sum, line) => sum + stored(line.price) * line.quantity,
    0
  );
  const fees = plan.feeLineItems.reduce(
    (sum, fee) => sum + stored(fee.price),
    0
  );
  const shipping = stored(plan.shippingLineItem?.price ?? 0);

  return Math.round((goods + fees + shipping) * 100) / 100;
}

describe("server repricing", () => {
  test("overrules a tampered client total", () => {
    // Anyone with devtools could post a $2 total for a 1,000 sticker order.
    const order = stickerOrder(
      [{ id: "d1", quantity: 500, widthInches: 3, heightInches: 3, material: "Matte" }],
      { pricing: { total: 2 } }
    );

    const priced = repriceStickers(order);

    assert.equal(priced.mismatch, true);
    assert.equal(priced.clientTotal, 2);
    assert.ok(priced.serverTotal > 100, "server must price it from the spec");
  });

  test("charges setup once per cart, not per design", () => {
    const one = repriceStickers(
      stickerOrder([{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" }])
    );
    const three = repriceStickers(
      stickerOrder([
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d2", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d3", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
      ])
    );

    assert.equal((one.order.pricing as Record<string, number>).setupPrice, 25);
    assert.equal((three.order.pricing as Record<string, number>).setupPrice, 50);
  });

  test("writes each design's price onto the item it priced", () => {
    // Printavo bills from these. If they are missing, the per-design rows fall
    // back to a blended average and the invoice stops matching the quote.
    const priced = repriceStickers(
      stickerOrder([
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss" },
      ])
    );

    const items = priced.order.items as Array<Record<string, number>>;
    const pricing = priced.order.pricing as Record<string, number>;

    assert.equal(items.length, 2);
    for (const item of items) assert.ok(item.linePrice > 0);
    assert.equal(
      Math.round(items.reduce((sum, i) => sum + i.linePrice, 0) * 100) / 100,
      pricing.stickerPrice,
      "per-design prices must sum to the sticker subtotal"
    );
  });

  test("does not invent a cart on a payload that never had one", () => {
    const legacy = {
      customer: {},
      production: { deliveryMethod: "Pickup" },
      product: { type: "Custom Stickers", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
      pricing: { total: 0 },
    };

    const priced = repriceStickers(legacy);
    assert.equal("items" in priced.order, false);
  });
});

describe("Printavo invoices exactly what the website quoted", () => {
  /**
   * THE $25 BUG. getStickerPrice() used to bake setup into `stickerPrice`, so
   * the single decal line carried it. Splitting material from setup for the
   * cart left `stickerPrice` material-only and nothing sent `setupPrice` — so
   * Printavo billed $25 under on one design and $50 under on three, and
   * stickers check out against Printavo's total with no human in the loop.
   */
  const scenarios: Array<[string, Array<Record<string, unknown>>, string]> = [
    [
      "one design",
      [{ id: "d1", quantity: 500, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte" }],
      "Pickup",
    ],
    [
      "three designs, shipped",
      [
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte" },
        { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, shape: "Circle", material: "Gloss" },
        { id: "d3", quantity: 100, widthInches: 4, heightInches: 6, shape: "Square", material: "Chrome" },
      ],
      "Ship",
    ],
    [
      "two identical designs",
      [
        { id: "d1", quantity: 300, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte" },
        { id: "d2", quantity: 300, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte" },
      ],
      "Pickup",
    ],
    [
      // Quantities chosen so amount/quantity does NOT land on 4 decimals.
      // Printavo stores a unit price and multiplies, so this is where rounding
      // drift would show up if it were going to.
      "awkward quantities",
      [
        { id: "d1", quantity: 7, widthInches: 2.25, heightInches: 1.75, shape: "Die Cut", material: "Matte" },
        { id: "d2", quantity: 33, widthInches: 2.25, heightInches: 1.75, shape: "Die Cut", material: "Chrome" },
        { id: "d3", quantity: 111, widthInches: 2.25, heightInches: 1.75, shape: "Die Cut", material: "Gloss" },
      ],
      "Ship",
    ],
  ];

  for (const [name, items, deliveryMethod] of scenarios) {
    test(`${name}: Printavo total === website total`, () => {
      const priced = repriceStickers(
        stickerOrder(items, { production: { deliveryMethod } })
      );
      const websiteTotal = (priced.order.pricing as Record<string, number>).total;

      const plan = buildPrintavoQuotePlan({
        quoteNumber: "GS-TEST",
        order: priced.order,
        artworkAnalysis: null,
      });

      assert.equal(
        printavoTotal(plan),
        websiteTotal,
        `Printavo would bill ${printavoTotal(plan)} for a ${websiteTotal} quote`
      );
    });
  }

  test("a sticker order always carries an explicit setup line", () => {
    const priced = repriceStickers(
      stickerOrder([{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" }])
    );

    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST",
      order: priced.order,
      artworkAnalysis: null,
    });

    const setup = plan.feeLineItems.find(
      (fee) => fee.itemNumber === "GORILLA-DECAL-SETUP"
    );

    assert.ok(setup, "setup fee must be its own Printavo line");
    assert.equal(setup?.price, 25);
  });
});

describe("a cart is legible on the production floor", () => {
  const priced = repriceStickers(
    stickerOrder([
      { id: "d1", quantity: 300, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte", artworkFileName: "logo.png" },
      { id: "d2", quantity: 300, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte", artworkFileName: "logo-alt.png" },
    ])
  );

  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-TEST",
    order: priced.order,
    artworkAnalysis: null,
  });

  test("one line item per design, not one blended row", () => {
    assert.equal(plan.lineItems.length, 2);
  });

  test("identical designs still produce distinguishable rows", () => {
    // CART-PLAN bug 3: every row carried a bare GORILLA-DECAL and no filename,
    // so two designs ordered at the same size and material were byte-identical
    // and the shop could not tell which was which.
    const [a, b] = plan.lineItems;

    assert.notEqual(a.itemNumber, b.itemNumber);
    assert.notEqual(a.description, b.description);
    assert.match(a.description, /logo\.png/);
    assert.match(b.description, /logo-alt\.png/);
  });

  test("no blended per-sticker price on a cart", () => {
    // "Each: $0.41" across three different stickers is an average of things
    // that do not average, sitting where a shop reads a real unit price.
    assert.doesNotMatch(plan.customerNote, /^Each:/m);
  });
});

describe("kiosk orders never generate a payment link", () => {
  test("the marker survives into the server's reading of the order", () => {
    const session = readKioskSession(
      stickerOrder([{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" }], {
        kiosk: { mode: "staff", staffName: "Sam" },
      })
    );

    assert.deepEqual(session, { mode: "staff", staffName: "Sam" });
  });

  test("an ordinary web order has no kiosk session", () => {
    assert.equal(
      readKioskSession(
        stickerOrder([{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" }])
      ),
      null
    );
  });

  test("a counter order is tagged for the till, not for the web queue", () => {
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST",
      order: stickerOrder(
        [{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" }],
        { kiosk: { mode: "staff", staffName: "Sam" }, pricing: { total: 53.8, stickerPrice: 28.8, setupPrice: 25 } }
      ),
      artworkAnalysis: null,
    });

    assert.ok(plan.tags.includes("#PayAtCounter"));
    assert.ok(plan.tags.includes("#InStore"));
    assert.equal(plan.tags.includes("#WebQuote"), false);
    assert.match(plan.customerNote, /NO PAYMENT LINK WAS SENT/);
  });
});

describe("only stickers self-check-out", () => {
  // isStickerOrder gates unattended billing. Membership by omission was the
  // original bug: any NEW flow that forgot to set a field was classified as
  // stickers and auto-generated a payment link.
  test("stickers qualify", () => {
    assert.equal(
      isStickerOrder({ product: { type: "Custom Stickers", quantity: 100 } }),
      true
    );
  });

  for (const [name, product] of [
    ["signs", { type: "Banners & Signs", signType: "Vinyl banner" }],
    ["apparel", { type: "T-Shirts & Apparel", garmentType: "Tee" }],
    ["a payload with no type at all", {}],
    ["a lead-capture shaped payload", { quantity: 1 }],
  ] as Array<[string, Record<string, unknown>]>) {
    test(`${name} does not`, () => {
      assert.equal(isStickerOrder({ product }), false);
    });
  }
});

describe("signs: Printavo invoices exactly what the site quoted", () => {
  /**
   * NOTE, added 2026-09-04: these cases build the payload BY HAND — engine
   * out, `{ total, unitPrice, lines }` assembled here, straight into
   * buildPrintavoQuotePlan. The real page goes through
   * buildSignsPayloadParts, and when rush landed it was that builder which
   * dropped the fee: a rushed cart invoiced $655.00 against $818.75 quoted
   * and every case below still passed, because they agreed with themselves
   * about a payload nothing sends. tests/quote-invoice-sweep.test.ts drives
   * the real composition end to end; keep these as the named regressions
   * they are, and add new coverage there.
   */
  /**
   * The signs engine splits its own breakdown into a product line plus fee
   * lines, and printavo.ts reassembles them — netting negative credits into
   * the product line, because a negative Printavo line item would make the
   * invoice HIGHER than the quote. Nothing asserted that reassembly until now.
   *
   * Config keys are the real ones from signs-pricing-config. Guessed keys fall
   * into the "priced by hand" branch and the test passes without testing
   * anything, so each case also asserts it actually priced.
   */
  const scenarios: Array<[string, Parameters<typeof calculateSignsPricing>[0]]> = [
    [
      "yard signs, double-sided, with step stakes",
      { method: "yard", quantity: 25, sizeKey: '18" x 24"', doubleSided: true, stepStakes: true },
    ],
    [
      "13 oz banner, single-sided",
      { method: "banner", quantity: 1, widthInches: 24, heightInches: 96, material: "13 oz Scrim Vinyl", doubleSided: false },
    ],
    [
      // Two panels sewn back to back, plus a per-linear-foot construction
      // charge — the most moving parts of any signs configuration.
      "13 oz banner, sewn double-sided",
      { method: "banner", quantity: 2, widthInches: 36, heightInches: 120, material: "13 oz Scrim Vinyl", doubleSided: true },
    ],
    [
      // The only line in the whole engine that is NEGATIVE.
      "18 oz banner with the no-hem credit",
      { method: "banner", quantity: 1, widthInches: 24, heightInches: 96, material: "18 oz Heavy Duty Vinyl", doubleSided: false, finishing: "No Hem or Grommets" },
    ],
    [
      // Since 2026-08-22 an odd size costs no more than a standard one on any
      // sign type, so this is here for the rigid per-sqft path rather than for
      // a fee it used to carry.
      "rigid sign at an odd size",
      { method: "rigid", quantity: 4, widthInches: 18, heightInches: 24, material: 'Dibond 1/8"', doubleSided: false },
    ],
    [
      "banner with a per-linear-foot add-on",
      { method: "banner", quantity: 3, widthInches: 24, heightInches: 96, material: "13 oz Scrim Vinyl", doubleSided: false, bannerAddOns: ["webbing"] },
    ],
  ];

  for (const [name, input] of scenarios) {
    test(`${name}: totals agree`, () => {
      const priced = calculateSignsPricing(input);

      assert.equal(
        priced.priceable,
        true,
        `${name} fell into the hand-quote branch — the config key is probably wrong, which would make this test vacuous`
      );

      const plan = buildPrintavoQuotePlan({
        quoteNumber: "GS-TEST",
        order: {
          customer: {},
          production: { deliveryMethod: "Pickup" },
          product: { type: "Banners & Signs", signType: "Sign", quantity: input.quantity },
          pricing: {
            total: priced.total,
            unitPrice: priced.unitPrice,
            lines: priced.lines,
            quoteRequired: false,
          },
        },
        artworkAnalysis: null,
      });

      assert.equal(printavoTotal(plan), priced.total);
    });
  }

  test("the no-hem credit can never make a banner cost less than nothing", () => {
    // A pathological custom size could otherwise credit past the product cost.
    const priced = calculateSignsPricing({
      method: "banner",
      quantity: 1,
      widthInches: 1,
      heightInches: 1,
      material: "18 oz Heavy Duty Vinyl",
      doubleSided: false,
      finishing: "No Hem or Grommets",
    });

    assert.ok(priced.subtotal >= 0, "product subtotal went negative");
    assert.ok(priced.total >= 0, "total went negative");
  });

  test("an add-on quoted by hand adds nothing to the total", () => {
    // Those lines carry amount 0 and are filtered out of the Printavo push;
    // the shop email is the only place they surface, so they must not silently
    // become a charge.
    const withQuoted = calculateSignsPricing({
      method: "banner", quantity: 1, widthInches: 24, heightInches: 96,
      material: "13 oz Scrim Vinyl", doubleSided: false,
      bannerAddOns: ["webbing", "pockets"],
    });
    const withoutQuoted = calculateSignsPricing({
      method: "banner", quantity: 1, widthInches: 24, heightInches: 96,
      material: "13 oz Scrim Vinyl", doubleSided: false,
      bannerAddOns: ["webbing"],
    });

    if (withQuoted.hasQuotedExtras) {
      assert.equal(withQuoted.total, withoutQuoted.total);
    }
  });
});

describe("apparel: Printavo invoices exactly what the site quoted", () => {
  /**
   * Apparel used to go to Printavo as ONE line at a blended unit price
   * covering garments, printing and screens together — total/quantity, which
   * is an infinite-repeating decimal on most orders. Printavo stores a 4dp
   * unit price and multiplies, so the invoice came out ABOVE the quote, and
   * the gap grew with quantity. Swept across 108,000 combinations the worst
   * case was $0.02, at q=308.
   *
   * Two cents is not the point. It is the same "average of things that do not
   * average" the sticker cart was already fixed for, arriving on the one flow
   * that had no tests, and it can only ever come back the same way: by
   * somebody re-blending the three charges into one line.
   */
  const scenarios: Array<[string, Parameters<typeof calculateApparelPricing>[0]]> = [
    [
      "a small one-colour front print",
      { quantity: 24, garmentUnitPrice: 5.49, printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false },
    ],
    [
      // Non-white garment, so the underbase surcharge is in play.
      "front and back, four colours, on a dark garment",
      { quantity: 48, garmentUnitPrice: 8.13, printLocations: ["Front", "Back"], inkColors: "4 colors", hasUnderbase: true },
    ],
    [
      // The exact combination the sweep found the old blended line failing on.
      "the worst case the sweep found",
      { quantity: 308, garmentUnitPrice: 12.35, printLocations: ["Front", "Back"], inkColors: "4 colors", hasUnderbase: false },
    ],
    [
      // Crosses into the 250+ price break.
      "a large run at the top break",
      { quantity: 500, garmentUnitPrice: 6.99, printLocations: ["Front"], inkColors: "5+ colors / Full color / Not sure", hasUnderbase: true },
    ],
    [
      // Quantity 3 is where printUnitPrice * quantity first lands on binary
      // float noise (8.65 x 3 = 25.950000000000003).
      "a quantity that produces float noise",
      { quantity: 3, garmentUnitPrice: 5.49, printLocations: ["Front"], inkColors: "2 colors", hasUnderbase: false },
    ],
    [
      "a single shirt",
      { quantity: 1, garmentUnitPrice: 23.41, printLocations: ["Front"], inkColors: "3 colors", hasUnderbase: false },
    ],
  ];

  const apparelPlan = (input: Parameters<typeof calculateApparelPricing>[0]) =>
    buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST",
      order: {
        customer: {},
        production: { deliveryMethod: "Pickup" },
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "T-Shirts",
          quantity: input.quantity,
          printLocations: input.printLocations,
          inkColors: input.inkColors,
          supplier: { productName: "Gildan 5000", markedUpGarmentPrice: input.garmentUnitPrice },
        },
        pricing: {
          ...calculateApparelPricing(input),
          quoteRequired: false,
        },
      },
      artworkAnalysis: null,
    });

  for (const [name, input] of scenarios) {
    test(`${name}: totals agree to the cent`, () => {
      const priced = calculateApparelPricing(input);
      const plan = apparelPlan(input);

      assert.equal(
        printavoTotal(plan),
        Math.round(priced.total * 100) / 100,
        `Printavo would bill ${printavoTotal(plan)} for a ${priced.total} quote`
      );
    });

    test(`${name}: every amount sent is a real money value`, () => {
      // 25.950000000000003 never moved money — Printavo rounds it — but it is
      // what a quarter of all apparel orders were posting to the API, and it
      // is what the shop saw reading the raw quote.
      const plan = apparelPlan(input);

      for (const price of [
        ...plan.lineItems.map((l) => l.price),
        ...plan.feeLineItems.map((f) => f.price),
      ]) {
        assert.match(
          JSON.stringify(price),
          /^-?\d+(\.\d{1,4})?$/,
          `posted ${JSON.stringify(price)} as a price`
        );
      }
    });
  }

  test("garments, printing and screens are three separate lines", () => {
    // This is the assertion that actually stops the regression: the drift only
    // exists if the three are re-blended into one line.
    const plan = apparelPlan({
      quantity: 48, garmentUnitPrice: 8.13,
      printLocations: ["Front", "Back"], inkColors: "4 colors", hasUnderbase: true,
    });

    assert.equal(plan.lineItems.length, 1, "the goods line is garments only");
    assert.ok(
      plan.feeLineItems.some((f) => f.itemNumber === "GORILLA-APPAREL-PRINT"),
      "printing must be its own line"
    );
    assert.ok(
      plan.feeLineItems.some((f) => f.itemNumber === "GORILLA-APPAREL-SETUP"),
      "screens must be their own line"
    );
  });

  test("the garment line carries the supplier price, not a blend", () => {
    const plan = apparelPlan({
      quantity: 48, garmentUnitPrice: 8.13,
      printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false,
    });

    // 8.13 is what S&S charges plus markup, rounded to the cent upstream. A
    // blended price would be well north of $16 here.
    assert.equal(plan.lineItems[0].price, 8.13);
  });

  test("a special order sends no breakdown it does not have", () => {
    // Special orders are priced by hand and carry no pricing at all. Sending a
    // $0 printing line, or worse a stale one, would be a charge nobody quoted.
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST",
      order: {
        customer: {},
        production: { deliveryMethod: "Pickup" },
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "T-Shirts",
          quantity: 24,
          specialOrder: true,
          supplier: { productName: "Something bespoke" },
        },
        pricing: { total: 0, quoteRequired: true },
      },
      artworkAnalysis: null,
    });

    assert.equal(
      plan.feeLineItems.filter((f) => f.itemNumber.startsWith("GORILLA-APPAREL-")).length,
      0
    );
  });

  test("every ink option the catalogue offers is one the pricer understands", () => {
    /**
     * getInkColorCount() reads the leading digit of the option string. That is
     * exact for the five options apparel ships with — and silently wrong the
     * day somebody adds "10 colors", which would price as ONE colour: about
     * $6 per piece and $225 of screens too little on a 48-shirt order.
     *
     * So this asserts the catalogue and the pricer agree, rather than
     * asserting the parser handles a string it will never see.
     */
    for (const option of apparelCatalog.inkColors) {
      const expected = Number(option.charAt(0));
      const oneColor = calculateApparelPricing({
        quantity: 10, garmentUnitPrice: 10, printLocations: ["Front"],
        inkColors: "1 color", hasUnderbase: false,
      });
      const priced = calculateApparelPricing({
        quantity: 10, garmentUnitPrice: 10, printLocations: ["Front"],
        inkColors: option, hasUnderbase: false,
      });

      assert.equal(
        priced.inkColorCount,
        expected,
        `"${option}" prices as ${priced.inkColorCount} colour(s)`
      );
      // And it has to cost more than one colour, or the count is decorative.
      if (expected > 1) assert.ok(priced.total > oneColor.total);
    }
  });
});
