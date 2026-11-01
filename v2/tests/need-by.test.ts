/**
 * THE CUSTOMER'S DUE DATE, WHERE THE SHOP ACTUALLY LOOKS.
 *
 * Gabe, 2026-10-29: "I'm still not seeing it in the email I get confirming a
 * quote has been submitted." True, and for a specific reason: the shop email is
 * built twice, as plain text and as HTML, and only the plain-text version had
 * a TIMELINE section. Gmail shows the HTML. The Printavo job list carried the
 * quote number and quantity and never the date.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildQuoteEmail } from "../lib/email";
import { formatNeedBy, needByLabel } from "../lib/need-by";
import { asciiSafe, buildPrintavoQuotePlan, nicknameMatchesQuoteNumber } from "../lib/printavo";

describe("the label", () => {
  test("is a short date, parsed by hand so no timezone can move it a day", () => {
    assert.equal(formatNeedBy("2026-12-02"), "Dec 2");
    assert.equal(formatNeedBy("2026-01-31"), "Jan 31");
    assert.equal(formatNeedBy("2027-03-09"), "Mar 9");
  });

  test("is null for anything that is not a real date", () => {
    for (const bad of ["", undefined, null, "soon", "12/02/2026", "2026-02-31", "2026-02-30", "2026-04-31", "2026-12-00", "2026-13-01", "2026-00-10", "2026-12-2"]) {
      assert.equal(formatNeedBy(bad), null, String(bad));
    }
  });

  test("marks a firm deadline and leaves a flexible one plain", () => {
    assert.equal(needByLabel({ needBy: "2026-12-02", deadlineType: "Flexible" }), "NEED BY Dec 2");
    assert.equal(needByLabel({ needBy: "2026-12-02", deadlineType: "Firm" }), "NEED BY Dec 2 (FIRM)");
    assert.equal(needByLabel({ needBy: "2026-12-02" }), "NEED BY Dec 2");
  });

  test("says nothing when there is no date", () => {
    assert.equal(needByLabel({ needBy: "", deadlineType: "Firm" }), null);
    assert.equal(needByLabel(undefined), null);
  });
});

const order = (production: Record<string, unknown>) => ({
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod: "Pickup", ...production },
  product: { type: "Custom Stickers", quantity: 100, widthInches: 3, heightInches: 3 },
  items: [{ id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte", shape: "Circle" }],
  pricing: { total: 85, stickerPrice: 70, setupPrice: 15 },
});

const email = (production: Record<string, unknown>) =>
  buildQuoteEmail({
    quoteNumber: "GS-20261029-DUE01",
    receivedAt: "2026-10-29T12:00:00Z",
    order: order(production) as Record<string, unknown>,
    artworkAnalysis: null,
  } as never);

describe("the shop email", () => {
  test("carries the date in the subject, last", () => {
    const { subject } = email({ needBy: "2026-12-02", deadlineType: "Flexible" });

    assert.match(subject, /GS-20261029-DUE01/);
    assert.match(subject, / — NEED BY Dec 2$/);
  });

  test("subject says FIRM when it is", () => {
    assert.match(email({ needBy: "2026-12-02", deadlineType: "Firm" }).subject, /NEED BY Dec 2 \(FIRM\)$/);
  });

  test("the HTML body, which is what Gmail shows, has a Timeline section with the date", () => {
    const { html } = email({ needBy: "2026-12-02", deadlineType: "Firm" });

    assert.match(html, /Timeline/);
    assert.match(html, /Needed In Hand/);
    assert.match(html, /2026-12-02/);
    assert.match(html, /Deadline/);
    assert.match(html, /Firm/);
    assert.match(html, /Local pickup in Salem/);
  });

  test("the HTML body leads with the date, above the customer", () => {
    const { html } = email({ needBy: "2026-12-02", deadlineType: "Firm" });

    const due = html.indexOf("NEED BY Dec 2 (FIRM)");
    assert.ok(due > 0, "no callout");
    assert.ok(due < html.indexOf("Customer"), "the callout must come before the customer section");
  });

  test("the plain-text body has the same rows and the callout", () => {
    const { text } = email({ needBy: "2026-12-02", deadlineType: "Flexible" });

    assert.match(text, /^NEED BY Dec 2$/m);
    assert.match(text, /Needed In Hand: 2026-12-02/);
    assert.match(text, /Deadline: Flexible/);
  });

  test("the two bodies cannot disagree about the timeline rows", () => {
    // One definition feeds both: a row added to one and not the other was the
    // bug. The HTML escapes, so compare on a date with nothing to escape.
    const { text, html } = email({ needBy: "2026-12-02", deadlineType: "Flexible", deliveryMethod: "Ship", shipZip: "01970" });

    for (const row of ["Needed In Hand", "Deadline", "Delivery"]) {
      assert.match(text, new RegExp(row));
      assert.match(html, new RegExp(row));
    }

    assert.match(text, /Ship to customer — ZIP 01970/);
    assert.match(html, /Ship to customer/);
  });

  test("without a date it adds no callout and no subject suffix, and still shows the row", () => {
    const { subject, html, text } = email({ needBy: "" });

    assert.doesNotMatch(subject, /NEED BY/);
    assert.doesNotMatch(html, /NEED BY/);
    assert.doesNotMatch(text, /^NEED BY/m);
    assert.match(html, /Needed In Hand/);
    assert.match(html, /Not entered/);
  });

  test("a hand-quote subject keeps NEED TO QUOTE first", () => {
    const e = buildQuoteEmail({
      quoteNumber: "GS-1",
      receivedAt: "2026-10-29T12:00:00Z",
      order: { ...order({ needBy: "2026-12-02" }), pricing: { total: 0, quoteRequired: true } } as Record<string, unknown>,
      artworkAnalysis: null,
    } as never);

    assert.match(e.subject, /^NEED TO QUOTE — GS-1/);
    assert.match(e.subject, /NEED BY Dec 2$/);
  });
});

describe("the Printavo job list", () => {
  const plan = (production: Record<string, unknown>) =>
    buildPrintavoQuotePlan({
      quoteNumber: "GS-20261029-DUE01",
      order: order(production) as Record<string, unknown>,
      artworkAnalysis: null,
    });

  test("the nickname carries the date, after the quote number", () => {
    const nickname = plan({ needBy: "2026-12-02", deadlineType: "Firm" }).nickname;

    assert.match(nickname, /WEB QUOTE GS-20261029-DUE01 - 100 Stickers - NEED BY Dec 2 \(FIRM\)$/);
  });

  test("order tracking still finds the order by its number", () => {
    const stored = asciiSafe(plan({ needBy: "2026-12-02" }).nickname);

    assert.ok(nicknameMatchesQuoteNumber(stored, "GS-20261029-DUE01"));
  });

  test("no date, no suffix: the 14-day fallback is a placeholder, not the customer's date", () => {
    const p = plan({ needBy: "" });

    assert.doesNotMatch(p.nickname, /NEED BY/);
    assert.match(p.customerDueAt, /^\d{4}-\d{2}-\d{2}$/, "Printavo still gets a date, as before");
  });

  test("the due date fields themselves are the customer's date", () => {
    const p = plan({ needBy: "2026-12-02" });

    assert.equal(p.customerDueAt, "2026-12-02");
    assert.equal(p.dueAt, "2026-12-02T17:00:00Z");
    assert.match(p.customerNote, /Needed in hand: 2026-12-02/);
  });
});
