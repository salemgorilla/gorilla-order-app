import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canOfferTracker, getTrackUrl } from "../lib/order-status";
import { buildOrderConfirmation } from "../lib/order-confirmation";

/**
 * /track queries PRINTAVO. It reads nothing this app stores, because this app
 * stores nothing.
 *
 * createPrintavoQuote is best-effort by design — it returns { created: false }
 * rather than failing the submission, so a customer never loses an order to an
 * outage. The result is a real state that is easy to forget: a genuine GS-
 * number, a genuine order the shop will honour from its email, and nothing for
 * /track to match.
 *
 * Three surfaces offer the tracker — the confirmation email, the confirmation
 * screen, and the kiosk pickup card. They disagreed: the kiosk drew its QR
 * unconditionally, so a counter customer whose quote had not reached Printavo
 * would scan it, seconds after paying, and be told no such order exists.
 */

describe("canOfferTracker", () => {
  it("offers it when Printavo holds the order", () => {
    assert.equal(
      canOfferTracker({ quoteNumber: "GS-1042", printavoCreated: true }),
      true
    );
  });

  it("withholds it when Printavo never took the quote", () => {
    assert.equal(
      canOfferTracker({ quoteNumber: "GS-1042", printavoCreated: false }),
      false
    );
  });

  it("withholds it with no number, however healthy Printavo is", () => {
    for (const quoteNumber of [undefined, "", "   "]) {
      assert.equal(
        canOfferTracker({ quoteNumber, printavoCreated: true }),
        false,
        `expected no tracker for ${JSON.stringify(quoteNumber)}`
      );
    }
  });
});

describe("every surface asks the same question", () => {
  // The email is the one surface whose output can be asserted directly here.
  // The screen and the kiosk card call canOfferTracker with the same two
  // inputs, which is the point of it existing.
  function emailFor(printavoCreated: boolean) {
    const decision = buildOrderConfirmation({
      quoteNumber: "GS-1042",
      customerEmail: "dana@example.com",
      customerName: "Dana",
      paymentEmailSent: false,
      printavoCreated,
      kiosk: false,
    });

    assert.equal(decision.send, true);
    return decision.send ? decision : null;
  }

  it("the email carries the link exactly when canOfferTracker says so", () => {
    for (const printavoCreated of [true, false]) {
      const message = emailFor(printavoCreated);
      assert.ok(message);

      const expected = canOfferTracker({
        quoteNumber: "GS-1042",
        printavoCreated,
      });

      assert.equal(
        message.text.includes("/track"),
        expected,
        `text disagreed at printavoCreated=${printavoCreated}`
      );
      assert.equal(
        message.html.includes("/track"),
        expected,
        `html disagreed at printavoCreated=${printavoCreated}`
      );
    }
  });

  it("still gives the customer their number when the tracker is withheld", () => {
    // Withholding the link must not withhold the order. The number is real
    // and the shop will honour it.
    const message = emailFor(false);
    assert.ok(message);

    assert.match(message.text, /GS-1042/);
  });
});

describe("the link itself", () => {
  it("prefills the number and never carries the email", () => {
    const url = getTrackUrl("GS-1042");

    assert.match(url, /\?order=GS-1042$/);
    assert.doesNotMatch(url, /email/i);
  });

  it("falls back to the bare tracker with no number", () => {
    assert.equal(getTrackUrl(), "https://labs.gorillasalem.com/track");
    assert.equal(getTrackUrl("  "), "https://labs.gorillasalem.com/track");
  });
});
