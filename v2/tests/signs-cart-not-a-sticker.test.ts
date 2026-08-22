import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { isStickerOrder, POST } from "../app/api/quote/route";

/**
 * The signs cart, held against the one invariant that costs real money.
 *
 * ── WHY THIS FILE ─────────────────────────────────────────────────────────
 * `isStickerOrder()` decides which submissions get a LIVE PAYABLE LINK with
 * no human in the loop. AGENTS.md calls it the thing that matters most, and
 * its original bug was classification by OMISSION: any new flow that forgot
 * to set a field was treated as stickers and auto-billed a price nobody set.
 *
 * A signs quote growing a design list is exactly such a new flow. It changed
 * the payload's shape — `designCount` on `product`, a `signsDesigns` array
 * beside it — and until now nothing checked the REAL cart payload against
 * that gate. money-path.test.ts checks a hand-written
 * `{ type: "Banners & Signs", signType: "Vinyl banner" }`, which is a
 * different object from the one buildSignsPayloadParts actually produces.
 * A test that asserts against a fixture nobody ships is a test that can pass
 * while the shipped payload auto-bills.
 *
 * So: build the payload the app really builds, and put it through the real
 * gate and the real endpoint.
 */

function design(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "vinyl-banner",
    quantity: 2,
    customWidthInches: 72,
    customHeightInches: 36,
    material: "13 oz Scrim Vinyl",
    finishing: "Hemmed + Grommets",
    ...overrides,
  });
}

const CARTS: Array<[string, SignsDesign[]]> = [
  ["one design", [design()]],
  [
    "two designs",
    [
      design(),
      design({
        productId: "yard-sign",
        material: "Coroplast",
        finishing: "Signs Only",
        customWidthInches: 0,
        customHeightInches: 0,
        quantity: 10,
      }),
    ],
  ],
  [
    "three designs, mixed products",
    [
      design(),
      design({ productId: "poster", material: "Indoor Poster Paper", finishing: "Standard", customWidthInches: 24, customHeightInches: 18 }),
      design({ productId: "rigid-sign", material: 'PVC 1/8"', finishing: "Drilled Holes", customWidthInches: 25, customHeightInches: 37 }),
    ],
  ],
];

function payloadFor(designs: SignsDesign[]) {
  return buildSignsPayloadParts(designs, quoteSignsCart(designs));
}

describe("no signs cart can ever self-check-out", () => {
  for (const [name, designs] of CARTS) {
    test(`${name}: the real payload is refused by isStickerOrder`, () => {
      const parts = payloadFor(designs);

      assert.equal(
        isStickerOrder(parts as never),
        false,
        `${name} would have been issued a live payment link`
      );
    });
  }

  test("and it is the product TYPE doing the refusing", () => {
    // Not an accident of a missing field — that was the original bug. The
    // type says what this is, positively.
    const parts = payloadFor(CARTS[1][1]);

    assert.equal(parts.product.type, "Banners & Signs");
    assert.doesNotMatch(parts.product.type, /sticker/i);
  });

  test("a signs payload stripped of its designs is STILL not a sticker order", () => {
    // The failure mode worth guarding: someone drops `signsDesigns` in a
    // refactor and the payload falls back to looking like a bare product.
    const parts = payloadFor(CARTS[1][1]) as Record<string, unknown>;
    const { signsDesigns: _dropped, ...withoutDesigns } = parts;

    assert.equal(isStickerOrder(withoutDesigns as never), false);
  });
});

describe("the payload the cart builds survives the real endpoint", () => {
  function post(order: unknown) {
    const body = new FormData();
    body.append("order", JSON.stringify(order));

    return POST(
      new Request("https://labs.gorillasalem.com/api/quote", {
        method: "POST",
        body,
      })
    );
  }

  for (const [name, designs] of CARTS) {
    test(`${name} posts without throwing`, async () => {
      const parts = payloadFor(designs);

      const response = await post({
        customer: {
          customerName: "Dana Whitfield",
          email: "dana@example.com",
          company: "",
          phone: "",
          notes: "",
          heardAbout: [],
          newsletterOptIn: false,
        },
        production: { deliveryMethod: "Pickup", needBy: "2026-09-15" },
        ...parts,
      });

      // 200 or 502 — a delivery outcome, not a rejection. Anything else means
      // the shape broke something on the way in. Credentials are absent here,
      // so the send itself is expected to fail; what is being checked is that
      // the route accepted and processed the payload.
      assert.ok(
        response.status === 200 || response.status === 502,
        `${name} returned ${response.status}`
      );
    });
  }

  test("a cart with several designs still reports the whole order's sign count", () => {
    // product.quantity is what the shop email headline and Printavo read.
    // Reporting design 1's count on a three-design order understates the job.
    const [, twoDesigns] = CARTS[1];
    const parts = payloadFor(twoDesigns);

    assert.equal(parts.product.quantity, 12);
    assert.equal(parts.product.designCount, 2);
  });
});
