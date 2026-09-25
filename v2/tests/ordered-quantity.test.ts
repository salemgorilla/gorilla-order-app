/**
 * THE SERVER PRICES WHAT WAS ORDERED, AND SAYS SO.
 *
 * ── THE HOLE ──────────────────────────────────────────────────────────────
 * repriceStickers priced `items[]` and copied `product` through untouched.
 * But for a SINGLE-DESIGN order, every shop-facing and invoice-facing
 * surface reads `product.quantity`, not the item:
 *
 *   lib/printavo.ts   the decal row's quantity and sizes[].count
 *   lib/email.ts      the subject line and the Quantity row
 *
 * Nothing reconciled the two. Reproduced against the real code on
 * 2026-09-25, before the fix:
 *
 *   product.quantity 5000, items[0].quantity 1
 *     -> server priced ONE sticker, total $45.00 (the order minimum)
 *     -> Printavo row read "5000x Custom Stickers" at $0.0002 each
 *     -> shop prints 5,000 and collects $45. Correct price: ~$2,057.
 *
 * /api/quote is public and unauthenticated, and stickers auto-bill with no
 * human in the loop, so that is one crafted payload away. The true ordered
 * quantity appeared on NO shop-facing surface for a single-design order —
 * the only tell anywhere was an "Each: $0.01" line in the customer note.
 *
 * Invariant 2 — "the server reprices, the browser is not trusted" — was
 * enforced on the PRICE and not on WHAT WAS ORDERED.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { repriceStickers } from "../lib/sticker-repricing";

const design = (quantity: number, id = "d1") => ({
  id,
  type: "Custom Stickers",
  quantity,
  widthInches: 3,
  heightInches: 3,
  size: '3" x 3"',
  shape: "Die Cut",
  material: "Gloss White Vinyl",
  finish: "Gloss",
});

function submit(productQuantity: number, itemQuantities: number[]) {
  const order = {
    customer: { customerName: "X", email: "x@y.com" },
    production: { deliveryMethod: "Pickup" },
    product: { ...design(productQuantity), designCount: itemQuantities.length },
    items: itemQuantities.map((q, i) => design(q, `d${i}`)),
  };

  const res = repriceStickers(order as never) as unknown as {
    order: Record<string, unknown>;
    serverTotal: number;
  };
  const priced = res.order;
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-T",
    order: priced,
    artworkAnalysis: null,
  } as never) as never as {
    lineItems: { description: string; quantity?: number; price?: unknown }[];
  };

  return {
    serverTotal: res.serverTotal,
    productQuantity: Number((priced.product as Record<string, unknown>).quantity),
    rows: plan.lineItems,
    invoiced: plan.lineItems.reduce(
      (t, l) => t + Number(l.price ?? 0) * Number(l.quantity ?? 1),
      0
    ),
    piecesOnInvoice: plan.lineItems.reduce((t, l) => t + Number(l.quantity ?? 0), 0),
  };
}

describe("a forged product.quantity cannot outrun the price", () => {
  test("the 5000-for-$45 payload now invoices one sticker", () => {
    const forged = submit(5000, [1]);

    assert.equal(
      forged.productQuantity,
      1,
      "the shop is still being told to print 5,000 for the price of one"
    );
    assert.equal(forged.piecesOnInvoice, 1);
  });

  test("the pieces invoiced always equal the pieces priced", () => {
    // The general statement, over honest and forged payloads alike.
    for (const [productQty, items] of [
      [100, [100]],
      [600, [100, 500]],
      [5000, [1]],
      [9999, [100, 500]],
      [1, [250]],
      [0, [40]],
    ] as [number, number[]][]) {
      const out = submit(productQty, items);
      const ordered = items.reduce((t, q) => t + q, 0);

      assert.equal(
        out.piecesOnInvoice,
        ordered,
        `product.quantity=${productQty} items=[${items}] invoiced ${out.piecesOnInvoice} pieces for ${ordered} ordered`
      );
    }
  });

  test("an honest single-design order is completely unchanged", () => {
    // The fix must not move a real price. 100 x 3in die cut is the
    // reference pack: $84 of vinyl, $15 setup, $99 total.
    const honest = submit(100, [100]);

    assert.equal(honest.serverTotal, 99);
    assert.equal(honest.productQuantity, 100);
    assert.equal(honest.piecesOnInvoice, 100);
    assert.equal(Number(honest.rows[0]?.price), 0.84);
  });

  test("an honest cart is unchanged too", () => {
    const honest = submit(600, [100, 500]);

    assert.equal(honest.productQuantity, 600);
    assert.equal(honest.rows.length, 2);
    assert.equal(honest.piecesOnInvoice, 600);
  });
});

describe("designCount comes from the cart, not from the caller", () => {
  test("it is restated from the priced items", () => {
    // designCount decides how much SETUP is charged. A forged one is the
    // same class of defect as a forged quantity.
    const order = {
      customer: { customerName: "X", email: "x@y.com" },
      production: { deliveryMethod: "Pickup" },
      product: { ...design(600), designCount: 99 },
      items: [design(100, "a"), design(500, "b")],
    };

    const res = repriceStickers(order as never) as unknown as {
      order: Record<string, unknown>;
    };

    assert.equal(
      Number((res.order.product as Record<string, unknown>).designCount),
      2
    );
  });
});
