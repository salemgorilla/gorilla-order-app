import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeCustomerRecord } from "../lib/customer-record";

/**
 * Telling the counter whether this is a returning customer.
 *
 * ── WHY IT IS WORTH SAYING AT ALL ─────────────────────────────────────────
 * findOrCreateContactId has always worked out whether a submission joined an
 * existing Printavo contact or created a new one, and has always returned it.
 * Nothing ever displayed it.
 *
 * Printavo matching is EMAIL-ONLY. A returning customer who gives a different
 * address becomes a second record, silently, and their history splits in two.
 * The moment of submit is the only moment anybody can fix it — the customer is
 * standing at the counter and can be asked "have you ordered with us before,
 * maybe under another address?"
 */

describe("what the counter is told", () => {
  test("a matched contact is reported, quietly", () => {
    const note = describeCustomerRecord({
      created: true,
      matchedExistingCustomer: true,
    });

    assert.equal(note?.label, "Returning customer");
    // Nothing to do about it, so it must not shout.
    assert.equal(note?.attention, false);
  });

  test("a NEW record is the one that gets attention", () => {
    // The duplicate risk. Cheap to fix today, annoying in six months.
    const note = describeCustomerRecord({
      created: true,
      createdCustomer: true,
    });

    assert.equal(note?.label, "New customer record");
    assert.equal(note?.attention, true);
    assert.match(note?.detail ?? "", /different address/i);
  });

  test("the fallback contact is flagged, not passed off as a new customer", () => {
    /**
     * Neither flag set but the quote was created means it landed on the
     * PRINTAVO_CUSTOMER_ID catch-all. Reporting that as "new customer record"
     * would be a lie that hides an order filed under the wrong contact.
     */
    const note = describeCustomerRecord({ created: true });

    assert.match(note?.label ?? "", /fallback/i);
    assert.equal(note?.attention, true);
  });
});

describe("silence when there is nothing honest to say", () => {
  test("a quote Printavo never accepted reports nothing", () => {
    // Guessing from stale flags would tell the shop "new customer" about an
    // order that never reached Printavo at all.
    assert.equal(describeCustomerRecord({ created: false }), null);
    assert.equal(
      describeCustomerRecord({ created: false, createdCustomer: true }),
      null
    );
  });

  test("a skipped push reports nothing", () => {
    assert.equal(
      describeCustomerRecord({ created: true, skipped: true, createdCustomer: true }),
      null
    );
  });
});

describe("the counter sees it and the website does not", () => {
  const card = readFileSync(
    new URL("../components/kiosk/KioskPickupCard.tsx", import.meta.url),
    "utf8"
  );
  const confirmation = readFileSync(
    new URL("../features/QuoteConfirmation.tsx", import.meta.url),
    "utf8"
  );

  test("it renders inside the kiosk-only card", () => {
    /**
     * Deliberately not on the website. Nobody there could act on it, and
     * telling an anonymous submitter "we already have you" confirms an
     * address is on file to whoever typed it.
     */
    assert.match(card, /describeCustomerRecord/);
    assert.match(confirmation, /kiosk\.enabled && quoteConfirmation\?\.quoteNumber/);
  });

  test("it is under the staff heading, not in the part read aloud", () => {
    const staffIndex = card.indexOf("STAFF: take payment in full now");
    const recordIndex = card.indexOf("record.label");

    assert.ok(staffIndex > 0 && recordIndex > staffIndex, "record note is above the staff heading");
  });
});
