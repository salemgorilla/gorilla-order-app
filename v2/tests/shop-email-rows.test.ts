import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuoteEmail } from "../lib/email";

/**
 * Rows in the shop email that were saying the same thing twice, or nothing at
 * all. Both found by rendering the email for every flow and reading it, which
 * is the only way either would have surfaced — each renders without error and
 * each passes every other test in the suite.
 */

function emailFor(order: Record<string, unknown>) {
  return buildQuoteEmail({
    quoteNumber: "GS-1042",
    receivedAt: new Date("2026-08-20T12:00:00Z").toISOString(),
    order: order as never,
    artworkAnalysis: null,
  }).text;
}

function rows(body: string, label: string) {
  return body.split("\n").filter((l) => l.startsWith(`${label}: `));
}

function signsOrder(deliveryMethod: string) {
  return {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: { deliveryMethod, needBy: "2026-09-05", deadlineType: "Firm" },
    product: {
      type: "Banners & Signs",
      signType: "18oz",
      quantity: 3,
      size: '48" x 24"',
      material: "18 oz Vinyl",
      finishing: "Hemmed + grommets",
    },
    pricing: { total: 268.5, unitPrice: 89.5 },
  };
}

describe("the signs estimate does not repeat the timeline", () => {
  it("says Delivery exactly once on a pickup quote", () => {
    // ESTIMATE carried a "Delivery" row and TIMELINE carries one too. On
    // pickup they were the identical sentence, twice, in one email.
    const body = emailFor(signsOrder("Pickup"));

    assert.deepEqual(rows(body, "Delivery"), [
      "Delivery: Local pickup in Salem",
    ]);
  });

  it("says Delivery exactly once on a ship quote too", () => {
    const body = emailFor(signsOrder("Ship"));

    assert.equal(rows(body, "Delivery").length, 1);
  });

  it("names the exclusion instead, and only when there is one", () => {
    // The estimate's job is to say what the total leaves out.
    // calculateSignsPricing never adds shipping, so on a Ship quote it is
    // genuinely excluded; on pickup nothing is.
    assert.deepEqual(rows(emailFor(signsOrder("Ship")), "Shipping"), [
      "Shipping: Quoted separately",
    ]);

    assert.deepEqual(rows(emailFor(signsOrder("Pickup")), "Shipping"), []);
  });

  it("still shows the priced total either way", () => {
    for (const method of ["Ship", "Pickup"]) {
      assert.match(emailFor(signsOrder(method)), /Estimated Total: \$268\.50/);
    }
  });
});

describe("no row renders blank", () => {
  it("gives Ink Colors the fallback its neighbours already had", () => {
    // Color says "Not selected" and Size Breakdown says "Not entered"; this
    // row alone rendered as a label with an empty value, which this file's
    // own comments call out as reading like a rendering fault.
    const body = emailFor({
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-10" },
      product: {
        type: "Apparel",
        garmentType: "T-Shirt",
        supplier: { productName: "Gildan 5000" },
        quantity: 24,
        printLocations: ["Front"],
      },
      pricing: { total: 0 },
    });

    // "Not specified" since the request-flow truth fix: the empty comes
    // from a form that never asked the question, and the wording now says
    // to look at the notes rather than implying an unmade selection.
    assert.match(body, /Ink Colors: Not specified/);
  });

  it("leaves a populated value alone", () => {
    // Real payloads carry it — defaultApparelQuote sets "1 color" — so the
    // fallback must not overwrite anything.
    const body = emailFor({
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-10" },
      product: {
        type: "Apparel",
        garmentType: "T-Shirt",
        supplier: { productName: "Gildan 5000" },
        quantity: 24,
        printLocations: ["Front"],
        inkColors: "2 colors",
      },
      pricing: { total: 0 },
    });

    assert.match(body, /Ink Colors: 2 colors/);
  });
});
