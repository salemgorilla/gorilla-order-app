import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeRepricing } from "../lib/repricing-note";
import { buildQuoteEmail } from "../lib/email";

/**
 * repriceStickers already refuses to trust the browser's total — it recomputes
 * and charges its own figure. What it did with the DISAGREEMENT was write one
 * console.error, in an app whose own comments observe that a console.error in
 * a function log is a thing nobody watches.
 *
 * The shop reads the quote email for every order. Now the disagreement is in
 * it.
 */

describe("when there is nothing to say", () => {
  it("says nothing on the ordinary order where the two agreed", () => {
    // The important case. A line on every order is a line nobody reads by the
    // second week, and then it is not there for the one that matters.
    assert.equal(
      describeRepricing({ mismatch: false, clientTotal: 110.3, serverTotal: 110.3 }),
      null
    );
  });

  it("defers to the caller's mismatch flag inside its tolerance", () => {
    // The two thresholds are not the same number: repriceStickers calls it a
    // mismatch above a cent, and the guard below only swallows differences
    // under half a cent. A 0.007 gap therefore falls between them, and the
    // caller's flag is what decides — which is the only case that tells the
    // two guards apart.
    assert.equal(
      describeRepricing({ mismatch: false, clientTotal: 110.3, serverTotal: 110.307 }),
      null
    );
  });

  it("says nothing when flagged as a mismatch but the figures match", () => {
    // Defensive: a caller passing mismatch:true with equal totals has nothing
    // to report, and reporting it anyway trains the reader to skip the line.
    assert.equal(
      describeRepricing({ mismatch: true, clientTotal: 110.3, serverTotal: 110.3 }),
      null
    );

    assert.equal(
      describeRepricing({ mismatch: true, clientTotal: 110.3, serverTotal: 110.304 }),
      null
    );
  });
});

describe("the direction is the point", () => {
  it("marks a submission that asked to pay LESS than the job is worth", () => {
    // The direction that costs money, and the one an attacker produces.
    const note = describeRepricing({
      mismatch: true,
      clientTotal: 2,
      serverTotal: 110.3,
    });

    assert.ok(note);
    assert.equal(note.underpriced, true);
    assert.match(note.detail, /LOWER/);
    assert.match(note.detail, /\$2\.00/);
    assert.match(note.detail, /\$110\.30/);
  });

  it("marks a submission that showed the customer MORE than they will pay", () => {
    // Awkward, not expensive — and the customer is the one who will raise it.
    const note = describeRepricing({
      mismatch: true,
      clientTotal: 999,
      serverTotal: 110.3,
    });

    assert.ok(note);
    assert.equal(note.underpriced, false);
    assert.match(note.detail, /higher/);
    assert.match(note.detail, /\$999\.00/);
  });

  it("always names the figure Printavo was actually given", () => {
    // Whichever direction, the shop's next question is "so what are we
    // charging" — and the answer is the server's number, both times.
    for (const [clientTotal, serverTotal] of [
      [2, 110.3],
      [999, 110.3],
    ]) {
      const note = describeRepricing({ mismatch: true, clientTotal, serverTotal });

      assert.ok(note);
      assert.match(note.detail, /Printavo has/);
      assert.match(note.detail, /\$110\.30/);
    }
  });

  it("rounds to cents rather than printing float dust", () => {
    const note = describeRepricing({
      mismatch: true,
      clientTotal: 77.24000000000001,
      serverTotal: 110.3,
    });

    assert.ok(note);
    assert.match(note.detail, /\$77\.24/);
    assert.doesNotMatch(note.detail, /77\.240000/);
  });
});

describe("the label stays short enough for a phone", () => {
  /**
   * The shop email renders each row as a two-column table whose LABEL cell is
   * `white-space: nowrap`, so the longest label in a section sets that
   * column's width for every row in it. The first version of this label was
   * "PRICE CHECK — submitted LOW", which on a 390px screen left the value
   * about sixty pixels to wrap in: the warning came out roughly one syllable
   * per line and was taller than the rest of the email.
   *
   * The plain-text version read perfectly the whole time. Only rendering the
   * HTML in a browser showed it.
   */
  it("is never the widest label in the estimate block", () => {
    const note = describeRepricing({
      mismatch: true,
      clientTotal: 2,
      serverTotal: 110.3,
    });

    assert.ok(note);

    // "Estimated Total" already sets the column width for this section, so
    // anything at or under it costs the value column nothing.
    assert.ok(
      note.label.length <= "Estimated Total".length,
      `"${note.label}" is wider than "Estimated Total" and would squeeze the value column`
    );
  });

  it("says the same thing in both directions, so the column cannot jump", () => {
    const low = describeRepricing({ mismatch: true, clientTotal: 2, serverTotal: 110.3 });
    const high = describeRepricing({ mismatch: true, clientTotal: 999, serverTotal: 110.3 });

    assert.ok(low);
    assert.ok(high);
    assert.equal(low.label, high.label);
  });
});

describe("it reaches the shop email", () => {
  function emailFor(repricing: ReturnType<typeof describeRepricing>) {
    return buildQuoteEmail({
      quoteNumber: "GS-1042",
      receivedAt: new Date("2026-08-20T12:00:00Z").toISOString(),
      order: {
        customer: { customerName: "Dana", email: "dana@example.com" },
        production: { deliveryMethod: "Pickup" },
        product: {
          type: "Custom Stickers",
          quantity: 350,
          widthInches: 3,
          heightInches: 3,
          material: "Matte",
        },
        items: [],
        pricing: { total: 110.3, stickerPrice: 60.8, setupPrice: 37.5 },
      },
      artworkAnalysis: null,
      repricing,
    });
  }

  it("puts the warning in the body when there was one", () => {
    const note = describeRepricing({
      mismatch: true,
      clientTotal: 2,
      serverTotal: 110.3,
    });

    const email = emailFor(note);

    assert.match(email.text, /Price check/);
    assert.match(email.text, /\$2\.00/);
  });

  it("leaves the body untouched when the prices agreed", () => {
    const email = emailFor(null);

    assert.doesNotMatch(email.text, /Price check/);
  });

  it("still shows the total the shop will invoice, either way", () => {
    for (const note of [
      null,
      describeRepricing({ mismatch: true, clientTotal: 2, serverTotal: 110.3 }),
    ]) {
      assert.match(emailFor(note).text, /110\.30/);
    }
  });
});
