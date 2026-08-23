import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  SIGN_FAMILIES,
  createSignsDesignForFamily,
  createSignsQuote,
  getSignFamilyProducts,
  getSignProduct,
  getSignsQuoteFamily,
  signProducts,
} from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { isStickerOrder } from "../lib/sticker-repricing";
import { buildQuoteEmail } from "../lib/email";
import { getAddOnOffers } from "../lib/addons";
import { productCategories } from "../lib/products";

/**
 * Banners and signs are separate products with separate pipelines
 * (Gabe, 2026-08-23). The HARD split: a banner quote holds only banners, a
 * signs quote only signs, and the record downstream — the shop email, the
 * Printavo nickname, the customer's copy — names which pipeline the order
 * came down.
 *
 * They still share the pricing machinery in lib/signs.ts, deliberately:
 * every design prices by its own product either way, so the 120 committed
 * totals in tests/signs-price-sheet.test.ts hold across the split untouched.
 * What the family decides is which products a flow OFFERS, what a fresh
 * design STARTS as, and what the paperwork CALLS the order.
 *
 * Verified in a browser as well as here: the banners flow shows no type
 * picker (one product is not a choice), the signs flow lists four and none
 * of them is a banner, and switching cards keeps each family's cart intact.
 */

describe("the catalog partitions cleanly", () => {
  test("every product is in exactly one family", () => {
    for (const product of signProducts) {
      assert.ok(
        product.family === "banners" || product.family === "signs",
        `${product.id} has no family`
      );
    }
  });

  test("banners is vinyl banners only; signs is everything else", () => {
    assert.deepEqual(
      getSignFamilyProducts("banners").map((p) => p.id),
      ["vinyl-banner"]
    );
    assert.deepEqual(
      getSignFamilyProducts("signs").map((p) => p.id),
      ["yard-sign", "rigid-sign", "poster", "window-graphics"]
    );
  });

  test("no flow is ever offered the other family's products", () => {
    const banners = new Set(getSignFamilyProducts("banners").map((p) => p.id));
    for (const product of getSignFamilyProducts("signs")) {
      assert.ok(!banners.has(product.id));
    }
  });
});

describe("a fresh quote starts on its own family's product", () => {
  test("banners start as a vinyl banner, signs as a yard sign", () => {
    assert.equal(
      createSignsQuote("banners").designs[0].productId,
      "vinyl-banner"
    );
    assert.equal(createSignsQuote("signs").designs[0].productId, "yard-sign");
  });

  test("'Add another' inside a family stays inside it", () => {
    // The bug this prevents: the bare createSignsDesign() default is a
    // vinyl banner, so an unfamily'd add inside the Signs pipeline would
    // hand the customer a banner.
    for (const family of ["banners", "signs"] as const) {
      const added = createSignsDesignForFamily(family);
      assert.equal(getSignProduct(added.productId).family, family);
    }
  });

  test("a quote knows which pipeline it belongs to", () => {
    assert.equal(getSignsQuoteFamily(createSignsQuote("banners")), "banners");
    assert.equal(getSignsQuoteFamily(createSignsQuote("signs")), "signs");
  });
});

describe("the payload names the pipeline", () => {
  function payloadFor(family: "banners" | "signs") {
    const designs = [createSignsDesignForFamily(family)];
    if (family === "banners") {
      designs[0].customWidthInches = 72;
      designs[0].customHeightInches = 36;
    }
    return buildSignsPayloadParts(designs, quoteSignsCart(designs), family);
  }

  test("type is the family label, and the family rides along", () => {
    assert.equal(payloadFor("banners").product.type, "Vinyl Banners");
    assert.equal(payloadFor("banners").product.family, "banners");
    assert.equal(payloadFor("signs").product.type, "Signs");
    assert.equal(payloadFor("signs").product.family, "signs");
  });

  test("neither pipeline can ever self-check-out", () => {
    // The AGENTS.md invariant, asked of the real classifier. signType is
    // present and neither type contains "sticker", so the payment-link
    // branch cannot claim either family.
    for (const family of ["banners", "signs"] as const) {
      assert.equal(
        isStickerOrder({ product: payloadFor(family).product }),
        false,
        `${family} would be issued a live payment link`
      );
    }
  });

  test("a caller that predates the split still files under the right pipeline", () => {
    // The default family is read off design 1's product — so an old call
    // shape (two arguments) keeps producing an honestly-labelled payload.
    const banners = [createSignsDesignForFamily("banners")];
    banners[0].customWidthInches = 72;
    banners[0].customHeightInches = 36;

    const parts = buildSignsPayloadParts(banners, quoteSignsCart(banners));
    assert.equal(parts.product.family, "banners");
  });

  test("the shop email's Type line says which pipeline", () => {
    const designs = [
      createSignsDesignForFamily("banners"),
      createSignsDesignForFamily("banners"),
    ];
    for (const design of designs) {
      design.customWidthInches = 72;
      design.customHeightInches = 36;
    }

    const email = buildQuoteEmail({
      quoteNumber: "GS-TEST",
      receivedAt: new Date("2026-08-23T15:00:00Z").toISOString(),
      order: {
        customer: {},
        production: {},
        ...buildSignsPayloadParts(designs, quoteSignsCart(designs), "banners"),
      },
      artworkAnalysis: null,
    } as never);

    assert.match(email.text, /Type: Vinyl Banners/);
    assert.doesNotMatch(email.text, /Banners & Signs/);
  });
});

describe("step 1 offers two large-format cards", () => {
  test("banners and signs, both active, in the large-format band", () => {
    const band = productCategories.filter((p) => p.segment === "large-format");

    assert.deepEqual(
      band.map((p) => p.id),
      ["banners", "signs"]
    );
    for (const card of band) {
      assert.equal(card.status, "active");
      assert.match(card.fulfilment, /invoice/i);
    }
  });

  test("the card titles are the family labels", () => {
    // One vocabulary: the card, the payload type, the email and the nickname
    // all read from SIGN_FAMILIES.
    for (const [family, meta] of Object.entries(SIGN_FAMILIES)) {
      const card = productCategories.find((p) => p.id === family);
      assert.ok(card, `no card for ${family}`);
      assert.equal(card.title, meta.label);
    }
  });
});

describe("the cross-sell strip knows the new flow", () => {
  test("banners get offers, and never their own product", () => {
    const offers = getAddOnOffers("banners");

    assert.ok(offers.length > 0, "the banners flow is offered nothing");
    assert.ok(
      !offers.some((offer) => offer.id === "banner-3x6"),
      "a banner quote is offered a banner"
    );
    assert.ok(offers.some((offer) => offer.id.startsWith("stickers-")));
  });
});
