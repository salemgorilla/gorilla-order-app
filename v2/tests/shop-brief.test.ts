import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildQuoteEmail } from "../lib/email";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/**
 * What the shop is told, and therefore what gets made.
 *
 * Printavo receives no artwork bytes, so the quote email is the ONLY place the
 * file-to-design mapping exists. Every case here is a way that mapping was
 * once wrong or missing — and getting it wrong means cutting the right file at
 * the wrong size, or the wrong file entirely.
 */

const RECEIVED = new Date("2026-08-12T15:00:00Z").toISOString();

function email(order: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return buildQuoteEmail({
    quoteNumber: "GS-TEST",
    receivedAt: RECEIVED,
    order,
    artworkAnalysis: null,
    ...extra,
  });
}

function artworkSection(text: string) {
  return text.split("ARTWORK\n")[1]?.split("\nNOTES")[0] ?? "";
}

const CART = {
  customer: {},
  product: { type: "Custom Stickers", quantity: 450 },
  production: {},
  pricing: { total: 245.68 },
  items: [
    { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, shape: "Die Cut", material: "Matte", artworkFileName: "a.png" },
    { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, shape: "Circle", material: "Gloss", artworkFileName: null },
    { id: "d3", quantity: 100, widthInches: 4, heightInches: 6, shape: "Square", material: "Chrome", artworkFileName: "b.png" },
  ],
};

describe("the email describes every design, separately", () => {
  test("one artwork block per design", () => {
    const section = artworkSection(email(CART).text);

    for (const label of ["-- Design 1 --", "-- Design 2 --", "-- Design 3 --"]) {
      assert.ok(section.includes(label), `missing ${label}`);
    }
  });

  test("each block carries that design's own spec", () => {
    const section = artworkSection(email(CART).text);

    assert.match(section, /Spec: 100 qty, 3" x 3", Die Cut, Matte/);
    assert.match(section, /Spec: 250 qty, 2" x 2", Circle, Gloss/);
    assert.match(section, /Spec: 100 qty, 4" x 6", Square, Chrome/);
  });

  test("design numbering follows the CART even when a design has no file", () => {
    /**
     * Found by posting a real order whose MIDDLE design had no artwork.
     * Numbering counted the files that arrived, not the designs, so design 3's
     * file was labelled "Design 2" and attached as design-2-b.png — pointing
     * the shop at the wrong sticker. The route numbers by cart position now;
     * this asserts the email files each status under the design that owns it.
     */
    const out = email(CART, {
      artworkDelivery: [
        { designId: "d1", label: "Design 1", status: "attached to this email as design-1-a.png" },
        { designId: "d3", label: "Design 3", status: "attached to this email as design-3-b.png" },
      ],
    });

    const blocks = artworkSection(out.text).split("-- Design ");

    // blocks[0] is whatever preceded the first heading.
    assert.match(blocks[1], /design-1-a\.png/);
    assert.match(blocks[2], /No file uploaded/);
    assert.match(blocks[3], /design-3-b\.png/);
    assert.doesNotMatch(blocks[3], /design-2-/);
  });

  test("a proof is named per design, not announced once for all of them", () => {
    const out = email(CART, {
      proofs: [
        { designId: "d1", filename: "design-1-proof.png" },
        { designId: "d3", filename: "design-3-proof.png" },
      ],
    });

    const section = artworkSection(out.text);
    assert.match(section, /Our proof: design-1-proof\.png/);
    assert.match(section, /Our proof: design-3-proof\.png/);
  });

  test("the details block does not state design 1's spec as the whole order's", () => {
    // `product` is a synthesis — design 1's spec under the combined quantity.
    // Printing it verbatim said "450 stickers, 3x3 Die Cut Matte" for an order
    // that was three different stickers, which a shop could act on.
    const details = email(CART).text.split("STICKER DETAILS")[1].split("ESTIMATE")[0];

    assert.match(details, /Designs: 3/);
    assert.match(details, /Total Quantity: 450/);
    assert.doesNotMatch(details, /^Shape:/m);
  });
});

describe("template orders carry a brief instead of a file", () => {
  test("the customer's words reach the shop", () => {
    // A template order uploads nothing. Before this the email said "File: No
    // file uploaded" and the wording — the entire job — appeared nowhere.
    const out = email({
      customer: {},
      product: { type: "Banners & Signs", signType: "Vinyl banner", quantity: 1 },
      production: {},
      pricing: { total: 96, lines: [] },
      artwork: {
        fileName: null,
        template: {
          id: "now-hiring",
          name: "Now hiring",
          text: [
            { label: "Headline", value: "NOW HIRING" },
            { label: "Role or detail", value: "Line cooks & servers" },
          ],
        },
      },
    });

    const section = artworkSection(out.text);
    assert.match(section, /Template: Now hiring/);
    assert.match(section, /Headline: NOW HIRING/);
    assert.match(section, /Role or detail: Line cooks & servers/);
    assert.doesNotMatch(section, /No file uploaded/);
  });
});

