/**
 * THREE CLASSIFIERS DECIDE THE SAME QUESTION AND MUST NEVER DISAGREE.
 *
 *   isStickerOrder  lib/sticker-repricing.ts   decides repricing AND billing
 *   isSignsOrder    lib/auto-bill.ts           decides the signs auto-bill
 *   isSigns         lib/printavo.ts            decides which INVOICE rows exist
 *
 * ── WHAT DISAGREEING COST ─────────────────────────────────────────────────
 * Two of them bailed on "sticker"; the third did not. So
 * `type: "Custom Sticker Banners"` was BOTH a sticker order and a signs
 * order. isStickerOrder priced it against the sticker table and auto-billed
 * it; isSigns then told buildPrintavoQuotePlan it was signs, which empties
 * stickerItems and skips the setup-fee and order-minimum rows.
 *
 * Verified before the fix: the reference pack priced at $99.00 and invoiced
 * at $84.00 — the $15 setup silently gone. On a small order the $45 minimum
 * goes the same way, so one sticker bills $0.84 instead of $45.00.
 * serverTotal, the ceiling gate and the log line all still said $99; only
 * amountOutstanding was short, and that is the number the card is charged.
 *
 * /api/quote is public, so the type string is caller-supplied.
 *
 * This suite is the guard on the CLASS of bug, not the one string: any
 * future divergence between the three shows up here rather than in a
 * customer's invoice.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isSignsOrder } from "../lib/auto-bill";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { isStickerOrder, repriceStickers } from "../lib/sticker-repricing";

/** Type strings that name more than one pipeline, plus the honest ones. */
const TYPES = [
  "Custom Stickers",
  "Custom Sticker Banners",
  "Sticker Signs",
  "STICKER BANNERS",
  "stickers and banners",
  "Vinyl Banners",
  "Signs",
  "Banners & Signs",
];

const decalProduct = (type: string) => ({
  type,
  quantity: 100,
  widthInches: 3,
  heightInches: 3,
  size: '3" x 3"',
  shape: "Die Cut",
  material: "Gloss White Vinyl",
  finish: "Gloss",
});

function invoiceFor(type: string) {
  const order = {
    customer: { customerName: "X", email: "x@y.com" },
    production: { deliveryMethod: "Pickup" },
    product: decalProduct(type),
    items: [{ id: "d1", ...decalProduct(type) }],
  };

  const res = repriceStickers(order as never) as unknown as {
    order: Record<string, unknown>;
    serverTotal: number;
  };
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-T",
    order: res.order,
    artworkAnalysis: null,
  } as never) as never as {
    lineItems: { price?: unknown; quantity?: number }[];
    feeLineItems: { price?: unknown }[];
    shippingLineItem: { price?: unknown } | null;
  };

  const rows = [
    ...plan.lineItems,
    ...plan.feeLineItems,
    ...(plan.shippingLineItem ? [plan.shippingLineItem] : []),
  ];

  return {
    priced: res.serverTotal,
    invoiced: rows.reduce(
      (t, l) =>
        t + Number(l.price ?? 0) * Number((l as { quantity?: number }).quantity ?? 1),
      0
    ),
    order: res.order,
  };
}

describe("nothing is both a sticker order and a signs order", () => {
  test("isStickerOrder and isSignsOrder never both say yes", () => {
    for (const type of TYPES) {
      const product = decalProduct(type);
      const order = { product, items: [{ id: "d", ...product }] };

      assert.equal(
        isStickerOrder(order as never) && isSignsOrder(order as never),
        false,
        `"${type}" classified as BOTH — it would be repriced as stickers and billed as signs`
      );
    }
  });
});

describe("THE INVARIANT — what is priced is what is invoiced", () => {
  test("no type string can make the invoice fall short of the price", () => {
    /**
     * The one that actually costs money. A mismatch here means the shop
     * collects less than it quoted, with serverTotal and the logs still
     * reporting the full figure.
     */
    for (const type of TYPES) {
      const { priced, invoiced } = invoiceFor(type);

      assert.equal(
        Number(invoiced.toFixed(2)),
        Number(priced.toFixed(2)),
        `"${type}" priced $${priced} and invoiced $${invoiced.toFixed(2)}`
      );
    }
  });

  test("the crafted string that found this bills the full $99", () => {
    // The specific regression: $99 priced, $84 invoiced, $15 setup gone.
    const { priced, invoiced } = invoiceFor("Custom Sticker Banners");

    assert.equal(priced, 99);
    assert.equal(Number(invoiced.toFixed(2)), 99);
  });

  test("an honest sticker order is unchanged", () => {
    const { priced, invoiced } = invoiceFor("Custom Stickers");

    assert.equal(priced, 99);
    assert.equal(Number(invoiced.toFixed(2)), 99);
  });
});
