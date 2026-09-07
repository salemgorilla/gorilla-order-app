import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productCategories } from "../lib/products";
import { isStickerOrder } from "../lib/sticker-repricing";
import { decideSignsAutoBill } from "../lib/auto-bill";
import { createSignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceSigns } from "../lib/signs-repricing";

/**
 * What each product card promises about what happens after submit.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Stickers and signs are both `status: "active"`, so both cards read
 * "Available now" — and the two are not the same offer. Stickers is priced
 * online AND billed online; signs is priced online and then invoiced by the
 * shop. A buyer deciding whether to spend five steps could not tell which of
 * those they were about to get, and the fully automated path — the one that
 * returns a number in a minute — was the card with nothing marking it out.
 *
 * ── WHY THIS FILE IS NOT JUST A COPY CHECK ────────────────────────────────
 * "Pay online" is a promise about the SERVER, so it is asserted against the
 * functions that actually decide whether a submission gets a payment link,
 * never against a comment. A card that offered online payment for a flow
 * which cannot raise a link would be a lie told at the exact moment someone
 * is deciding to trust the thing.
 *
 * Since 7 Sep there are TWO such functions, because there are two gates:
 * isStickerOrder() for stickers, decideSignsAutoBill() for signs and banners
 * (Gabe: "All 3 should be instant price - pay online"). A card is allowed to
 * claim online payment exactly when one of them says yes.
 *
 * ── AND WHY THE PAYLOADS ARE THE REAL ONES ────────────────────────────────
 * The signs fixtures here are built by buildSignsPayloadParts and repriced by
 * repriceSigns — the same construction the browser posts and the route runs.
 * A hand-written fixture is a test that can pass while the shipped payload
 * behaves differently, which is the failure signs-cart-not-a-sticker.test.ts
 * was written for.
 */

const PAYS_ONLINE = /pay online/i;

/** A real signs payload, built the way the browser builds it. */
function signsPayload(productId: string, overrides = {}) {
  const designs = [
    createSignsDesign({
      productId,
      quantity: 3,
      customWidthInches: 24,
      customHeightInches: 18,
      material: productId === "vinyl-banner" ? "13 oz Scrim Vinyl" : "Coroplast",
      finishing: productId === "vinyl-banner" ? "Hemmed + Grommets" : "Signs Only",
      ...overrides,
    }),
  ];

  return {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: { deliveryMethod: "Pickup" },
    ...buildSignsPayloadParts(designs, quoteSignsCart(designs)),
  };
}

/** A payload shaped the way the browser really posts each flow. */
function orderFor(id: string) {
  const customer = { customerName: "Dana", email: "dana@example.com" };
  const production = { deliveryMethod: "Pickup" };

  if (id === "stickers") {
    return {
      customer,
      production,
      product: {
        type: "Custom Stickers",
        quantity: 100,
        widthInches: 3,
        heightInches: 3,
        material: "Matte",
      },
      items: [{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3 }],
      pricing: { total: 0 },
    };
  }

  // Each large-format card gets ITS OWN product. `banners` used to fall
  // through to the apparel payload below, so that card's promise was being
  // checked against a garment order — it passed because both answers were
  // "no link", and would have gone on passing once one of them changed.
  if (id === "signs") return signsPayload("yard-sign");
  if (id === "banners") return signsPayload("vinyl-banner");

  return {
    customer,
    production,
    product: {
      type: "Apparel",
      garmentType: "T-Shirt",
      supplier: { productName: "Gildan 5000" },
      quantity: 24,
    },
    pricing: { total: 0 },
  };
}

