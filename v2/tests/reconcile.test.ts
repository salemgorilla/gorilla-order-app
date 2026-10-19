/**
 * THE RECONCILIATION HARNESS.
 *
 * AGENTS.md: "Any change touching pricing or checkout ends with one real
 * order reconciled against the Printavo invoice, to the cent. Never with a
 * passing test."
 *
 * That rule was honoured by hand — open the shop email, open Printavo, read
 * across — and it is slow enough that between 4 and 8 September SEVEN
 * changes to billed figures shipped without one. The reconciliation did not
 * stop being important; it stopped being cheap. `npm run reconcile` makes it
 * one command.
 *
 * ── WHAT THESE TESTS CAN AND CANNOT DO ────────────────────────────────────
 * They cannot prove the harness agrees with Printavo — only a real order can
 * do that, which is the whole point of the harness. What they pin is the
 * part that would silently lie:
 *
 *   The website figure is parsed out of a REAL note, built by
 *   buildPrintavoQuotePlan, not an invented string. A note-format change
 *   that broke the parser would otherwise show up as a permanent, quiet
 *   "no total to compare" on every run.
 *
 *   A cent of drift FAILS, and a missing field does NOT. A harness that
 *   cried wolf about its own unproven query would be muted within a week —
 *   which is exactly how the manual reconciliation stopped happening.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  formatReconcileReport,
  quotedShippingFromNote,
  quotedTotalFromNote,
  reconcileQuote,
} from "../lib/reconcile";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/** A real sticker order, in the shape the route posts. */
function stickerOrder(total: number, shipped = false) {
  return {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: {
      deliveryMethod: shipped ? "Ship" : "Pickup",
      needBy: "2026-10-20",
    },
    product: {
      type: "Custom Stickers",
      quantity: 100,
      widthInches: 3,
      heightInches: 3,
      material: "Matte",
      shape: "Die Cut",
    },
    items: [
      {
        id: "d1",
        quantity: 100,
        widthInches: 3,
        heightInches: 3,
        material: "Matte",
        shape: "Die Cut",
        linePrice: total,
      },
    ],
    pricing: {
      total,
      setupPrice: 15,
      unitPrice: 0.54,
      shippingPrice: shipped ? 12 : 0,
    },
  };
}

/** The customer note the app really writes for that order. */
function noteFor(total: number, shipped = false): string {
  return buildPrintavoQuotePlan({
    quoteNumber: "GS-20260908-REC01",
    order: stickerOrder(total, shipped),
    artworkAnalysis: null,
  }).customerNote;
}

describe("the website's own figure is read back out of the note it wrote", () => {
  test("the total is parsed from a REAL note, not an invented one", () => {
    // The failure this catches: someone edits the note format, the parser
    // silently stops matching, and every run afterwards reports "no total
    // to compare" — a harness that has quietly stopped checking anything.
    const note = noteFor(55.6);

    assert.match(note, /WEBSITE ESTIMATE/, "the note format changed");
    assert.equal(quotedTotalFromNote(note), 55.6);
  });

  test("a four-figure total with a comma still parses", () => {
    assert.equal(quotedTotalFromNote("WEBSITE ESTIMATE\nTotal: $1,234.56"), 1234.56);
  });

  test("it reads the ESTIMATE's total, not the first dollar figure in the note", () => {
    // The note carries a per-unit price, a shipping line and sometimes
    // add-on prices. A loose match would compare the wrong number and pass.
    const note = noteFor(55.6, true);

    assert.equal(quotedTotalFromNote(note), 55.6);
    assert.equal(quotedShippingFromNote(note), 12);
  });

  test("free local pickup reads as zero, not as missing", () => {
    assert.equal(quotedShippingFromNote(noteFor(55.6)), 0);
  });

  test("a note without the section yields null, never a guess", () => {
    assert.equal(quotedTotalFromNote("some other note entirely"), null);
    assert.equal(quotedTotalFromNote(""), null);
  });
});

describe("a cent of drift is a failure", () => {
  const note = noteFor(55.6);

  test("matching to the cent passes", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.6,
    });

    const total = result.checks.find((c) => c.name === "Total");
    assert.equal(total?.status, "ok");
    assert.equal(result.ok, true);
  });

  test("one cent over fails, and says which way", () => {
    // The $0.02 drift class the Printavo module documents: a 4dp unit price
    // multiplied out lands above the quote and grows with quantity.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.61,
    });

    const total = result.checks.find((c) => c.name === "Total");
    assert.equal(total?.status, "mismatch");
    assert.match(String(total?.detail), /ABOVE/);
    assert.equal(result.ok, false);
  });

  test("one cent under fails too", () => {
    // Under is not "safe": #108 moved the reference order $57.16 -> $55.60,
    // and an invoice quietly under the quote is a repricing nobody chose.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.59,
    });

    assert.equal(result.ok, false);
    assert.match(
      String(result.checks.find((c) => c.name === "Total")?.detail),
      /BELOW/
    );
  });
});

