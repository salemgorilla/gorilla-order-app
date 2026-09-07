/**
 * CAN THE SHOP TELL, FROM ITS OWN EMAIL, WHETHER A CUSTOMER WAS CHARGED?
 *
 * ── THE GAP ───────────────────────────────────────────────────────────────
 * The shop email is built and sent BEFORE Printavo is called and before any
 * payment link is raised. While stickers were the only self-billing flow that
 * was survivable: they bill on every ordinary order, so "sticker order" and
 * "will be paid" meant the same thing and the email did not have to say it.
 *
 * Signs ended that on 7 Sep. A banner order over the $1,500 ceiling raises no
 * link, and its email looked exactly like the $200 one that did — so the shop
 * would be waiting on a payment nobody had been asked for, on a job it had
 * already started. This file holds the line that closes it.
 *
 * The note is generated from the SAME decision the route bills from, so the
 * email and the payment link cannot disagree about what happened.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SIGNS_AUTO_BILL_CEILING,
  decideSignsAutoBill,
  shopPaymentNote,
} from "../lib/auto-bill";
import { buildCustomerLines, buildQuoteEmail } from "../lib/email";
import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceSigns } from "../lib/signs-repricing";

const CUSTOMER = {
  customerName: "Dana",
  email: "dana@example.com",
  phone: "555-0100",
};

function signsOrder(overrides: Partial<SignsDesign> = {}) {
  const designs = [
    createSignsDesign({
      productId: "vinyl-banner",
      quantity: 1,
      customWidthInches: 36,
      customHeightInches: 24,
      material: "13 oz Scrim Vinyl",
      finishing: "Hemmed + Grommets",
      ...overrides,
    }),
  ];

  return {
    customer: CUSTOMER,
    production: { deliveryMethod: "Pickup", needBy: "2026-10-20" },
    ...buildSignsPayloadParts(designs, quoteSignsCart(designs)),
  } as Record<string, unknown>;
}

/** The route's own composition: reprice, decide, then write the note. */
function noteFor(order: Record<string, unknown>, serverTotal?: number) {
  const repriced = repriceSigns(order);

  return shopPaymentNote({
    order: repriced.order,
    signs: decideSignsAutoBill({
      order: repriced.order,
      repriced: repriced.repriced,
      unpriceable: repriced.unpriceable,
      serverTotal: serverTotal ?? repriced.serverTotal,
      kioskSession: false,
      printavoCreated: true,
    }),
    stickers: false,
    stickersUnpriceable: false,
  });
}

describe("a signs order says which bucket it is in", () => {
  test("one that bills says so", () => {
    const note = noteFor(signsOrder());

    assert.ok(note);
    assert.match(note, /charged automatically/i);
  });

  test("one over the ceiling says invoice it by hand, and why", () => {
    const note = noteFor(signsOrder(), SIGNS_AUTO_BILL_CEILING + 500);

    assert.ok(note);
    assert.match(note, /NOT charged/);
    assert.match(note, /invoice this one by hand/i);
    // The number, so the shop does not have to work out which rule fired.
    assert.match(note, /ceiling/i);
  });

  test("one the server could not reprice says invoice it by hand", () => {
    const order = signsOrder();
    const designs = order.signsDesigns as Record<string, unknown>[];
    const stripped = {
      ...order,
      signsDesigns: designs.map(({ spec: _spec, ...rest }) => rest),
    };

    const note = noteFor(stripped);

    assert.ok(note);
    assert.match(note, /NOT charged/);
    assert.match(note, /invoice this one by hand/i);
  });
});

describe("the note reaches the shop's actual email", () => {
  test("both the text and the HTML carry it", () => {
    const order = signsOrder();
    const note = noteFor(order, SIGNS_AUTO_BILL_CEILING + 500);

    assert.ok(note);

    const email = buildQuoteEmail({
      quoteNumber: "GS-20260907-NOTE1",
      receivedAt: new Date().toISOString(),
      order,
      artworkAnalysis: null,
      paymentNote: note,
    });

    // Read from the rendered email, not from the input object — the failure
    // worth catching is a note that is computed and then never threaded
    // through to one of the two bodies.
    assert.match(email.text, /NOT charged/);
    assert.match(email.html, /NOT charged/);
  });

  test("and an email without one gains no Payment row", () => {
    const lines = buildCustomerLines({ customer: CUSTOMER, paymentNote: null });

    assert.equal(
      lines.filter((l) => /Payment/.test(l)).length,
      0,
      "an apparel estimate would carry a Payment row that says nothing"
    );
  });
});

describe("a kiosk order keeps its own, more precise line", () => {
  test("exactly one Payment row, and it is the counter one", () => {
    const lines = buildCustomerLines({
      customer: CUSTOMER,
      kiosk: { mode: "staff", staffName: "Sam" },
      // Even when a note is supplied, the kiosk line wins: it says the same
      // fact and adds where to take the money.
      paymentNote: "Charged automatically — the customer gets a payment link.",
    });

    const payment = lines.filter((l) => /Payment/.test(l));

    assert.equal(payment.length, 1, "two Payment rows on one email");
    assert.match(payment[0], /counter/i);
    assert.doesNotMatch(payment[0], /automatically/i);
  });
});

describe("stickers get a line only when they are the exception", () => {
  const stickerOrder = {
    customer: CUSTOMER,
    production: { deliveryMethod: "Pickup" },
    product: { type: "Custom Stickers", quantity: 100 },
  };

  test("an ordinary sticker order stays quiet", () => {
    // They bill on every ordinary order. Saying so each time is noise, and
    // noise is what stops anyone reading the line that matters.
    assert.equal(
      shopPaymentNote({
        order: stickerOrder,
        signs: null,
        stickers: true,
        stickersUnpriceable: false,
      }),
      null
    );
  });

  test("one nothing could be priced from says invoice it by hand", () => {
    const note = shopPaymentNote({
      order: stickerOrder,
      signs: null,
      stickers: true,
      stickersUnpriceable: true,
    });

    assert.ok(note);
    assert.match(note, /NOT charged/);
    assert.match(note, /invoice this one by hand/i);
  });
});

describe("apparel says nothing, because nothing changed for it", () => {
  test("no note on an estimate", () => {
    assert.equal(
      shopPaymentNote({
        order: {
          product: {
            type: "T-Shirts & Apparel",
            garmentType: "T-Shirts",
            supplier: { productName: "Gildan 5000" },
          },
        },
        signs: null,
        stickers: false,
        stickersUnpriceable: false,
      }),
      null
    );
  });
});