describe("a solid background is flagged wherever the shop looks", () => {
  const opaqueItem = {
    id: "d1", quantity: 100, widthInches: 3, heightInches: 3,
    shape: "Die Cut", material: "Matte", artworkFileName: "photo.jpg",
    hasTransparentEdges: false, linePrice: 28.8,
  };

  // `product` is synthesised from design 1, exactly as buildQuotePayload does.
  const opaque = {
    customer: {},
    product: { type: "Custom Stickers", ...opaqueItem, quantity: 100 },
    production: {},
    pricing: { total: 53.8, stickerPrice: 28.8, setupPrice: 25 },
    items: [opaqueItem],
  };

  test("in the email", () => {
    assert.match(artworkSection(email(opaque).text), /SOLID/);
  });

  test("in the Printavo line item", () => {
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST",
      order: opaque,
      artworkAnalysis: null,
    });

    assert.match(plan.lineItems[0].description, /SOLID BACKGROUND/);
  });

  test("and a knockout we made is declared as ours, unchecked", () => {
    const removed = {
      ...opaque,
      items: [{ ...opaque.items[0], hasTransparentEdges: true, backgroundRemoved: true, backgroundRemovedColor: "#ffffff" }],
    };

    const section = artworkSection(
      email(removed, { knockouts: [{ designId: "d1", filename: "photo-no-background.png" }] }).text
    );

    assert.match(section, /Background removed: Yes/);
    assert.match(section, /CHECK IT/);
    assert.match(section, /original is attached too/);
  });
});

describe("add-ons reach the shop on every flow", () => {
  /**
   * The "Add to this quote" strip renders once for all three flows, but the
   * payload was built per-flow and only the sticker branch carried add-ons.
   * A customer could tick a banner onto a signs order and the shop was never
   * told. buildQuotePayload itself lives inside the React component and needs
   * a browser; these assert the two things that consume it.
   */
  const addOns = [
    { id: "banner-3x6", label: "3ft x 6ft vinyl banner", amount: 179, quoteRequired: false },
    { id: "window-decal", label: "Window or door decal", amount: 0, quoteRequired: true },
  ];

  const flows: Array<[string, Record<string, unknown>]> = [
    ["stickers", { type: "Custom Stickers", quantity: 100 }],
    ["signs", { type: "Banners & Signs", signType: "Vinyl banner", quantity: 1 }],
    ["apparel", { type: "T-Shirts & Apparel", garmentType: "Tee", quantity: 24 }],
  ];

  for (const [name, product] of flows) {
    test(`${name}: the email lists them and splits priced from quote-by-hand`, () => {
      const out = email({
        customer: {},
        product,
        production: {},
        pricing: { total: 100, lines: [] },
        addOns,
        addOnsNote: "Also: 50 magnets?",
      });

      assert.match(out.text, /ADD-ONS THE CUSTOMER ASKED FOR/);
      assert.match(out.text, /3ft x 6ft vinyl banner: \$179\.00/);
      assert.match(out.text, /Window or door decal: Quote by hand/);
      assert.match(out.text, /Also asked about: Also: 50 magnets\?/);
      assert.match(out.text, /\+ 1 to quote by hand/);
    });

    test(`${name}: Printavo carries them and tags the upsell`, () => {
      const plan = buildPrintavoQuotePlan({
        quoteNumber: "GS-TEST",
        order: {
          customer: {},
          product,
          production: { deliveryMethod: "Pickup" },
          pricing: { total: 100, lines: [{ label: "Item", amount: 100 }] },
          addOns,
          addOnsNote: "Also: 50 magnets?",
        },
        artworkAnalysis: null,
      });

      assert.ok(plan.tags.includes("#Upsell"));
      assert.match(plan.customerNote, /3ft x 6ft vinyl banner/);
      assert.match(plan.customerNote, /QUOTE BY HAND/);
    });
  }

  test("add-ons never move the priced total", () => {
    // They ride alongside pricing, never inside it — both the email and the
    // Printavo note divide pricing.total by quantity to get a unit price.
    const withAddOns = email({
      customer: {},
      product: { type: "Custom Stickers", quantity: 100 },
      production: {},
      pricing: { total: 53.8, stickerPrice: 28.8 },
      addOns,
    });

    assert.match(withAddOns.text, /Estimated Total: \$53\.80/);
    assert.match(withAddOns.text, /not included in the estimate above/);
  });
});