describe("what a payment link would actually take is checked separately", () => {
  const note = noteFor(55.6);

  test("outstanding matching the quote passes", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.6,
      amountOutstanding: 55.6,
    });

    assert.equal(
      result.checks.find((c) => c.name === "Outstanding")?.status,
      "ok"
    );
  });

  test("a paid order is not a mismatch", () => {
    // Reconciling after payment is normal — and zero outstanding is the
    // correct answer then, not a drift.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.6,
      amountOutstanding: 0,
    });

    assert.equal(result.ok, true);
    assert.match(
      String(result.checks.find((c) => c.name === "Outstanding")?.detail),
      /paid or zeroed/
    );
  });

  test("outstanding drifting from the total is its own failure", () => {
    // createPaymentRequest bills amountOutstanding, so this is the field
    // that decides what a customer is actually charged.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.6,
      amountOutstanding: 60,
    });

    assert.equal(result.ok, false);
    assert.match(
      String(result.checks.find((c) => c.name === "Outstanding")?.detail),
      /createPaymentRequest bills this field/
    );
  });
});

describe("a blind spot is UNKNOWN, never a pass and never a failure", () => {
  test("no line items reported does not fail the run", () => {
    // The read shape has never been proven against the live account. A
    // harness that failed on its own unproven query would be muted within a
    // week — which is how the manual reconciliation stopped happening.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: noteFor(55.6),
      printavoTotal: 55.6,
    });

    assert.equal(result.ok, true, "an unproven query shape failed the run");
    assert.equal(result.incomplete, true, "it also has to SAY it could not look");
    assert.equal(
      result.checks.find((c) => c.name === "Line items add up")?.status,
      "unknown"
    );
  });

  test("an order with no note is unknown, not a mismatch", () => {
    const result = reconcileQuote({ quoteNumber: "GS-1", printavoTotal: 55.6 });

    assert.equal(result.ok, true);
    assert.equal(result.checks.find((c) => c.name === "Total")?.status, "unknown");
  });

  test("but the report says out loud that something was not checked", () => {
    const result = reconcileQuote({ quoteNumber: "GS-1", printavoTotal: 55.6 });
    const report = formatReconcileReport({ quoteNumber: "GS-1" }, result);

    assert.match(report, /could not be checked/i);
    assert.match(report, /\?\?\?\?/, "an unknown must not read like a pass");
  });
});

describe("the line items are checked in the direction that costs money", () => {
  const note = noteFor(55.6);

  test("lines summing above the total is a failure", () => {
    // A line counted that the total does not include — the direction that
    // bills a customer for something nobody quoted.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.6,
      lineItems: [
        { itemNumber: "GORILLA-DECAL", price: 40, quantity: 1 },
        { itemNumber: "GORILLA-SETUP", price: 20, quantity: 1 },
      ],
    });

    assert.equal(result.ok, false);
    assert.match(
      String(result.checks.find((c) => c.name === "Line items add up")?.detail),
      /MORE than the order total/
    );
  });

  test("lines under the total pass — tax and shipping sit on top", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: note,
      printavoTotal: 55.6,
      lineItems: [
        { itemNumber: "GORILLA-DECAL", price: 37.32, quantity: 1 },
        { itemNumber: "GORILLA-SETUP", price: 15, quantity: 1 },
      ],
    });

    assert.equal(
      result.checks.find((c) => c.name === "Line items add up")?.status,
      "ok"
    );
  });

  test("a shipping line that does not match what was quoted fails", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      customerNote: noteFor(67.6, true),
      printavoTotal: 67.6,
      lineItems: [
        { itemNumber: "GORILLA-DECAL", price: 40, quantity: 1 },
        { itemNumber: "GORILLA-SHIPPING", price: 25, quantity: 1 },
      ],
    });

    assert.equal(result.ok, false);
    const shipping = result.checks.find((c) => c.name === "Shipping");
    assert.equal(shipping?.quoted, "$12.00");
    assert.equal(shipping?.billed, "$25.00");
  });
});

