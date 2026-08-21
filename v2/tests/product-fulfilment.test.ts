import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productCategories } from "../lib/products";
import { isStickerOrder } from "../app/api/quote/route";

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
 * "Pay online" is a promise about the SERVER. isStickerOrder() is what
 * actually decides whether a submission gets a payment link, so the promise
 * is asserted against that function rather than against a comment. A card
 * that offered online payment for a flow which cannot raise a link would be
 * a lie told at the exact moment someone is deciding to trust the thing.
 */

const PAYS_ONLINE = /pay online/i;

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

  if (id === "signs") {
    return {
      customer,
      production,
      product: { type: "Banners & Signs", signType: "18oz", quantity: 3 },
      pricing: { total: 200 },
    };
  }

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

  it("no longer leaves two products saying the same thing", () => {
    // The actual defect: "Available now" on both the automated flow and the
    // invoiced one.
    const lines = productCategories.map((p) => p.fulfilment);

    assert.equal(
      new Set(lines).size,
      lines.length,
      `two products make the same promise: ${lines.join(" | ")}`
    );
  });

  it("drops the wording that could not tell them apart", () => {
    for (const product of productCategories) {
      assert.doesNotMatch(product.fulfilment, /available now/i);
    }
  });
});

describe("a card may only promise online payment if the server would raise one", () => {
  it("exactly one product claims it", () => {
    const claiming = productCategories.filter((p) =>
      PAYS_ONLINE.test(p.fulfilment)
    );

    assert.equal(
      claiming.length,
      1,
      `expected one pay-online product, got ${claiming.map((p) => p.title).join(", ")}`
    );
  });

  it("and it is the one isStickerOrder actually accepts", () => {
    // The promise checked against the function that decides it, not against
    // the comment next to it.
    for (const product of productCategories) {
      const claimsOnlinePayment = PAYS_ONLINE.test(product.fulfilment);
      const serverWouldBill = isStickerOrder(orderFor(product.id) as never);

      assert.equal(
        claimsOnlinePayment,
        serverWouldBill,
        `${product.title} claims ${
          claimsOnlinePayment ? "" : "no "
        }online payment, but isStickerOrder says ${serverWouldBill}`
      );
    }
  });
});
