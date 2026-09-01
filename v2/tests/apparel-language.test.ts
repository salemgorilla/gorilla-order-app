/**
 * The language rules (handoff "give apparel a number", Task 3): no
 * customer-reachable surface says, or implies, that the shop adds money to
 * the cost of a product — and garments are described, never sourced.
 *
 * The quote email is the sharpest case: it is shop-addressed, but it is
 * the surface the shop REPLIES TO CUSTOMERS from, so one forward or one
 * quoted thread exposes whatever it contains. Kurt Sletten's real 25 Aug
 * email carried the supplier's name, the style, the stock code, and a line
 * whose label stated outright that a markup is applied. Gabe's call,
 * 31 Aug: those details live only in the Printavo internal note.
 *
 * These render the REAL builders and read the output — the same way the
 * leak was found — rather than grepping source, so a refactor that moves
 * the strings cannot dodge them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuoteEmail } from "../lib/email";
import { buildPrintavoQuotePlan } from "../lib/printavo";

const apparelOrder = {
  customer: { customerName: "Stacey", email: "stacey@example.com" },
  production: { deliveryMethod: "Pickup", needBy: "2026-10-05", deadlineType: "Flexible" },
  product: {
    type: "T-Shirts & Apparel",
    garmentType: "Starter Tee",
    quantity: 24,
    garmentColor: "White",
    printLocations: ["Front"],
    inkColors: "1 color",
    sizeBreakdown: "",
    specialOrder: false,
    specialOrderNotes: "",
    supplier: {
      source: "S&S Activewear",
      productName: "Starter Tee",
      supplierProductName: "Gildan 2000",
      catalogStyle: "39",
      colorName: "White",
      sampleSize: "M",
      sku: "B00760004",
      markedUpGarmentPrice: 3.49,
    },
  },
  pricing: {
    total: 252.76,
    garmentUnitPrice: 4.1,
    garmentTotal: 98.4,
    printTotal: 144,
    setupTotal: 25,
    quoteRequired: false,
    note: "Estimate uses an assumed size mix.",
  },
};

describe("the quote email never prices the blank", () => {
  const body = buildQuoteEmail({
    quoteNumber: "GS-2001",
    receivedAt: new Date("2026-08-31T12:00:00Z").toISOString(),
    order: apparelOrder as never,
    artworkAnalysis: null,
  }).text;

  it("no markup language, no stock code, no blank price line", () => {
    assert.doesNotMatch(body, /marked.?up/i);
    assert.doesNotMatch(body, /markup/i);
    assert.doesNotMatch(body, /upcharge/i);
    assert.doesNotMatch(body, /wholesale/i);
    assert.doesNotMatch(body, /SKU/);
    assert.doesNotMatch(body, /S&S Style/);
  });

  it("still describes the garment the shop is quoting", () => {
    assert.match(body, /Starter Tee/);
    assert.match(body, /White/);
  });
});

describe("the Printavo internal note carries what the email gave up", () => {
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-2001",
    order: apparelOrder,
    artworkAnalysis: null,
  } as never) as never as { customerNote: string };

  it("style, stock code, sample size and blank cost — shop-only", () => {
    assert.match(plan.customerNote, /S&S style: 39/);
    assert.match(plan.customerNote, /SKU B00760004/);
    assert.match(plan.customerNote, /sample M @ \$3\.49/);
  });
});
