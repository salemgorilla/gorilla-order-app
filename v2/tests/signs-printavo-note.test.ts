import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/**
 * What Printavo's own record says a signs cart IS.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The line items learned about the signs cart. The NOTE — the thing a printer
 * reads off the job — did not. A quote for one 72" x 36" banner and ten yard
 * signs reached Printavo as:
 *
 *     WEB QUOTE GS-… - 11 Vinyl Banner
 *
 *     SIGNS
 *     11x Vinyl Banner
 *     Size: 72" x 36"
 *     Material: 13 oz Scrim Vinyl
 *     Finishing: Hemmed + Grommets
 *
 * Design 1's spec wearing the whole order's count. That is a job the shop
 * could work — eleven big banners — and it is not the order that was placed.
 *
 * The sticker cart fixed exactly this, in the same function, and left its
 * reasoning in a comment: "the note has to say what the run actually is, not
 * repeat design 1's spec under the combined quantity." Signs are the sibling
 * that did not get it. Same shape as the shop email's product block, the
 * each-price, the knockout guard and the artwork parts before them.
 */

function design(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "vinyl-banner",
    quantity: 1,
    customWidthInches: 72,
    customHeightInches: 36,
    material: "13 oz Scrim Vinyl",
    finishing: "Hemmed + Grommets",
    ...overrides,
  });
}

const YARD = {
  productId: "yard-sign",
  quantity: 10,
  material: "Coroplast",
  finishing: "Signs Only",
  customWidthInches: 0,
  customHeightInches: 0,
} as const;

function planFor(designs: SignsDesign[]) {
  const cart = quoteSignsCart(designs);

  return buildPrintavoQuotePlan({
    quoteNumber: "GS-20260823-AB12C",
    order: {
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Pickup" },
      ...buildSignsPayloadParts(designs, cart),
    },
  } as never) as never as {
    nickname: string;
    customerNote: string;
    lineItems: Array<{ itemNumber: string; description: string }>;
  };
}

/** The block a printer reads. */
function signsBlock(note: string) {
  return note.split("SIGNS\n")[1]?.split("\n\nTIMELINE")[0] ?? "";
}

describe("the note describes the order, not design 1", () => {
  const plan = planFor([design(), design(YARD)]);
  const block = signsBlock(plan.customerNote);

  test("it does not state design 1's product under the combined count", () => {
    // The exact line that reached Printavo. Eleven banners is a job someone
    // could start.
    assert.doesNotMatch(block, /^11x Vinyl Banner$/m);
  });

  test("it says how the count is split", () => {
    assert.match(block, /11x signs across 2 designs/);
  });

  test("every design gets its own spec", () => {
    assert.match(block, /DESIGN 1\n1x Vinyl Banner/);
    assert.match(block, /DESIGN 2\n10x Yard Sign/);
  });

  test("each design's material is its own", () => {
    // Coroplast must not appear under the banner, nor scrim vinyl under the
    // yard signs — the failure mode is a printer cutting the wrong stock.
    const [first, second] = block.split("DESIGN 2");

    assert.match(first, /13 oz Scrim Vinyl/);
    assert.doesNotMatch(first, /Coroplast/);
    assert.match(second, /Coroplast/);
    assert.doesNotMatch(second, /13 oz Scrim Vinyl/);
  });

  test("a template design carries its wording, per design", () => {
    // A template IS the artwork, so the words are the job. On a cart these
    // came only from design 1's `artwork.template`, which is the same
    // single-design assumption one level down.
    const withTemplate = planFor([
      design(),
      design({ ...YARD, templateId: "open-house" }),
    ]);
    const second = signsBlock(withTemplate.customerNote).split("DESIGN 2")[1] ?? "";

    assert.match(second, /TEMPLATE ARTWORK - NO FILE UPLOADED/);
  });
});

describe("the job list label", () => {
  test("a cart says how many signs and how many designs", () => {
    assert.match(
      planFor([design(), design(YARD)]).nickname,
      /GS-20260823-AB12C - 11 Signs \/ 2 designs$/
    );
  });

  test("it never names design 1's product as the whole order", () => {
    assert.doesNotMatch(
      planFor([design(), design(YARD)]).nickname,
      /11 Vinyl Banner/
    );
  });

  test("one design still names the sign, exactly as before", () => {
    // Every signs quote the shop has ever taken is this shape. It must not
    // become "10 Signs / 1 designs".
    assert.match(
      planFor([design(YARD)]).nickname,
      /GS-20260823-AB12C - 10 Yard Sign$/
    );
  });

  test("the quote number survives, because tracking matches on it", () => {
    // lookupOrderStatus finds a customer's order by this string. Drop the
    // number and a customer holding a real receipt is told we have never
    // heard of them.
    for (const designs of [[design()], [design(), design(YARD)]]) {
      assert.ok(planFor(designs).nickname.includes("GS-20260823-AB12C"));
    }
  });
});

describe("a one-design quote is untouched", () => {
  const plan = planFor([design(YARD)]);

  test("the note reads as it always has", () => {
    const block = signsBlock(plan.customerNote);

    assert.match(block, /^10x Yard Sign$/m);
    assert.doesNotMatch(block, /DESIGN 1/);
    assert.doesNotMatch(block, /across/);
  });
});
