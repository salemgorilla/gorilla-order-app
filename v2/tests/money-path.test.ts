import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { repriceStickers, isStickerOrder } from "../app/api/quote/route";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { readKioskSession } from "../lib/kiosk";
import { calculateSignsPricing } from "../lib/signs-pricing";

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

/** What Printavo will actually invoice, from the plan we hand it. */
function printavoTotal(plan: ReturnType<typeof buildPrintavoQuotePlan>) {
  const goods = plan.lineItems.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );
  const fees = plan.feeLineItems.reduce((sum, fee) => sum + fee.price, 0);
  const shipping = plan.shippingLineItem?.price ?? 0;

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
      { method: "yard", quantity: 25, sizeKey: '18" x 24"', doubleSided: true, stepStakes: true, isCustomSize: false },
    ],
    [
      "13 oz banner, single-sided",
      { method: "banner", quantity: 1, widthInches: 24, heightInches: 96, material: "13 oz Scrim Vinyl", doubleSided: false, isCustomSize: true },
    ],
    [
      // Two panels sewn back to back, plus a per-linear-foot construction
      // charge — the most moving parts of any signs configuration.
      "13 oz banner, sewn double-sided",
      { method: "banner", quantity: 2, widthInches: 36, heightInches: 120, material: "13 oz Scrim Vinyl", doubleSided: true, isCustomSize: true },
    ],
    [
      // The only line in the whole engine that is NEGATIVE.
      "18 oz banner with the no-hem credit",
      { method: "banner", quantity: 1, widthInches: 24, heightInches: 96, material: "18 oz Heavy Duty Vinyl", doubleSided: false, isCustomSize: true, finishing: "No Hem or Grommets" },
    ],
    [
      // Hard stock, so this one earns the custom size fee; banners do not.
      "rigid sign at a custom size",
      { method: "rigid", quantity: 4, widthInches: 18, heightInches: 24, material: 'Dibond 1/8"', doubleSided: false, isCustomSize: true },
    ],
    [
      "banner with a per-linear-foot add-on",
      { method: "banner", quantity: 3, widthInches: 24, heightInches: 96, material: "13 oz Scrim Vinyl", doubleSided: false, isCustomSize: true, bannerAddOns: ["webbing"] },
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
      isCustomSize: true,
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
      material: "13 oz Scrim Vinyl", doubleSided: false, isCustomSize: true,
      bannerAddOns: ["webbing", "pockets"],
    });
    const withoutQuoted = calculateSignsPricing({
      method: "banner", quantity: 1, widthInches: 24, heightInches: 96,
      material: "13 oz Scrim Vinyl", doubleSided: false, isCustomSize: true,
      bannerAddOns: ["webbing"],
    });

    if (withQuoted.hasQuotedExtras) {
      assert.equal(withQuoted.total, withoutQuoted.total);
    }
  });
});
