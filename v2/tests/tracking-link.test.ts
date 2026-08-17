import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
    assert.match(printavo, /const TRACK_URL = "labs\.gorillasalem\.com\/track"/);
  });

  test("the order number is passed in and URL-encoded", () => {
    assert.match(printavo, /quoteNumber\?: string/);
    assert.match(printavo, /order=\$\{encodeURIComponent\(/);
  });

  test("no link is written when there is no quote number", () => {
    // Better a payment email with no tracking sentence than one offering a
    // link to "?order=undefined".
    assert.match(printavo, /input\.quoteNumber\s*\?/);
  });

  test("the customer is told they also need their email", () => {
    // The link cannot carry it, so the email has to say so or the customer
    // arrives at a form they think is broken.
    assert.match(printavo, /you'll need this order number/);
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
