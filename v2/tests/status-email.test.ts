import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildStatusEmail } from "../lib/status-email";

/**
 * Telling a customer their order moved.
 *
 * Nothing in this app has ever done that. /track is pull-only — the customer
 * has to come to the site and type their number — so a walk-in who paid in
 * full at the counter could only learn their order was ready by ringing up.
 *
 * The decision worth testing is not the wording. It is WHICH changes earn an
 * email: a shop that writes on every status change teaches people to ignore
 * it, and the one that matters — come and collect this — then arrives in a
 * thread they have stopped opening.
 */

const READY = "Lab Order Completed - Ready For Local Pickup";

describe("only changes the customer can act on are sent", () => {
  const cases: Array<[string, string, boolean]> = [
    ["ready for pickup", READY, true],
    ["ready to ship", "Lab Order Completed - Ready To Ship", true],
    ["shipped", "Lab Order Completed - Shipped", true],
    ["picked up", "Lab Order Completed - Picked Up", true],
    ["on hold", "Order on Hold (Issue)", true],

    ["just placed", "Lab Order Placed", false],
    ["artwork prep", "Lab Order Pre-Press", false],
    ["printing", "Lab Order Printing", false],
  ];

  for (const [name, status, expected] of cases) {
    test(`${name} ${expected ? "is emailed" : "is not"}`, () => {
      assert.equal(buildStatusEmail({ quoteNumber: "GS-1", printavoStatus: status }).send, expected);
    });
  }

  test("the two that matter most are in the yes column", () => {
    // "Come and collect this" is the entire reason this exists, and "on hold"
    // is the one where the shop is WAITING on the customer.
    assert.equal(buildStatusEmail({ quoteNumber: "GS-1", printavoStatus: READY }).send, true);
    assert.equal(
      buildStatusEmail({ quoteNumber: "GS-1", printavoStatus: "Order on Hold (Issue)" }).send,
      true
    );
  });
});

describe("silence beats a message with nothing in it", () => {
  test("an unrecognised status sends nothing", () => {
    /**
     * toCustomerStatus falls back to a safe "In progress" for the tracker,
     * where the customer ASKED. Pushing that same non-answer into an inbox
     * unprompted is noise with the shop's name on it — and it would fire on
     * every internal status somebody adds in Printavo.
     */
    const decision = buildStatusEmail({
      quoteNumber: "GS-1",
      printavoStatus: "Widget QC step 4b",
    });

    assert.equal(decision.send, false);
    assert.match((decision as { reason: string }).reason, /not recognised/i);
  });

  test("an empty status sends nothing", () => {
    assert.equal(buildStatusEmail({ quoteNumber: "GS-1", printavoStatus: "" }).send, false);
  });

  test("no order number sends nothing", () => {
    assert.equal(buildStatusEmail({ quoteNumber: "", printavoStatus: READY }).send, false);
  });
});

describe("what the customer actually reads", () => {
  const sent = buildStatusEmail({
    quoteNumber: "GS-20260819-AB12C",
    printavoStatus: READY,
    customerName: "Casey",
  });

  function body() {
    assert.equal(sent.send, true);
    return sent as { subject: string; text: string; html: string };
  }

  test("the subject says what happened and which order", () => {
    // Read on a phone lock screen, where the first few words are all there is.
    assert.match(body().subject, /^Ready for pickup in Salem — order GS-20260819-AB12C$/);
  });

  test("it uses the customer-facing wording, not Printavo's", () => {
    // "Lab Order Completed - Ready For Local Pickup" is shop taxonomy. The
    // map in lib/order-status.ts exists precisely so it never reaches anyone.
    assert.doesNotMatch(body().text, /Lab Order/);
    assert.doesNotMatch(body().html, /Lab Order/);
  });

  test("the order number and the tracker link are both there", () => {
    const { text } = body();

    assert.match(text, /GS-20260819-AB12C/);
    assert.match(text, /https:\/\/labs\.gorillasalem\.com\/track\?order=GS-20260819-AB12C/);
  });

  test("the tracker link carries no email, as everywhere else", () => {
    assert.doesNotMatch(body().text, /track\?[^\s]*email/);
  });

  test("it greets by name when we have one, and does not fake it when we do not", () => {
    assert.match(body().text, /^Hi Casey,/);

    const anon = buildStatusEmail({ quoteNumber: "GS-1", printavoStatus: READY });
    assert.match((anon as { text: string }).text, /^Hi,/);
  });

  test("a name with markup in it cannot break the HTML", () => {
    const nasty = buildStatusEmail({
      quoteNumber: "GS-1",
      printavoStatus: READY,
      customerName: '<script>alert(1)</script>',
    });

    assert.doesNotMatch((nasty as { html: string }).html, /<script>/);
  });
});

describe("a customer message never falls back to the shop inbox", () => {
  /**
   * ── THE TRAP, CALLED OUT TWICE IN TWO SPECS ───────────────────────────────
   * sendShopEmail demotes a missing or malformed recipient to QUOTE_TO_EMAIL.
   * That is right for a shop notice and dangerous for a customer's: it lands
   * somebody's order information in a mailbox several people read, while the
   * log says "sent".
   *
   * sendCustomerEmail fails closed instead. Asserted from source because the
   * function talks to a mail provider; what is checkable here is that the
   * fallback is absent and the refusal is explicit.
   */
  const email = readFileSync(new URL("../lib/email.ts", import.meta.url), "utf8");

  const customerSender = email.slice(
    email.indexOf("export async function sendCustomerEmail"),
    email.indexOf("/** Shared by the quote body and the plain notices above. */")
  );

  test("it exists and is its own function, not a flag on the shop sender", () => {
    assert.ok(customerSender.length > 0, "sendCustomerEmail not found");
  });

  test("it never reads QUOTE_TO_EMAIL", () => {
    assert.doesNotMatch(customerSender, /QUOTE_TO_EMAIL/);
  });

  test("it has no hardcoded fallback address", () => {
    assert.doesNotMatch(customerSender, /@gorillasalem\.com/);
  });

  test("a bad address sends nothing and says so", () => {
    assert.match(customerSender, /looksLikeEmailAddress\(to\)/);
    assert.match(customerSender, /CUSTOMER EMAIL NOT SENT/);
    assert.match(customerSender, /No usable customer address/);
  });
});
