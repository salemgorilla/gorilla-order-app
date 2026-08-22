import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { buildQuoteEmail } from "../lib/email";
import { buildSignsPayloadParts } from "../lib/signs-payload";

/**
 * A multi-design signs quote, all the way to Printavo and the shop email.
 *
 * ── THE ONE THAT COSTS MONEY ──────────────────────────────────────────────
 * Every design's price includes its own $15 setup, and the cart ALSO emits a
 * single collapsed "Setup (3 designs × $15)" row. Send both and the shop
 * invoices setup twice. The payload therefore sends each design's SUBTOTAL —
 * product and add-ons, no setup — and the setup row becomes one fee line.
 *
 * The test for that is not "does the code do what I wrote"; it is: do the
 * Printavo line items plus the fee lines add up to the website total, to the
 * cent. That is the number a customer is invoiced against.
 *
 * ── THE ONE THAT COSTS A REPRINT ──────────────────────────────────────────
 * `product` in the payload is a SYNTHESIS — design 1's spec carrying the
 * whole order's sign count — kept because lib/email.ts and lib/printavo.ts
 * duck-type the flow off it. Anything that describes the job off `product`
 * alone states design 1's size and material as fact about a banner and two
 * yard signs, and the shop can act on that. Both consumers must read
 * `signsDesigns` instead.
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

/** A stand-in for a browser File — the mapping only reads `.name`. */
const file = (name: string) => ({ name }) as unknown as File;

const CART: SignsDesign[] = [
  design({ artwork: { file: file("sign-1.pdf") } }),
  design({
    productId: "yard-sign",
    material: "Coroplast",
    finishing: "Signs Only",
    customWidthInches: 0,
    customHeightInches: 0,
    quantity: 10,
    artwork: { file: file("sign-2.pdf") },
  }),
  design({
    productId: "rigid-sign",
    material: 'PVC 1/8"',
    finishing: "Drilled Holes",
    customWidthInches: 25,
    customHeightInches: 37,
    quantity: 2,
    artwork: { file: file("sign-3.pdf") },
  }),
];

/**
 * The payload app/page.tsx actually sends.
 *
 * Built by the REAL mapping, not a copy of it. The first version of this file
 * rebuilt the shape inline, and mutation testing showed what that was worth:
 * changing the payload to send each design's full total — the double-charge —
 * passed every assertion here, because the test was only agreeing with
 * itself. buildSignsPayloadParts exists so this drives the shipped code.
 */
function payloadFor(designs: SignsDesign[]) {
  const pricing = quoteSignsCart(designs);

  return {
    order: {
      customer: {
        customerName: "Dana Whitfield",
        email: "dana@example.com",
        company: "",
        phone: "",
        notes: "",
      },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-10" },
      ...buildSignsPayloadParts(designs, pricing),
      addOns: [],
      addOnsNote: "",
    },
    pricing,
  };
}

describe("the Printavo quote adds up to the website total", () => {
  const { order, pricing } = payloadFor(CART);
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-2001",
    order,
    artworkAnalysis: null,
  });

  test("line items plus fees equal the total the customer was shown", () => {
    const lineItemTotal = plan.lineItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const feeTotal = plan.feeLineItems.reduce((sum, fee) => sum + fee.price, 0);

    assert.equal(
      Math.round((lineItemTotal + feeTotal) * 100) / 100,
      pricing.total
    );
  });

  test("setup is charged once, not once per design", () => {
    // The double-charge this whole shape exists to prevent: $45 of setup is
    // inside the three design totals AND in the collapsed row.
    const setupFees = plan.feeLineItems.filter((fee) =>
      /setup/i.test(fee.description)
    );

    assert.equal(setupFees.length, 1);
    assert.equal(setupFees[0].price, 45);
  });

  test("no design after the first is billed as a fee", () => {
    // The old slicing took pricing.lines[0] as the product and everything
    // after as a fee, which on a cart makes design 2 a surcharge on design 1.
    for (const fee of plan.feeLineItems) {
      assert.doesNotMatch(fee.description, /sqft|18" x 24"/);
    }
  });

  test("one line item per design, each at its own price", () => {
    assert.equal(plan.lineItems.length, CART.length);

    for (const [index, item] of plan.lineItems.entries()) {
      assert.equal(item.quantity, CART[index].quantity);
      assert.equal(
        Math.round(item.price * item.quantity * 100) / 100,
        pricing.designs[index].pricing.subtotal
      );
    }
  });

  test("every line item names which design it is", () => {
    for (const [index, item] of plan.lineItems.entries()) {
      assert.match(item.description, new RegExp(`Design ${index + 1}`));
      assert.equal(item.itemNumber, `GORILLA-SIGN-${index + 1}`);
    }
  });

  test("the line items describe three different signs", () => {
    // The failure this catches is design 1's spec repeated three times, which
    // reads as a real instruction the shop can cut from.
    const descriptions = plan.lineItems.map((item) => item.description);

    assert.equal(new Set(descriptions).size, 3);
    assert.match(descriptions[1], /Yard Sign/);
    assert.match(descriptions[2], /PVC/);
  });
});

describe("a one-design quote is unchanged", () => {
  test("still one line item, and still reconciles", () => {
    const { order, pricing } = payloadFor([design()]);
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-2002",
      order,
      artworkAnalysis: null,
    });

    assert.equal(plan.lineItems.length, 1);
    assert.equal(plan.lineItems[0].itemNumber, "GORILLA-SIGN-VINYL-BANNER");

    const lineItemTotal = plan.lineItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const feeTotal = plan.feeLineItems.reduce((sum, fee) => sum + fee.price, 0);

    assert.equal(
      Math.round((lineItemTotal + feeTotal) * 100) / 100,
      pricing.total
    );
  });
});

describe("the shop email describes every sign", () => {
  const { order } = payloadFor(CART);
  const email = buildQuoteEmail({
    quoteNumber: "GS-2001",
    receivedAt: "22 Aug 2026",
    order,
    artworkAnalysis: null,
  });

  test("names all three, not design 1 three times", () => {
    for (const spec of ["Vinyl Banner", "Yard Sign", "Rigid Sign"]) {
      assert.ok(email.text.includes(spec), `${spec} is missing from the email`);
    }
  });

  test("does not print one size under a combined quantity", () => {
    // "13 signs, 72 x 36" would be a statement the shop could act on and cut
    // the whole run wrong.
    assert.match(email.text, /Designs: 3/);
    assert.match(email.text, /Total Quantity: 13/);
  });

  test("gives each design its own artwork block", () => {
    for (let index = 1; index <= 3; index += 1) {
      assert.ok(
        email.text.includes(`sign-${index}.pdf`),
        `design ${index}'s file is missing`
      );
    }
  });

  test("keeps every label short enough for the nowrap cell", () => {
    // The label column is `white-space: nowrap`, and one long label squeezes
    // the value column for the whole table. Shipped here once already.
    for (const row of email.text.split("\n")) {
      const [label] = row.split(": ");
      if (!label || !row.includes(": ")) continue;
      assert.ok(label.length <= 40, `${label.length} chars: ${label}`);
    }
  });
});
