import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildQuoteEmail } from "../lib/email";
import { createSignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";

/**
 * The shop email's two-column table, and which cell is allowed to break.
 *
 * ── THE DEFECT, THREE TIMES ───────────────────────────────────────────────
 * The LABEL cell carried `white-space: nowrap`. One long label then set the
 * label column's width for the entire table and squeezed the value column to
 * almost nothing, so on a 390px phone every dollar amount broke one character
 * per line:
 *
 *     $
 *     3
 *     2
 *     7.
 *     0
 *     0
 *
 * Measured in Chromium at 360 and 390px, before and after: every money cell
 * in a two-design signs estimate split across lines before, none after.
 *
 * This shipped three separate times — the repricing note (#35), the bumped
 * yard-sign label, and the multi-design estimate — and each time it was
 * "fixed" by shortening a string. Shortening strings treats the symptom, and
 * the next long label brings it straight back. A label-length assertion I
 * wrote myself passed at 40 characters while the render was broken.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * A label wrapping onto two lines is fine. A NUMBER wrapping is never fine —
 * it stops being a number. So the label may break and the value may not, and
 * the columns get explicit widths so the value column is never starved.
 *
 * Not `nowrap` on the value instead: this same table renders email addresses
 * and customer notes, and one unbreakable 40-character address pushed the
 * whole email into horizontal scroll — measured at 686px against a 390px
 * screen.
 */

function twoDesignEmail() {
  const designs = [
    createSignsDesign({
      productId: "vinyl-banner",
      quantity: 1,
      customWidthInches: 72,
      customHeightInches: 36,
      material: "13 oz Scrim Vinyl",
      finishing: "Hemmed + Grommets",
    }),
    createSignsDesign({
      productId: "yard-sign",
      quantity: 10,
      material: "Coroplast",
      finishing: "Signs Only",
      customWidthInches: 0,
      customHeightInches: 0,
    }),
  ];

  const parts = buildSignsPayloadParts(designs, quoteSignsCart(designs));

  return buildQuoteEmail({
    quoteNumber: "GS-1099",
    receivedAt: "22 Aug 2026",
    order: {
      customer: {
        customerName: "Dana Whitfield",
        email: "dana@example.com",
        company: "",
        phone: "",
        notes: "",
        heardAbout: [],
        newsletterOptIn: false,
      },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-15" },
      ...parts,
    } as never,
    artworkAnalysis: null,
  });
}

describe("the number is the thing that must not break", () => {
  const html = twoDesignEmail().html;

  /** Every `<td>` in the document, with its inline style. */
  const cells = [...html.matchAll(/<td style="([^"]*)"[^>]*>/g)].map(
    (m) => m[1]
  );

  test("the email renders cells at all, so the checks below mean something", () => {
    assert.ok(cells.length > 10, `found ${cells.length} cells`);
  });

  test("no label cell pins itself open with nowrap", () => {
    // The label is the FIRST cell of each row: it carries the muted ink and
    // the right-hand padding.
    const labelCells = cells.filter((style) => /padding:3px 12px 3px 0/.test(style));

    assert.ok(labelCells.length > 5, `found ${labelCells.length} label cells`);

    for (const style of labelCells) {
      assert.doesNotMatch(
        style,
        /white-space:\s*nowrap/,
        "a nowrap label starves the value column and breaks dollar amounts"
      );
    }
  });

  test("the columns are given explicit widths", () => {
    // Sharing width by content still left the value column narrower than the
    // number it had to hold — "$327.0" then "0" on the next line.
    assert.match(html, /table-layout:fixed/);
    assert.ok(cells.some((style) => /width:58%/.test(style)));
    assert.ok(cells.some((style) => /width:42%/.test(style)));
  });

  test("the value column can still break a long unbreakable string", () => {
    // Customer notes and email addresses live in this table too.
    const valueCells = cells.filter((style) => /padding:3px 0/.test(style));

    assert.ok(valueCells.length > 5);
    assert.ok(
      valueCells.every((style) => /overflow-wrap:break-word/.test(style)),
      "a long email address would overflow the email without this"
    );
  });
});

describe("the money it has to hold", () => {
  test("a two-design estimate carries the amounts that used to shatter", () => {
    // Not a rendering assertion — a guard that the fixture still exercises
    // the case. If the cart stopped producing these rows, the checks above
    // would be inspecting an empty table and passing.
    const { html, text } = twoDesignEmail();

    for (const amount of ["$327.00", "$162.00", "$135.00", "$30.00"]) {
      assert.ok(html.includes(amount), `${amount} missing from the HTML`);
      assert.ok(text.includes(amount), `${amount} missing from the plain text`);
    }
  });
});
