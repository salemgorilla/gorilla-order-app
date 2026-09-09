/**
 * NOTHING A CUSTOMER CAN READ NAMES THE SUPPLIER OR THE COST OF THE BLANK.
 *
 * ── WHY THIS EXISTS ALONGSIDE apparel-language.test.ts ────────────────────
 * That file proved the leak Kurt Sletten's real 25 Aug email carried — the
 * supplier's name, the style, the stock code, and a line whose label stated
 * outright that a markup is applied — is gone from ONE surface, on ONE order
 * shape: the plain-text shop email for a single-garment apparel quote.
 *
 * Since then the surfaces multiplied. The same builder renders an HTML body
 * nobody was checking. The cart shipped, so an order can carry two garments
 * and a per-line list. The special-order door shipped, adding two more rows
 * of free text. And the customer confirmation became a real email with a
 * body of its own.
 *
 * A rule enforced on one rendering of one shape is a rule that holds until
 * somebody adds a shape. This sweeps every customer-reachable rendering of
 * every apparel shape the app can produce, so a new one has to be added
 * here to pass.
 *
 * ── THE SHOP EMAIL COUNTS AS CUSTOMER-REACHABLE ──────────────────────────
 * It is shop-addressed, but it is the surface the shop REPLIES TO CUSTOMERS
 * from. One forward, or one quoted thread, and the customer is reading it.
 * That is exactly how the original leak reached a customer.
 *
 * ── AND THE FIX MUST NOT BE "DELETE THE DATA" ────────────────────────────
 * The shop orders blanks off these figures. A future session that satisfies
 * this file by dropping style, SKU and blank cost from the payload would
 * pass every assertion below and leave the shop unable to buy the shirts.
 * So the last describe() is the opposite assertion: the Printavo internal
 * note — which no customer can ever see — must still carry all three.
 *
 * These render the REAL builders and read their output, the way the leak
 * was found, rather than grepping source: a refactor that moves the strings
 * cannot dodge them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuoteEmail } from "../lib/email";
import { buildOrderConfirmation } from "../lib/order-confirmation";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/**
 * Deliberately unmistakable values. A real style number ("39") and a real
 * blank price ("$3.49") both collide with figures that legitimately appear
 * in an email — a quantity, a per-piece estimate — so a sweep built on them
 * either misses a leak or fails on an innocent total. These cannot occur by
 * accident in a rendered quote.
 */
const STYLE = "ZZ97-STYLE";
const SKU = "B00760004";
const BLANK_COST = 7.7777;

/** The vocabulary, and this fixture's own identifiers. */
const BANNED: RegExp[] = [
  /marked.?up/i,
  /markup/i,
  /upcharge/i,
  /wholesale/i,
  /\bS&S\b/i,
  /\bSKU\b/i,
  /supplierProductName/i,
  /catalogStyle/i,
  new RegExp(STYLE, "i"),
  new RegExp(SKU, "i"),
  /7\.7777|\$7\.78|\$7\.77/,
];

function supplier(overrides: Record<string, unknown> = {}) {
  return {
    source: "S&S Activewear",
    productName: "Premium Soft Tee",
    supplierProductName: "Bella+Canvas 3001",
    catalogStyle: STYLE,
    colorName: "White",
    sampleSize: "M",
    sku: SKU,
    markedUpGarmentPrice: BLANK_COST,
    ...overrides,
  };
}

const customer = {
  customerName: "Stacey",
  email: "stacey@example.com",
  phone: "503-555-0100",
  heardAbout: ["Google"],
};

const production = {
  deliveryMethod: "Pickup",
  needBy: "2026-10-05",
  deadlineType: "Flexible",
};

/** One garment, priced. The shape the original leak was found on. */
const singleGarment = {
  customer,
  production,
  product: {
    type: "T-Shirts & Apparel",
    garmentType: "Premium Soft Tee",
    quantity: 24,
    garmentColor: "White",
    printLocations: ["Front"],
    inkColors: "1 color",
    sizeBreakdown: "M-12, L-12",
    specialOrder: false,
    specialOrderNotes: "",
    supplier: supplier(),
  },
  pricing: {
    total: 461.12,
    garmentUnitPrice: 8.2,
    garmentTotal: 196.8,
    printTotal: 239.32,
    setupTotal: 25,
    quoteRequired: false,
    note: "Estimate uses the sizes you entered.",
  },
};

