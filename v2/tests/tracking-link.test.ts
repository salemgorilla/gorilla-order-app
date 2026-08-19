import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getTrackUrl, TRACK_URL } from "../lib/order-status";

/**
 * The door to /track.
 *
 * /track was finished, on-brand and verified against live Printavo — and
 * linked from nowhere. The Printavo payment request is the ONLY message a
 * customer receives from this system, so it is the only place a link can
 * reach them.
 *
 * Read from source rather than executed: createStickerCheckout talks to
 * Printavo, so the assertions here are about the string the customer gets and
 * the rules it has to keep.
 */
const printavo = readFileSync(new URL("../lib/printavo.ts", import.meta.url), "utf8");
const track = readFileSync(new URL("../app/track/page.tsx", import.meta.url), "utf8");

describe("the payment email carries the link", () => {
  test("it points at the production tracker", () => {
    // Deliberately not derived from a request header: a preview deployment
    // must still send customers to production, or the link 404s for them once
    // that deployment is superseded.
    assert.equal(TRACK_URL, "labs.gorillasalem.com/track");
    assert.match(getTrackUrl("GS-1"), /^https:\/\/labs\.gorillasalem\.com\/track\?/);
  });

  test("the order number is passed in and URL-encoded", () => {
    /**
     * Executed rather than read from source. These used to grep printavo.ts
     * for `encodeURIComponent`, which broke the moment the URL construction
     * moved into a shared helper — a test that passes only while the code is
     * arranged one particular way. getTrackUrl is a real function now, so
     * assert what it produces.
     */
    assert.match(printavo, /quoteNumber\?: string/);

    assert.equal(
      getTrackUrl("GS-20260819-AB12C"),
      "https://labs.gorillasalem.com/track?order=GS-20260819-AB12C"
    );

    // A quote number should never need escaping — but a URL builder that
    // does not escape is one bad input away from a broken link.
    assert.equal(
      getTrackUrl("GS 1&x=2"),
      "https://labs.gorillasalem.com/track?order=GS%201%26x%3D2"
    );
  });

  test("no order number means a bare tracker link, not ?order=", () => {
    assert.equal(getTrackUrl(), "https://labs.gorillasalem.com/track");
    assert.equal(getTrackUrl("   "), "https://labs.gorillasalem.com/track");
  });

  test("the link never carries the email, and has no parameter for one", () => {
    // The whole security property of /track in one assertion. Requiring the
    // email is what stops a guessed order number returning someone else's
    // status.
    const url = getTrackUrl("GS-20260819-AB12C");

    assert.doesNotMatch(url, /email/i);
    assert.doesNotMatch(url, /@/);
  });

  test("no link is written when there is no quote number", () => {
    // Better a payment email with no tracking sentence than one offering a
    // link to "?order=undefined".
    assert.match(printavo, /input\.quoteNumber\s*\?/);
  });

  test("the customer is told they also need their email", () => {
    // The link cannot carry it, so the email has to say so or the customer
    // arrives at a form they think is broken.
    assert.match(printavo, /you'll need this order/);
    assert.match(printavo, /this email address/);
  });

  test("the payment request still bills Printavo's own figure", () => {
    /**
     * The load-bearing comment. createPaymentRequest is called with no
     * `amount`, so it bills amountOutstanding — the taxed total Printavo
     * computed. Passing a self-derived number here is how the app would start
     * charging a figure it invented.
     */
    assert.match(printavo, /No amount: bills the quote's amountOutstanding/);
    // No /s flag — the tsconfig target predates it. Slice the call instead.
    const call = printavo.slice(
      printavo.indexOf("const request = await createPaymentRequest("),
      printavo.indexOf("if (!request.sent)")
    );
    assert.ok(call.length > 0, "could not locate the createPaymentRequest call");
    // Anchored to a property assignment. A looser test matched the comment
    // that says "No amount: bills the quote's amountOutstanding" — prose, not
    // code, and it failed loudly rather than passing for the wrong reason.
    assert.ok(
      !/^\s*amount:/m.test(call),
      "createStickerCheckout started passing a derived amount"
    );
  });
});

describe("/track prefills the number and never the email", () => {
  test("the order number is seeded from ?order=", () => {
    assert.match(track, /params\.get\("order"\)/);
    assert.match(track, /useState\(prefilledOrder\)/);
  });

  test("it is uppercased and trimmed, matching the API", () => {
    assert.match(track, /\.trim\(\)\.toUpperCase\(\)/);
  });

  test("THE EMAIL STAYS BLANK", () => {
    /**
     * The security property of the whole page. lookupOrderStatus gives the
     * same answer for a wrong number and a wrong email so /track cannot be
     * used to enumerate orders — and the email is the half a stranger cannot
     * guess. Seeding it from the URL would hand that away, and any forwarded
     * or shared link would carry it.
     */
    assert.match(track, /const \[email, setEmail\] = useState\(""\)/);
    assert.ok(
      !/setEmail\(.*params\.get|useState\(.*params\.get\("email/.test(track),
      "the email field is being seeded from the URL"
    );
    assert.ok(
      !/params\.get\("email"\)/.test(track),
      "the page reads an email from the query string"
    );
  });

  test("useSearchParams sits inside a Suspense boundary", () => {
    // Without one the route opts out of static rendering and the build fails.
    assert.match(track, /<Suspense/);
    assert.match(track, /<TrackForm \/>/);
  });
});

describe("the counter customer is told their number", () => {
  /**
   * ── WHY THIS IS THE ONLY PLACE ────────────────────────────────────────────
   * A kiosk order gets no email. The server suppresses the Printavo payment
   * request on purpose (lib/kiosk.ts: a live payment link, emailed to somebody
   * standing in front of you, at an address staff typed by ear).
   *
   * The consequence nobody had joined up is that the payment email is ALSO the
   * only place a customer is ever told their GS- number. So a walk-in who paid
   * in full left with nothing, and /track — which needs the number AND the
   * email — was unusable to exactly those people.
   *
   * The confirmation screen is the one moment they can be told, and the kiosk
   * wipes it 45 seconds after submit.
   */
  const card = readFileSync(
    new URL("../components/kiosk/KioskPickupCard.tsx", import.meta.url),
    "utf8"
  );
  const confirmation = readFileSync(
    new URL("../features/QuoteConfirmation.tsx", import.meta.url),
    "utf8"
  );

  test("the card is shown at the kiosk and nowhere else", () => {
    // A website customer already gets the number and the link in the payment
    // email; rendering this to them would be noise, and it carries a line
    // addressed to staff.
    assert.match(confirmation, /kiosk\.enabled && quoteConfirmation\?\.quoteNumber/);
  });

  test("it reads the kiosk from the shared context, not a second signal", () => {
    assert.match(confirmation, /useKiosk\(\)/);
  });

  test("the QR points at the tracker with the number prefilled", () => {
    assert.match(card, /getTrackUrl\(quoteNumber\)/);
    assert.equal(
      getTrackUrl("GS-20260819-AB12C"),
      "https://labs.gorillasalem.com/track?order=GS-20260819-AB12C"
    );
  });

  test("the number and the URL are printed in full, not only as a QR", () => {
    // A QR nobody can scan is a dead end, and the number has to be copyable
    // by hand onto a paper slip.
    assert.match(card, /\{quoteNumber\}/);
    assert.match(card, /\{trackUrl\}/);
  });

  test("an order with no email says the tracker will not open", () => {
    /**
     * NOT REACHABLE THROUGH THE FORM TODAY — email is a required field, so a
     * submit without one is blocked and this screen never renders. Confirmed
     * by trying it in a browser rather than assumed.
     *
     * Kept, and asserted, for one specific reason: a walk-in paying cash who
     * does not want to hand over an address is an obvious near-future change
     * to make at the counter, and the day somebody makes email optional here
     * this branch is what stops the card rendering an empty span where the
     * address should be. Without it that change looks fine and quietly ships
     * a card that promises tracking nobody can open.
     */
    assert.match(card, /cannot be opened/);
  });

  test("no payment link is rendered — there is never one to render", () => {
    assert.doesNotMatch(card, /payUrl|checkout/);
    assert.match(card, /no payment link was emailed/i);
  });
});
