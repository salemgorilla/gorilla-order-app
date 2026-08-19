import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildOrderConfirmation } from "../lib/order-confirmation";

/**
 * The gap under test: before this existed, the ONLY customer-facing email
 * this app produced was Printavo's payment request, and that is created in a
 * branch requiring stickers + a successful Printavo push + a priceable cart +
 * no kiosk. Signs and apparel customers got nothing at all.
 */

const BASE = {
  quoteNumber: "GS-1042",
  customerEmail: "someone@example.com",
  customerName: "Dana",
  paymentEmailSent: false,
  printavoCreated: true,
  kiosk: false,
};

describe("who gets a confirmation", () => {
  it("a signs or apparel customer does — nothing else would ever write to them", () => {
    const decision = buildOrderConfirmation(BASE);

    assert.equal(decision.send, true);
    if (!decision.send) return;

    assert.match(decision.subject, /GS-1042/);
    assert.match(decision.text, /Quote number: GS-1042/);
  });

  it("a paid sticker order does NOT — Printavo already emailed them", () => {
    const decision = buildOrderConfirmation({ ...BASE, paymentEmailSent: true });

    assert.equal(decision.send, false);
  });

  it("a sticker order whose payment link FAILED does — that was silence before", () => {
    // This is the case that made the gap worse than "signs has no email":
    // Printavo down, or a cart priced at $0, and the customer heard nothing.
    const decision = buildOrderConfirmation({ ...BASE, paymentEmailSent: false });

    assert.equal(decision.send, true);
  });

  it("a counter customer does NOT — they are standing at the till", () => {
    const decision = buildOrderConfirmation({ ...BASE, kiosk: true });

    assert.equal(decision.send, false);
  });

  it("kiosk beats everything, including a missing payment email", () => {
    // Both suppressors could apply; the kiosk reason must not depend on the
    // checkout branch having run.
    const decision = buildOrderConfirmation({
      ...BASE,
      kiosk: true,
      paymentEmailSent: false,
      printavoCreated: false,
    });

    assert.equal(decision.send, false);
  });
});

describe("what it will not send", () => {
  it("nothing without an order number — the number is the entire message", () => {
    assert.equal(buildOrderConfirmation({ ...BASE, quoteNumber: "  " }).send, false);
  });

  it("nothing to an address that is not an address", () => {
    for (const bad of ["", "   ", "dana", "dana@", "@example.com", "a@b"]) {
      assert.equal(
        buildOrderConfirmation({ ...BASE, customerEmail: bad }).send,
        false,
        `expected no send for ${JSON.stringify(bad)}`
      );
    }
  });
});

describe("the tracker link", () => {
  it("is there, with the number prefilled, when Printavo has the order", () => {
    const decision = buildOrderConfirmation(BASE);
    assert.equal(decision.send, true);
    if (!decision.send) return;

    assert.match(decision.text, /labs\.gorillasalem\.com\/track\?order=GS-1042/);
    assert.match(decision.html, /labs\.gorillasalem\.com\/track\?order=GS-1042/);
  });

  it("is withheld when Printavo never took the quote", () => {
    // /track asks Printavo. A link that answers "no such order" is worse than
    // no link — it tells the customer their order does not exist.
    const decision = buildOrderConfirmation({ ...BASE, printavoCreated: false });
    assert.equal(decision.send, true);
    if (!decision.send) return;

    assert.doesNotMatch(decision.text, /\/track/);
    assert.doesNotMatch(decision.html, /\/track/);

    // The number still has to be in it — that is what the shop will ask for.
    assert.match(decision.text, /GS-1042/);
  });

  it("never carries the customer's email — that is the whole lock on /track", () => {
    const decision = buildOrderConfirmation(BASE);
    assert.equal(decision.send, true);
    if (!decision.send) return;

    const links = decision.text.match(/https:\/\/\S+/g) ?? [];
    assert.ok(links.length > 0);

    for (const link of links) {
      assert.doesNotMatch(link, /someone@example\.com/);
      assert.doesNotMatch(link, /email=/);
    }
  });
});

describe("what it promises", () => {
  it("no price and no date — the shop has not set either yet", () => {
    const decision = buildOrderConfirmation(BASE);
    assert.equal(decision.send, true);
    if (!decision.send) return;

    assert.doesNotMatch(decision.text, /\$\d/);
    assert.doesNotMatch(decision.text, /\b(days?|weeks?|business day)\b/i);
  });

  it("greets by name when we have one, and stays civil when we do not", () => {
    const named = buildOrderConfirmation(BASE);
    assert.equal(named.send, true);
    if (named.send) assert.match(named.text, /^Hi Dana,/);

    const anon = buildOrderConfirmation({ ...BASE, customerName: "   " });
    assert.equal(anon.send, true);
    if (anon.send) assert.match(anon.text, /^Hi,/);
  });

  it("escapes a name that contains markup", () => {
    const decision = buildOrderConfirmation({
      ...BASE,
      customerName: '<script>alert("x")</script>',
    });

    assert.equal(decision.send, true);
    if (!decision.send) return;

    assert.doesNotMatch(decision.html, /<script>/);
  });
});
