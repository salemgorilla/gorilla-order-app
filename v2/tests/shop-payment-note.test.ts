/**
 * CAN THE SHOP TELL, FROM ITS OWN EMAIL, WHETHER A CUSTOMER WAS CHARGED?
 *
 * ── THE GAP ───────────────────────────────────────────────────────────────
 * The shop email is built and sent BEFORE Printavo is called and before any
 * payment link is raised. While stickers were the only self-billing flow that
 * was survivable: they bill on every ordinary order, so "sticker order" and
 * "will be paid" meant the same thing and the email did not have to say it.
 *
 * Signs ended that on 7 Sep. A banner order over the ceiling raises no link,
 * and its email looked exactly like the $200 one that did — so the shop
 * would be waiting on a payment nobody had been asked for, on a job it had
 * already started. This file holds the line that closes it.
 *
 * The note is generated from the SAME decision the route bills from, so the
 * email and the payment link cannot disagree about what happened.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  FULL_PAYMENT_CEILING,
  decideSignsAutoBill,
  decideStickersAutoBill,
  shopPaymentNote,
} from "../lib/auto-bill";
import { repriceStickers } from "../lib/sticker-repricing";
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
    stickers: null,
  });
}

describe("a signs order says which bucket it is in", () => {
  test("one that bills says so", () => {
    const note = noteFor(signsOrder());

    assert.ok(note);
    assert.match(note, /charged automatically/i);
  });

  test("one over the ceiling says a deposit was taken, and what is left", () => {
    // The rule changed on 7 Sep: over the ceiling is no longer a refusal, so
    // this line stopped saying "NOT charged" and started telling the shop
    // there is a balance to collect.
    const note = noteFor(signsOrder(), FULL_PAYMENT_CEILING + 500);

    assert.ok(note);
    assert.doesNotMatch(note, /NOT charged/);
    assert.match(note, /deposit requested/i);
    assert.match(note, /collect the balance/i);
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
    const note = noteFor(order, FULL_PAYMENT_CEILING + 500);

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
    assert.match(email.text, /deposit requested/i);
    assert.match(email.html, /deposit requested/i);
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
  /** A sticker cart in the shape the browser posts, priced by the server. */
  function stickerOrder(item: Record<string, unknown>) {
    return {
      customer: CUSTOMER,
      production: { deliveryMethod: "Pickup" },
      product: { type: "Custom Stickers", ...item },
      items: [{ id: "d1", ...item }],
      pricing: { total: 0 },
    };
  }

  /** The route's own composition for stickers: reprice, decide, note. */
  function stickerNoteFor(
    order: Record<string, unknown>,
    overrides: Partial<Parameters<typeof decideStickersAutoBill>[0]> = {}
  ) {
    const priced = repriceStickers(order);

    return shopPaymentNote({
      order: priced.order,
      signs: null,
      stickers: decideStickersAutoBill({
        order: priced.order,
        unpriceable: priced.unpriceable,
        serverTotal: priced.serverTotal,
        kioskSession: false,
        printavoCreated: true,
        ...overrides,
      }),
    });
  }

  const ordinary = stickerOrder({
    quantity: 100,
    widthInches: 3,
    heightInches: 3,
    material: "Matte",
    shape: "Die Cut",
  });

  test("an ordinary sticker order stays quiet", () => {
    // They bill on every ordinary order. Saying so each time is noise, and
    // noise is what stops anyone reading the line that matters.
    assert.equal(stickerNoteFor(ordinary), null);
  });

  test("one nothing could be priced from says invoice it by hand", () => {
    // No dimensions and no size label: material prices at $0, so the total
    // is the setup fee alone — the case that once raised a $25 link for a
    // thousand stickers.
    const note = stickerNoteFor(stickerOrder({ quantity: 1000 }));

    assert.ok(note);
    assert.match(note, /NOT charged/);
    assert.match(note, /no usable size/i);
    assert.match(note, /invoice this one by hand/i);
  });

  test("one over the ceiling says so, in the same words as a sign", () => {
    // A deposit IS an exception, so it earns a line: before the ceiling, the
    // shop email on a five-figure sticker cart looked exactly like the $60
    // one, and both had been charged in full. Now the big one takes half and
    // the email tells the shop there is a balance to collect.
    const note = stickerNoteFor(ordinary, {
      serverTotal: FULL_PAYMENT_CEILING + 500,
    });

    assert.ok(note);
    assert.doesNotMatch(note, /NOT charged/);
    assert.match(note, /deposit requested/i);
    assert.match(note, /ceiling/i);
    assert.match(note, /collect the balance/i);

    // Word for word the sign's line, from the shared decision — the shop
    // reads one sentence for one rule, whatever it ordered.
    const signs = decideSignsAutoBill({
      order: { product: { type: "Vinyl Banners", signType: "Vinyl Banner" } },
      repriced: true,
      unpriceable: false,
      serverTotal: FULL_PAYMENT_CEILING + 500,
      kioskSession: false,
      printavoCreated: true,
    });

    assert.equal(
      note,
      shopPaymentNote({
        order: { product: { type: "Vinyl Banners", signType: "Vinyl Banner" } },
        signs,
        stickers: null,
      })
    );
  });

  test("the note is never written for a non-sticker order", () => {
    // Handing a sticker decision in for an apparel payload must not print
    // a sticker line on an estimate. Same guard as the signs branch.
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
        stickers: { bill: false, deposit: false, reason: "not a sticker order" },
      }),
      null
    );
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
        stickers: null,
      }),
      null
    );
  });
});
