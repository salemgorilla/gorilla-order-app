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

describe("their own copy of what they agreed to", () => {
  /**
   * Gabe, 2026-09-09: "Have the email say they have joined our newsletter
   * and also add that we assure you we will not sell your info or spam you
   * with marketing messages."
   *
   * Until this, the only party told about a sign-up was the shop. The
   * customer ticked a box that arrived ALREADY TICKED and got no written
   * record of what they had agreed to — the wrong way round, since the
   * consent record exists to protect them and they were the one person who
   * could not see it.
   */
  function textFor(newsletterOptIn: boolean | undefined) {
    const decision = buildOrderConfirmation({ ...BASE, newsletterOptIn });
    return decision.send ? decision.text : "";
  }

  it("says they joined, in the shop's own words", () => {
    assert.match(textFor(true), /joined our newsletter/i);
    assert.match(textFor(true), /shop news, seasonal offers and new products/i);
  });

  it("and gives the assurance unprompted", () => {
    const text = textFor(true);

    // The point of the pair. This shop asks for an email, a phone number
    // and a company on every quote; a customer who ticked a pre-ticked box
    // has no idea what happens to any of it. Saying it in writing, at the
    // moment they hand it over, is the difference between a promise and an
    // assumption.
    assert.match(text, /will not sell your information/i);
    assert.match(text, /won't spam you with marketing messages/i);
    assert.match(text, /unsubscribe from any email/i);
  });

  it("says nothing to a customer who unticked the box", () => {
    // Telling someone who opted OUT what our newsletter is like reads as
    // not having been listened to, which is the one thing an opt-out has to
    // get right.
    const text = textFor(false);

    assert.doesNotMatch(text, /newsletter/i);
    assert.doesNotMatch(text, /unsubscribe/i);
  });

  it("and nothing when the caller did not say", () => {
    // Every call site written before this existed. A missing answer must
    // not become a claim that somebody signed up for something.
    assert.equal(textFor(undefined), textFor(false));
  });

  it("the order comes first — the newsletter rides after the quote number", () => {
    const text = textFor(true);

    assert.ok(
      text.indexOf("Quote number:") < text.indexOf("joined our newsletter"),
      "the newsletter outranks the thing they actually came for"
    );
    assert.ok(
      text.indexOf("joined our newsletter") < text.indexOf("Thanks,\nGorilla Salem"),
      "it falls below the sign-off, where nobody reads it"
    );
  });

  it("both renderings carry it", () => {
    const decision = buildOrderConfirmation({ ...BASE, newsletterOptIn: true });
    if (!decision.send) throw new Error("not sent");

    assert.match(decision.html, /joined our newsletter/i);
    assert.match(decision.html, /will not sell your information/i);
    // Escaped like every other line in this email — the apostrophes in
    // "You've" and "won't" go through escapeEmailHtml, not raw.
    assert.doesNotMatch(decision.html, /<script/i);
  });

  it("it does not turn a skipped email into a sent one", () => {
    // The send conditions are unchanged: this rides ALONG with a
    // confirmation, it is never a reason to write to somebody. A customer
    // whose payment request Printavo already emailed still gets one message
    // about one order, not two.
    const decision = buildOrderConfirmation({
      ...BASE,
      paymentEmailSent: true,
      newsletterOptIn: true,
    });

    assert.equal(decision.send, false);
  });
});

describe("the way out, in the email that says they are in", () => {
  /**
   * "You can unsubscribe from any email" is a sentence that has to be true
   * of the email it appears in. This is the first — and until campaigns
   * exist, the only — message that mentions the newsletter, so the link
   * belongs here rather than being promised for later.
   */
  const LINK = "https://labs.gorillasalem.com/unsubscribe?e=a%40b.com&t=abc123";

  it("the link is given, not merely promised", () => {
    const decision = buildOrderConfirmation({
      ...BASE,
      newsletterOptIn: true,
      unsubscribeUrl: LINK,
    });
    if (!decision.send) throw new Error("not sent");

    assert.ok(decision.text.includes(LINK));

    // In the HTML the "&" is escaped to "&amp;", which is correct in an
    // href and is parsed back by every mail client. Asserting the raw
    // string here would be asserting a bug.
    assert.ok(decision.html.includes(LINK.replace(/&/g, "&amp;")));
    assert.match(decision.html, /<a[^>]*>Unsubscribe<\/a>/);
  });

  it("no link when the deployment cannot mint one", () => {
    // No NEWSLETTER_SECRET means no token, so any link would 404 — and a
    // dead unsubscribe link is worse than none, it is the fastest route to
    // a spam complaint there is.
    const decision = buildOrderConfirmation({
      ...BASE,
      newsletterOptIn: true,
      unsubscribeUrl: null,
    });
    if (!decision.send) throw new Error("not sent");

    assert.match(decision.text, /joined our newsletter/);
    assert.doesNotMatch(decision.text, /unsubscribe\?/i);
    assert.doesNotMatch(decision.html, /<a[^>]*>Unsubscribe<\/a>/);
  });

  it("and none at all for somebody who did not opt in", () => {
    const decision = buildOrderConfirmation({
      ...BASE,
      newsletterOptIn: false,
      unsubscribeUrl: LINK,
    });
    if (!decision.send) throw new Error("not sent");

    assert.ok(!decision.text.includes(LINK));
  });
});
