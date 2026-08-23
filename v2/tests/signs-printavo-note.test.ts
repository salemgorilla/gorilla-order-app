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

/**
 * A SIGNS-family design. The cart fixtures here stay inside one family
 * because the pipelines are hard-split (Gabe, 2026-08-23): a banner quote
 * holds only banners and a signs quote only signs, so a mixed cart is a
 * shape the UI can no longer produce. The banners pipeline gets its own
 * describe at the bottom.
 */
function design(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "rigid-sign",
    quantity: 1,
    customWidthInches: 36,
    customHeightInches: 24,
    material: 'PVC 1/8"',
    finishing: "Drilled Holes",
    ...overrides,
  });
}

/** A banners-family design, for the pipeline-label tests. */
function banner(overrides: Partial<SignsDesign> = {}) {
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
  // Either pipeline's heading — the split renamed the banners one.
  return (
    note.split(/\n(?:BANNERS|SIGNS)\n/)[1]?.split("\n\nTIMELINE")[0] ?? ""
  );
}

describe("the note describes the order, not design 1", () => {
  const plan = planFor([design(), design(YARD)]);
  const block = signsBlock(plan.customerNote);

  test("it does not state design 1's product under the combined count", () => {
    // The exact shape that reached Printavo before the fix. Eleven rigid
    // signs is a job someone could start.
    assert.doesNotMatch(block, /^11x Rigid Sign$/m);
  });

  test("it says how the count is split", () => {
    assert.match(block, /11x signs across 2 designs/);
  });

  test("every design gets its own spec", () => {
    assert.match(block, /DESIGN 1\n1x Rigid Sign/);
    assert.match(block, /DESIGN 2\n10x Yard Sign/);
  });

  test("each design's material is its own", () => {
    // Coroplast must not appear under the rigid sign, nor PVC under the yard
    // signs — the failure mode is a printer cutting the wrong stock.
    const [first, second] = block.split("DESIGN 2");

    assert.match(first, /PVC 1\/8"/);
    assert.doesNotMatch(first, /Coroplast/);
    assert.match(second, /Coroplast/);
    assert.doesNotMatch(second, /PVC/);
  });

  test("each design names its own file", () => {
    /**
     * The note's own "File:" line further down names ONE file — whichever the
     * browser last analysed. On a two-file quote that answers the question for
     * at most one design and looks like it answered it for both, so a printer
     * reading DESIGN 2 had its size and its stock and no way to tell which
     * attachment was its artwork.
     *
     * The sticker spec has carried this line since carts existed. One design
     * needs no such line and does not get one: its "File:" line is
     * unambiguous, and every signs quote the shop has ever taken is that
     * shape.
     */
    const withFiles = [design(), design(YARD)];
    withFiles[0].artwork = { file: { name: "banner-art.pdf" } as never };
    withFiles[1].artwork = { file: { name: "yard-art.png" } as never };

    const block = signsBlock(planFor(withFiles).customerNote);
    const [first, second] = block.split("DESIGN 2");

    assert.match(first, /Artwork file: banner-art\.pdf/);
    assert.doesNotMatch(first, /yard-art/);
    assert.match(second, /Artwork file: yard-art\.png/);
  });

  test("a design still waiting on artwork says so", () => {
    // Blank would read as a rendering fault. "none uploaded" is the sticker
    // spec's wording, so the shop reads one vocabulary.
    const block = signsBlock(planFor([design(), design(YARD)]).customerNote);

    assert.equal((block.match(/Artwork file: none uploaded/g) ?? []).length, 2);
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

  test("a banners cart is labelled Banners, not Signs", () => {
    /**
     * The pipeline split's whole point in one line: the shop's job list
     * says which department the order belongs to. The family rides the
     * payload (product.family, from buildSignsPayloadParts) and the noun in
     * the note's count line follows it too.
     */
    const plan = planFor([banner(), banner({ quantity: 2 })]);

    assert.match(plan.nickname, /3 Banners \/ 2 designs$/);
    assert.match(signsBlock(plan.customerNote), /3x banners across 2 designs/);
    assert.doesNotMatch(plan.nickname, /3 Signs/);
  });

  test("the note's heading names the pipeline", () => {
    const banners = planFor([banner(), banner()]);
    const signs = planFor([design(), design(YARD)]);

    assert.match(banners.customerNote, /\nBANNERS\n/);
    assert.doesNotMatch(banners.customerNote, /\nSIGNS\n/);
    assert.match(signs.customerNote, /\nSIGNS\n/);
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
