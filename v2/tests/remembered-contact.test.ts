import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyRememberedContact,
  parseRememberedContact,
  serialiseContact,
  shouldOfferRememberedContact,
  toRememberedContact,
} from "../lib/remembered-contact";

/**
 * Remembering a customer on their own device.
 *
 * Two of these rules are safety properties, and both have a specific failure
 * this repo has already reasoned about at length:
 *
 *   CONSENT is re-asked, never remembered. A remembered newsletter tick is a
 *   tick nobody made today, and lib/order.ts's own note says the box only
 *   earns its default by being obvious and one click from off.
 *
 *   THE KIOSK never prefills. lib/kiosk.ts opens by naming the failure: "state
 *   left behind is the PREVIOUS CUSTOMER's name, email and artwork, sitting on
 *   screen for whoever walks up next." A localStorage prefill is that failure
 *   shipped on purpose, and it would survive the remount that throws the rest
 *   of the session away.
 *
 * They live here rather than in the component because a safety property inside
 * a React component is a safety property nothing can check.
 */

const FULL_CUSTOMER = {
  customerName: "Casey Rivera",
  company: "Rivera Coffee",
  email: "casey@example.com",
  phone: "978-555-0142",
  // Everything below this line must NOT survive.
  notes: "Rush if you can, it's for a market on the 3rd",
  heardAbout: ["Instagram"],
  newsletterOptIn: true,
};

describe("only contact fields are ever stored", () => {
  test("the four fields are kept", () => {
    assert.deepEqual(toRememberedContact(FULL_CUSTOMER), {
      customerName: "Casey Rivera",
      company: "Rivera Coffee",
      email: "casey@example.com",
      phone: "978-555-0142",
    });
  });

  test("newsletter consent never survives, in any form", () => {
    /**
     * THE ONE THAT MATTERS. The obvious mistake is handing the whole customer
     * record to the store, and this asserts that doing exactly that still
     * cannot write consent. toRememberedContact builds a new object from four
     * named fields — there is no spread in that file, deliberately.
     */
    const stored = serialiseContact(toRememberedContact(FULL_CUSTOMER)!);

    assert.doesNotMatch(stored, /newsletter/i);
    assert.doesNotMatch(stored, /true/);
  });

  test("notes and attribution do not survive either", () => {
    const stored = serialiseContact(toRememberedContact(FULL_CUSTOMER)!);

    assert.doesNotMatch(stored, /market on the 3rd/);
    assert.doesNotMatch(stored, /Instagram/i);
  });

  test("nothing about the order or its price survives", () => {
    const stored = serialiseContact(
      toRememberedContact({
        ...FULL_CUSTOMER,
        items: [{ quantity: 500, size: '3" x 3"' }],
        pricing: { total: 187.4 },
        artwork: { fileName: "logo.ai", url: "https://blob/logo.ai" },
      })!
    );

    assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), [
      "company",
      "customerName",
      "email",
      "phone",
    ]);
  });

  test("an empty form is not worth remembering", () => {
    // Otherwise the customer is offered "filled in from your last order" over
    // four blank boxes.
    assert.equal(toRememberedContact({}), null);
    assert.equal(toRememberedContact({ phone: "978-555-0142" }), null);
  });

  test("whitespace is not a name", () => {
    assert.equal(toRememberedContact({ customerName: "   ", email: "  " }), null);
  });
});

describe("the kiosk never prefills", () => {
  const contact = toRememberedContact(FULL_CUSTOMER);

  test("a shared terminal is offered nothing, however good the record", () => {
    assert.equal(
      shouldOfferRememberedContact({ isKiosk: true, contact }),
      false
    );
  });

  test("an ordinary browser is", () => {
    assert.equal(
      shouldOfferRememberedContact({ isKiosk: false, contact }),
      true
    );
  });

  test("and nothing remembered means nothing offered", () => {
    assert.equal(
      shouldOfferRememberedContact({ isKiosk: false, contact: null }),
      false
    );
  });
});

describe("a prefill never overwrites what somebody typed", () => {
  const contact = toRememberedContact(FULL_CUSTOMER)!;

  test("empty boxes are filled", () => {
    assert.deepEqual(
      applyRememberedContact(contact, {
        customerName: "",
        company: "",
        email: "",
        phone: "",
      }),
      contact
    );
  });

  test("a half-typed address is left alone", () => {
    // Somebody filling the form in is telling us something more recent than
    // storage is.
    const updates = applyRememberedContact(contact, {
      customerName: "",
      company: "",
      email: "different@example.com",
      phone: "",
    });

    assert.equal(updates.email, undefined);
    assert.equal(updates.customerName, "Casey Rivera");
  });

  test("a fully typed form gets nothing", () => {
    assert.deepEqual(applyRememberedContact(contact, FULL_CUSTOMER), {});
  });

  test("a blank remembered field does not blank a typed one", () => {
    const sparse = toRememberedContact({
      customerName: "Casey",
      email: "casey@example.com",
    })!;

    const updates = applyRememberedContact(sparse, {
      customerName: "",
      company: "Rivera Coffee",
      email: "",
      phone: "",
    });

    assert.equal("company" in updates, false);
  });
});

describe("reading storage back defensively", () => {
  /**
   * A stored record is editable by anyone with the device, and may have been
   * written by an older version of this app. Neither is a reason to throw.
   */
  test("a good record round-trips", () => {
    const contact = toRememberedContact(FULL_CUSTOMER)!;

    assert.deepEqual(parseRememberedContact(serialiseContact(contact)), contact);
  });

  test("junk is simply nothing remembered", () => {
    for (const raw of ["", "not json", "null", "[]", '"a string"', "42"]) {
      assert.equal(parseRememberedContact(raw), null, JSON.stringify(raw));
    }
    assert.equal(parseRememberedContact(null), null);
  });

  test("a record with extra keys is read for the four we know", () => {
    // Including consent, if some future version ever wrote it by mistake:
    // reading is a second place the property has to hold.
    const raw = JSON.stringify({
      customerName: "Casey",
      email: "casey@example.com",
      newsletterOptIn: true,
      notes: "secret",
    });

    assert.deepEqual(parseRememberedContact(raw), {
      customerName: "Casey",
      company: "",
      email: "casey@example.com",
      phone: "",
    });
  });

  test("wrong types are not names", () => {
    const raw = JSON.stringify({ customerName: 42, email: { a: 1 } });

    assert.equal(parseRememberedContact(raw), null);
  });
});