describe("the size rows #134 fixed are read back", () => {
  test("garment rows all bucketed under size_other is flagged for a look", () => {
    // Correct when no sizes were entered; the bug when they were. The
    // harness cannot tell which, so it says so rather than guessing.
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      printavoTotal: 300,
      lineItems: [
        {
          itemNumber: "GORILLA-APPAREL-5000",
          price: 10,
          quantity: 24,
          sizes: [{ size: "size_other", count: 24 }],
        },
      ],
    });

    const sizes = result.checks.find((c) => c.name === "Size rows");
    assert.equal(sizes?.status, "unknown");
    assert.match(String(sizes?.detail), /check the shop email/i);
    assert.equal(result.ok, true, "an honest bucket is not a mismatch");
  });

  test("real size rows pass", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      printavoTotal: 300,
      lineItems: [
        {
          itemNumber: "GORILLA-APPAREL-5000",
          price: 10,
          quantity: 24,
          sizes: [
            { size: "size_m", count: 12 },
            { size: "size_l", count: 12 },
          ],
        },
      ],
    });

    assert.equal(result.checks.find((c) => c.name === "Size rows")?.status, "ok");
  });

  test("an order with no garments has nothing to size", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-1",
      printavoTotal: 55.6,
      lineItems: [{ itemNumber: "GORILLA-DECAL", price: 40, quantity: 1 }],
    });

    assert.equal(result.checks.find((c) => c.name === "Size rows")?.status, "ok");
  });
});

describe("the report is readable by someone holding two browser tabs", () => {
  test("it names both figures and the Printavo record", () => {
    const result = reconcileQuote({
      quoteNumber: "GS-20260908-TT40U",
      customerNote: noteFor(60),
      printavoTotal: 62,
    });

    const report = formatReconcileReport(
      { quoteNumber: "GS-20260908-TT40U", visualId: "1234" },
      result
    );

    assert.match(report, /GS-20260908-TT40U/);
    assert.match(report, /Printavo #1234/);
    assert.match(report, /website \$60\.00/);
    assert.match(report, /printavo \$62\.00/);
    assert.match(report, /MISMATCH/);
  });

  test("and it repeats the rule about test quotes", () => {
    // Every run ends with a real order sitting in Printavo. The house rule
    // is never pay one, always void it — said where it is about to matter.
    const report = formatReconcileReport(
      { quoteNumber: "GS-1" },
      reconcileQuote({ quoteNumber: "GS-1", customerNote: noteFor(10), printavoTotal: 10 })
    );

    assert.match(report, /never pay one/i);
    assert.match(report, /void it/i);
  });
});

/**
 * A RUN THAT CHECKED NOTHING MUST NOT READ AS A NEAR-PASS.
 *
 * When the record could not be read at all, every check is UNKNOWN. The
 * verdict line used to say "No mismatches — but something could not be
 * checked", which is true and badly misleading: nothing was compared, and
 * the reconciliation is still owed. The individual checks used to invent
 * causes too — the headline one blamed a missing customer note on a record
 * nobody had read.
 */
describe("a record that could not be read", () => {
  const why =
    "Printavo says GS-20260908-TT40U is an Invoice, and the detail query " +
    "reads quote(id:) only — so no figures came back.";

  const input = {
    quoteNumber: "GS-20260908-TT40U",
    visualId: "1291",
    detailUnavailable: why,
  };

  test("every check defers to the real reason instead of guessing", () => {
    const result = reconcileQuote(input);

    assert.ok(result.checks.length > 0);
    for (const check of result.checks) {
      assert.equal(check.status, "unknown");
      // The old wording blamed the customer note. Nothing may claim that
      // about a record that was never read.
      assert.doesNotMatch(check.detail, /carries no 'WEBSITE ESTIMATE/);
    }

    assert.match(result.checks[0].detail, /Invoice/);
    assert.equal(result.incomplete, true);
  });

  test("the verdict says nothing was checked", () => {
    const report = formatReconcileReport(input, reconcileQuote(input));

    assert.match(report, /NOTHING WAS CHECKED/);
    assert.doesNotMatch(report, /No mismatches/);
    assert.match(report, /still unreconciled/i);
  });

  test("a partial read still reads as a partial read, not a blackout", () => {
    // One check lands, one cannot: the ordinary incomplete case, which must
    // keep its old wording.
    const report = formatReconcileReport(
      { quoteNumber: "GS-1", printavoTotal: 55.6, customerNote: "WEBSITE ESTIMATE\nTotal: $55.60" },
      reconcileQuote({
        quoteNumber: "GS-1",
        printavoTotal: 55.6,
        customerNote: "WEBSITE ESTIMATE\nTotal: $55.60",
      })
    );

    assert.doesNotMatch(report, /NOTHING WAS CHECKED/);
  });
});