describe("every card says what happens after submit", () => {
  it("has a fulfilment line, on all three", () => {
    for (const product of productCategories) {
      assert.ok(
        product.fulfilment && product.fulfilment.trim().length > 0,
        `${product.title} has no fulfilment line`
      );
    }
  });

  it("different fulfilment MODELS never share a line", () => {
    /**
     * The actual defect this guards: "Available now" on both the automated
     * flow and the invoiced one — one sentence for two different promises.
     *
     * It used to assert every card's line unique, which was the same thing
     * while every card was its own model. The large-format split ended that:
     * banners and signs are separate products sharing one genuine model
     * (priced online, invoiced), and making them word it differently would
     * recreate the defect in reverse — two sentences for one promise. So the
     * uniqueness is asserted per MODEL, and the shared line is asserted
     * shared.
     */
    const payOnline = productCategories.filter((p) =>
      /pay online/i.test(p.fulfilment)
    );
    const handQuote = productCategories.filter((p) =>
      /hand quote/i.test(p.fulfilment)
    );
    // Apparel, since the 6 Sep flip: an ESTIMATE the shop confirms, then
    // invoices. Its own model — it is invoiced like signs but the figure is
    // an estimate on an assumed size mix, and the handoff's language rule
    // says never call it a price. Matched on "estimate" first so it does
    // not also count as the invoiced model.
    const estimated = productCategories.filter((p) =>
      /estimate/i.test(p.fulfilment)
    );
    const invoiced = productCategories.filter(
      (p) => /invoice/i.test(p.fulfilment) && !/estimate/i.test(p.fulfilment)
    );

    // Four models, no card in two of them, no card in none. Since 7 Sep the
    // invoiced model has no card either: stickers, banners and signs all pay
    // online, and apparel is the estimate. Both empty models stay NAMED here
    // rather than deleted — each comes back with a one-line rollback (a
    // fulfilment string, or the auto-bill ceiling set to 0), and a model with
    // no name is one nobody remembers to check.
    assert.equal(payOnline.length, 3);
    assert.equal(handQuote.length, 0);
    assert.equal(estimated.length, 1);
    assert.equal(invoiced.length, 0);
    assert.equal(
      payOnline.length + handQuote.length + estimated.length + invoiced.length,
      productCategories.length
    );

    // The three self-billing pipelines make the SAME promise in the SAME
    // words. They are one model, so wording them differently would tell a
    // customer they were choosing between things that differ when they do
    // not.
    assert.equal(new Set(payOnline.map((p) => p.fulfilment)).size, 1);
    // And the estimate never calls itself a price.
    for (const product of estimated) {
      assert.doesNotMatch(product.fulfilment, /price/i);
    }
  });

  it("drops the wording that could not tell them apart", () => {
    for (const product of productCategories) {
      assert.doesNotMatch(product.fulfilment, /available now/i);
    }
  });
});

describe("a card may only promise online payment if the server would raise one", () => {
  it("three products claim it — stickers, banners and signs", () => {
    const claiming = productCategories.filter((p) =>
      PAYS_ONLINE.test(p.fulfilment)
    );

    assert.deepEqual(
      claiming.map((p) => p.id).sort(),
      ["banners", "signs", "stickers"],
      `unexpected pay-online set: ${claiming.map((p) => p.title).join(", ")}`
    );
  });

  it("and each is one the SERVER would actually raise a link for", () => {
    // The promise checked against the functions that decide it, not against
    // the comments next to them. Whichever gate owns the flow has to say yes.
    for (const product of productCategories) {
      const claimsOnlinePayment = PAYS_ONLINE.test(product.fulfilment);
      const order = orderFor(product.id) as Record<string, unknown>;

      const repriced = repriceSigns(order);
      const serverWouldBill =
        isStickerOrder(order as never) ||
        decideSignsAutoBill({
          order: repriced.order,
          repriced: repriced.repriced,
          unpriceable: repriced.unpriceable,
          serverTotal: repriced.serverTotal,
          kioskSession: false,
          printavoCreated: true,
        }).bill;

      assert.equal(
        claimsOnlinePayment,
        serverWouldBill,
        `${product.title} claims ${
          claimsOnlinePayment ? "" : "no "
        }online payment, but the server says ${serverWouldBill}`
      );
    }
  });
});
