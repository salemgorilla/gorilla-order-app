import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DECAL_SHIPPING_PRICE,
  STICKER_SETUP_FEE,
  STICKER_SETUP_FEE_ADDITIONAL,
  quoteStickerCart,
} from "../lib/pricing";
import { repriceStickers } from "../app/api/quote/route";

/**
 * One composition of the sticker total, called by both sides.
 *
 * ── WHAT WAS DUPLICATED ───────────────────────────────────────────────────
 * The primitives were always shared. The ARITHMETIC that adds them up was
 * written twice — recalculateOrder in the browser, which shows the customer a
 * number, and repriceStickers on the server, which charges it. Identical line
 * for line, and the failure mode if they ever drifted is the worst one this
 * app has available: the browser quotes one figure, the server bills another,
 * and the only trace is a "PRICE MISMATCH" line in a function log.
 *
 * The brief that asked for an entry-screen price anchor made a single shared
 * quote function its non-negotiable constraint, and said that extracting one
 * IS the ticket if it does not exist. It did not exist. This is it.
 */

describe("the composition itself", () => {
  it("sums material, adds setup and shipping, and rounds", () => {
    const quote = quoteStickerCart({
      materialPrices: [28.8, 32],
      deliveryMethod: "Ship",
    });

    assert.equal(quote.stickerPrice, 60.8);
    assert.equal(quote.setupPrice, STICKER_SETUP_FEE + STICKER_SETUP_FEE_ADDITIONAL);
    assert.equal(quote.shippingPrice, DECAL_SHIPPING_PRICE);
    assert.equal(quote.total, 110.3);
  });

  it("charges setup per DESIGN, not per dollar", () => {
    // A design that priced at zero is still a design somebody has to set up.
    const withZero = quoteStickerCart({
      materialPrices: [10, 0, 10],
      deliveryMethod: "Pickup",
    });

    assert.equal(
      withZero.setupPrice,
      STICKER_SETUP_FEE + STICKER_SETUP_FEE_ADDITIONAL * 2
    );
  });

  it("prices one design exactly as it did before the cart existed", () => {
    const single = quoteStickerCart({
      materialPrices: [28.8],
      deliveryMethod: "Pickup",
    });

    assert.equal(single.setupPrice, STICKER_SETUP_FEE);
    assert.equal(single.total, 28.8 + STICKER_SETUP_FEE);
  });

  it("charges no shipping on local pickup", () => {
    const quote = quoteStickerCart({
      materialPrices: [10],
      deliveryMethod: "Pickup",
    });

    assert.equal(quote.shippingPrice, 0);
  });

  it("rounds where it always rounded, not where it reads tidier", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point. Rounding the
    // material subtotal and then the total — in that order — is the contract
    // both callers relied on, so a change of WHERE it rounds moves cents.
    const quote = quoteStickerCart({
      materialPrices: [0.1, 0.2],
      deliveryMethod: "Pickup",
    });

    assert.equal(quote.stickerPrice, 0.3);
    assert.equal(
      quote.total,
      0.3 + STICKER_SETUP_FEE + STICKER_SETUP_FEE_ADDITIONAL
    );
  });

  it("keeps the one-design setup MINIMUM on an empty cart", () => {
    // getCartSetupFee floors the design count at 1, deliberately. Written down
    // because it is surprising: an empty cart does not price at zero, it
    // prices at one design's setup. My first version of this test asserted $0
    // and was wrong about the code rather than finding a bug in it.
    const quote = quoteStickerCart({ materialPrices: [], deliveryMethod: "Pickup" });

    assert.equal(quote.stickerPrice, 0);
    assert.equal(quote.setupPrice, STICKER_SETUP_FEE);
    assert.equal(quote.total, STICKER_SETUP_FEE);
  });
});

describe("the server really does route through it", () => {
  /**
   * The point of the extraction is that repriceStickers no longer has its own
   * arithmetic. This asserts that by computing the same cart both ways: if
   * anyone re-inlines the sum on the server, these stop agreeing.
   */
  const CARTS: Array<{
    deliveryMethod: string;
    items: Array<Record<string, number | string>>;
  }> = [
    {
      deliveryMethod: "Ship",
      items: [
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss" },
      ],
    },
    {
      deliveryMethod: "Pickup",
      items: [
        { id: "d1", quantity: 500, widthInches: 4, heightInches: 6, material: "Chrome" },
      ],
    },
    {
      deliveryMethod: "Ship",
      items: [
        { id: "d1", quantity: 25, widthInches: 1, heightInches: 1, material: "Matte" },
        { id: "d2", quantity: 25, widthInches: 1, heightInches: 1, material: "Matte" },
        { id: "d3", quantity: 25, widthInches: 1, heightInches: 1, material: "Holographic" },
      ],
    },
  ];

  for (const [index, cart] of CARTS.entries()) {
    it(`agrees with repriceStickers on cart ${index + 1}`, () => {
      const priced = repriceStickers({
        customer: { customerName: "Dana", email: "dana@example.com" },
        production: { deliveryMethod: cart.deliveryMethod },
        product: { type: "Custom Stickers", quantity: 1 },
        items: cart.items,
        pricing: { total: 0 },
      } as never);

      const server = (priced.order as Record<string, unknown>)
        .pricing as Record<string, number>;

      const items = (priced.order as Record<string, unknown>).items as Array<{
        linePrice: number;
      }>;

      const direct = quoteStickerCart({
        materialPrices: items.map((item) => item.linePrice),
        deliveryMethod: cart.deliveryMethod,
      });

      assert.deepEqual(
        {
          stickerPrice: server.stickerPrice,
          setupPrice: server.setupPrice,
          shippingPrice: server.shippingPrice,
          total: server.total,
        },
        direct
      );
    });
  }
});
