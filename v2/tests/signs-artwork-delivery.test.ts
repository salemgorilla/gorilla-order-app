import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildQuoteEmail } from "../lib/email";
import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";

/**
 * Whether each sign's artwork actually ARRIVED, said per design.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * A signs cart's artwork block named the file and stopped there:
 *
 *     -- Design 1 — Vinyl Banner --
 *     File: huge-banner.psd
 *
 * The fate of that file — attached, uploaded to storage, or never sent at all
 * because it would have killed the request at the edge — lived in exactly one
 * string, `attachmentInfo`, and the only branch that rendered it was the
 * SINGLE-design one. A cart never reaches that branch, so:
 *
 *   • a 42 MB banner that never left the browser read to the shop as a
 *     filename they should be able to open, with nothing telling them to go
 *     and ask the customer for it;
 *   • a file that went to blob storage had its LINK dropped, so the email
 *     named a file and withheld the only way to get it.
 *
 * The sticker cart has carried a "Delivery" line per design since the day it
 * grew a cart. Signs were the sibling that did not — the same shape as the
 * knockout guard, the each-price, and the artwork parts before them.
 *
 * Printavo receives no bytes. This email is the only place the file-to-design
 * map exists, so a missing status is a file the shop cannot chase.
 */

const RECEIVED = new Date("2026-08-23T15:00:00Z").toISOString();

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

/** The real payload, so nothing here is a restatement of the thing under test. */
function order(designs: SignsDesign[]) {
  return {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: { deliveryMethod: "Pickup" },
    ...buildSignsPayloadParts(designs, quoteSignsCart(designs)),
  };
}

function artworkSection(designs: SignsDesign[], delivery: unknown[]) {
  const built = buildQuoteEmail({
    quoteNumber: "GS-TEST",
    receivedAt: RECEIVED,
    order: order(designs),
    artworkAnalysis: null,
    artworkDelivery: delivery,
  } as never);

  return {
    text: built.text.split("ARTWORK\n")[1]?.split("\nNOTES")[0] ?? "",
    html: built.html,
  };
}

describe("a file that never left the browser says so", () => {
  const designs = [design(), design({ productId: "yard-sign", quantity: 10 })];

  /** Verbatim from app/api/quote/route.ts's dropped branch. */
  const DROPPED =
    'ARTWORK NOT UPLOADED — "huge-banner.psd" is 42.0 MB, over the 3.5 MB form limit. Email the customer to collect it.';

  const delivery = [
    { designId: designs[0].id, label: "Design 1", status: DROPPED },
    {
      designId: designs[1].id,
      label: "Design 2",
      status: "attached to this email as design-2-yard.pdf",
    },
  ];

  test("the warning reaches the email at all", () => {
    // It did not. This is the whole bug in one assertion.
    assert.match(artworkSection(designs, delivery).text, /ARTWORK NOT UPLOADED/);
  });

  test("it sits in the block for the design it belongs to", () => {
    const blocks = artworkSection(designs, delivery)
      .text.split("-- Design ")
      .slice(1);

    assert.equal(blocks.length, 2);
    assert.match(blocks[0], /ARTWORK NOT UPLOADED/);
    assert.doesNotMatch(blocks[1], /ARTWORK NOT UPLOADED/);
    assert.match(blocks[1], /design-2-yard\.pdf/);
  });

  test("the HTML the shop actually reads carries it too", () => {
    // The text part is a fallback; most mail clients render the HTML.
    assert.match(artworkSection(designs, delivery).html, /ARTWORK NOT UPLOADED/);
  });
});

describe("a file that went to storage brings its link", () => {
  test("the URL is in the design's own block", () => {
    const designs = [design(), design()];
    const url = "https://blob.example.com/artwork/design-one.pdf";

    const { text } = artworkSection(designs, [
      {
        designId: designs[0].id,
        label: "Design 1",
        status: `uploaded — design-one.pdf (12.4 MB): ${url}`,
        design: 1,
        fileName: "design-one.pdf",
        url,
      },
      {
        designId: designs[1].id,
        label: "Design 2",
        status: "attached to this email as design-2-b.pdf",
      },
    ]);

    // Naming a file and withholding the link is worse than saying nothing:
    // it reads as an attachment the shop has simply failed to find.
    assert.ok(text.includes(url), "the storage link is nowhere in the email");
  });
});

describe("the status is matched by design id, not by position", () => {
  test("statuses arriving out of order still land on the right design", () => {
    // artworkDelivery is built from the parts that were sent, so a design
    // with no file is absent from it and every later index shifts. Matching
    // by id is what makes that harmless.
    const designs = [design(), design({ productId: "yard-sign" }), design()];

    const { text } = artworkSection(designs, [
      {
        designId: designs[2].id,
        label: "Design 3",
        status: "attached to this email as design-3-third.pdf",
      },
      {
        designId: designs[0].id,
        label: "Design 1",
        status: "attached to this email as design-1-first.pdf",
      },
    ]);

    const blocks = text.split("-- Design ").slice(1);

    assert.match(blocks[0], /design-1-first\.pdf/);
    assert.match(blocks[1], /Delivery: No file uploaded/);
    assert.match(blocks[2], /design-3-third\.pdf/);
  });
});

describe("a template design owes no delivery status", () => {
  test("it says what to set, not what failed to attach", () => {
    // A template IS the artwork. "No file uploaded" under one reads as a
    // problem, and there is no file to chase.
    const designs = [
      design({ productId: "yard-sign", templateId: "open-house" }),
      design(),
    ];

    const { text } = artworkSection(designs, []);
    const first = text.split("-- Design ")[1] ?? "";

    assert.match(first, /No file to chase/);
    assert.doesNotMatch(first, /Delivery:/);
  });
});

describe("one design is unaffected", () => {
  test("a single-design signs quote still reads as it always has", () => {
    // It reaches a different branch, which already rendered attachmentInfo.
    // Pinned so a fix to the cart cannot quietly move the one-design email.
    const built = buildQuoteEmail({
      quoteNumber: "GS-TEST",
      receivedAt: RECEIVED,
      order: order([design()]),
      artworkAnalysis: null,
      attachmentInfo: "attached to this email as banner.pdf",
    } as never);

    assert.match(built.text, /Attachment: attached to this email as banner\.pdf/);
  });
});