/** A CART: two garments, so the per-line list renders (#134). */
const cart = {
  ...singleGarment,
  product: {
    ...singleGarment.product,
    quantity: 36,
    garmentLines:
      "24 × Premium Soft Tee / White (M-12, L-12) · 12 × Classic Hoodie / Black (L-12)",
    sizeBreakdown: "",
    supplier: supplier(),
  },
  pricing: { ...singleGarment.pricing, total: 914.52 },
};

/** The "not listed here" door — two more rows of free text (#137). */
const specialOrder = {
  ...singleGarment,
  product: {
    ...singleGarment.product,
    specialOrder: true,
    specialOrderNotes: "Comfort Colors pocket tee, garment dyed, in Blue Jean.",
    supplier: supplier(),
  },
  pricing: { ...singleGarment.pricing, total: 0, quoteRequired: true },
};

const SHAPES: [string, Record<string, unknown>][] = [
  ["one garment", singleGarment],
  ["a two-garment cart", cart],
  ["a special order", specialOrder],
];

function shopEmail(order: Record<string, unknown>) {
  return buildQuoteEmail({
    quoteNumber: "GS-20260909-AB12C",
    receivedAt: new Date("2026-09-09T12:00:00Z").toISOString(),
    order: order as never,
    artworkAnalysis: null,
  });
}

describe("the shop email — the surface the shop replies to customers from", () => {
  for (const [label, order] of SHAPES) {
    for (const part of ["subject", "text", "html"] as const) {
      it(`${label}: the ${part} names no supplier and no blank cost`, () => {
        const body = shopEmail(order)[part];

        for (const pattern of BANNED) {
          assert.doesNotMatch(body, pattern, `${pattern} in the ${part}`);
        }
      });
    }
  }

  it("the HTML body is swept too, not just the plain text", () => {
    // The two are built separately — productLines feeds both, but buildHtml
    // adds markup, labels and a footer of its own. A leak could live in one
    // and not the other, and only the text was ever checked.
    const email = shopEmail(cart);

    assert.ok(email.html.length > 0);
    assert.notEqual(email.html, email.text);
  });

  it("it still describes the garments well enough to price a reply", () => {
    // The rule is "no supplier, no cost" — NOT "say less". An email the shop
    // cannot quote from is a worse failure than the one being prevented.
    const body = shopEmail(cart).text;

    assert.match(body, /Premium Soft Tee/);
    assert.match(body, /Classic Hoodie/);
    assert.match(body, /White/);
    assert.match(body, /M-12, L-12/);
  });

  it("a special order still shouts for a hand quote", () => {
    const email = shopEmail(specialOrder);

    assert.match(email.subject, /NEED TO QUOTE/);
    assert.match(email.text, /SPECIAL ORDER/);
    assert.match(email.text, /Comfort Colors pocket tee/);
  });
});

describe("the customer's own confirmation", () => {
  const confirmation = buildOrderConfirmation({
    quoteNumber: "GS-20260909-AB12C",
    customerEmail: "stacey@example.com",
    customerName: "Stacey",
    paymentEmailSent: false,
    printavoCreated: true,
    kiosk: false,
  });

  it("is sent for an apparel order", () => {
    assert.equal(confirmation.send, true);
  });

  it("carries none of it either", () => {
    if (!confirmation.send) return;

    for (const part of [confirmation.subject, confirmation.text, confirmation.html]) {
      for (const pattern of BANNED) {
        assert.doesNotMatch(part, pattern);
      }
    }
  });
});

describe("the ordering details are not deleted, only moved", () => {
  /**
   * The opposite assertion, and the reason this file cannot be satisfied by
   * dropping the data: the shop BUYS THE BLANKS off these three figures. If
   * they stop reaching the internal Printavo note, the leak is fixed and the
   * shop cannot place the order.
   */
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-20260909-AB12C",
    order: singleGarment,
    artworkAnalysis: null,
  } as never) as never as { customerNote: string };

  it("style, SKU, sample size and blank cost all reach the internal note", () => {
    assert.match(plan.customerNote, new RegExp(`S&S style: ${STYLE}`));
    assert.match(plan.customerNote, new RegExp(`SKU ${SKU}`));
    assert.match(plan.customerNote, /sample M @ \$7\.78/);
  });

  it("the sweep would have caught it — the note trips every rule", () => {
    // A guard that cannot fail is not a guard. The internal note is the
    // positive control: the same patterns run over it must hit.
    const hits = BANNED.filter((pattern) => pattern.test(plan.customerNote));

    assert.ok(hits.length >= 4, `only ${hits.length} of the rules can fire`);
  });
});
