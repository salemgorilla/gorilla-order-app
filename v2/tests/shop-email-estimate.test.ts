import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuoteEmail } from "../lib/email";
import { repriceStickers } from "../app/api/quote/route";

/**
 * The ESTIMATE block of the shop email, which is what the shop reconciles the
 * Printavo invoice against.
 *
 * ── THE DEFECT THIS LOCKS OUT ─────────────────────────────────────────────
 * The sticker breakdown listed material and shipping and stopped. Setup was
 * never rendered, so on the reference cart the shop read
 *
 *   Estimated Total: $110.30
 *   Stickers:        $60.80
 *   Shipping:        $12.00
 *
 * with no account of the missing $37.50. Apparel has always listed
 * "Setup / Screens" and signs itemise from the pricing engine; stickers — the
 * one flow that bills with nobody in the loop — did not.
 *
 * AGENTS.md makes reconciling a real order against the invoice the gate for
 * any pricing change, and this email is the thing being reconciled FROM.
 */

function stickerEmail(pricing: Record<string, number>) {
  return buildQuoteEmail({
    quoteNumber: "GS-1042",
    receivedAt: new Date("2026-08-20T12:00:00Z").toISOString(),
    order: {
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Ship" },
      product: {
        type: "Custom Stickers",
        quantity: 350,
        widthInches: 3,
        heightInches: 3,
        material: "Matte",
      },
      items: [
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss" },
      ],
      pricing,
    },
    artworkAnalysis: null,
  }).text;
}

/** Pull "$12.34" out of a "Label: $12.34" row. */
function amount(body: string, label: string) {
  const row = body
    .split("\n")
    .find((l) => l.startsWith(`${label}: `));

  assert.ok(row, `no "${label}" row in the estimate`);

  const match = /\$([\d,]+\.\d\d)/.exec(row);
  assert.ok(match, `"${label}" carried no money value: ${row}`);

  return Number(match[1].replace(/,/g, ""));
}

describe("the sticker breakdown adds up to the total above it", () => {
  it("reconciles on the reference cart", () => {
    const body = stickerEmail({
      total: 110.3,
      stickerPrice: 60.8,
      setupPrice: 37.5,
      shippingPrice: 12,
    });

    const total = amount(body, "Estimated Total");
    const parts =
      amount(body, "Stickers") + amount(body, "Setup") + amount(body, "Shipping");

    assert.equal(
      parts,
      total,
      `the lines beneath the total came to $${parts.toFixed(2)}, not $${total.toFixed(2)}`
    );
  });

  it("reconciles against figures the SERVER actually charges", () => {
    // Not hand-written numbers. repriceStickers is the function the route runs
    // before handing a total to Printavo, so this asserts the email agrees
    // with the money path rather than with a stale idea of what a cart costs.
    const priced = repriceStickers({
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Ship" },
      product: { type: "Custom Stickers", quantity: 350 },
      items: [
        { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
        { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss" },
      ],
      pricing: { total: 0 },
    } as never);

    const pricing = (priced.order as Record<string, unknown>)
      .pricing as Record<string, number>;

    const body = stickerEmail(pricing);

    const total = amount(body, "Estimated Total");
    const parts =
      amount(body, "Stickers") + amount(body, "Setup") + amount(body, "Shipping");

    assert.equal(Math.round(parts * 100), Math.round(total * 100));
  });

  it("shows setup on a local pickup order too, where shipping is free", () => {
    const body = stickerEmail({
      total: 98.3,
      stickerPrice: 60.8,
      setupPrice: 37.5,
      shippingPrice: 0,
    });

    assert.equal(amount(body, "Setup"), 37.5);
    assert.match(body, /Shipping: Free \(local pickup\)/);
  });

  it("prints a zero setup rather than hiding it", () => {
    // Setup is $25 for the first design and $12.50 for each after, so $0.00 is
    // never correct for a real sticker order. A blank row would let that pass
    // unnoticed; a visible $0.00 will not.
    const body = stickerEmail({
      total: 72.8,
      stickerPrice: 60.8,
      setupPrice: 0,
      shippingPrice: 12,
    });

    assert.equal(amount(body, "Setup"), 0);
  });
});
