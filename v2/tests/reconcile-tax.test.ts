/**
 * THE MERGE GATE WAS CRYING WOLF ON EVERY TAXABLE ORDER.
 *
 * ── WHAT WAS COMPARED ─────────────────────────────────────────────────────
 * `Total:` in the Printavo customer note is PRE-TAX — it is `pricing.total`,
 * and tax is Printavo's to compute. `printavoTotal` and `amountOutstanding`
 * both INCLUDE it. So reconcileQuote compared a pre-tax figure against a
 * tax-inclusive one and reported a MISMATCH of exactly the sales tax on
 * every sticker and signs order.
 *
 * The same file already knew better: its line-sum check explicitly allows
 * the line sum to sit under the total "because tax and shipping are added
 * on top of them". The headline check contradicted it.
 *
 * ── WHY IT MATTERS MORE THAN A WRONG LABEL ────────────────────────────────
 * AGENTS.md makes a green reconciliation the merge gate for any PR that
 * changes a billed figure. So either the gate blocked healthy orders, or
 * the operator learned to ignore a red Total — and an ignored gate is the
 * state in which a real mismatch ships. One did: on 2026-09-25 a forged
 * product.quantity was billing $45 for $2,057 of stickers.
 *
 * ── AND THE NOTE WAS RECORDING A FIGURE NOBODY AGREED TO ──────────────────
 * The customer never saw $99.00. Every customer-facing surface renders
 * `estimatedTotal` from lib/tax.ts — the reference pack reads $104.25 on
 * screen. The note now carries that too, from the same helper, never a
 * second formula.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { readNoteTotal, reconcileQuote } from "../lib/reconcile";

/** The reference pack: 100 x 3in die cut. $84 vinyl + $15 setup = $99 pre-tax. */
const REFERENCE = {
  customer: { customerName: "X", email: "x@y.com" },
  production: { deliveryMethod: "Pickup" },
  product: {
    type: "Custom Stickers", quantity: 100, widthInches: 3, heightInches: 3,
    size: '3" x 3"', shape: "Die Cut", material: "Gloss White Vinyl", finish: "Gloss",
  },
  items: [],
  pricing: { total: 99, stickerPrice: 84, setupPrice: 15, shippingPrice: 0 },
};

/** MA charges 6.25% on the decals only — setup and shipping are untaxed. */
const PRINTAVO_TOTAL = 104.25;

function note(order: unknown = REFERENCE): string {
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-T", order, artworkAnalysis: null,
  } as never) as never as { customerNote: string };
  return plan.customerNote;
}

function check(customerNote: string, name: string) {
  const result = reconcileQuote({
    quoteNumber: "GS-T",
    printavoTotal: PRINTAVO_TOTAL,
    amountOutstanding: PRINTAVO_TOTAL,
    customerNote,
  } as never) as never as { checks: { name: string; status: string; detail: string }[] };

  const found = result.checks.find((c) => c.name === name);
  assert.ok(found, `no ${name} check`);
  return found;
}

describe("the note records what the customer was actually shown", () => {
  test("it carries the tax-inclusive total", () => {
    const section = note().split("WEBSITE ESTIMATE")[1];

    assert.match(section, /Total: \$99\.00/, "the pre-tax figure is still there");
    assert.match(section, /Total incl\. tax: \$104\.25/);
    assert.match(section, /Tax \(6\.25% on \$84\.00\): \$5\.25/);
  });

  test("the tax base is the decals, not the whole total", () => {
    // Setup and shipping are sent to Printavo taxed:false, so taxing them
    // here would put the estimate and the invoice on different bases.
    const section = note().split("WEBSITE ESTIMATE")[1];

    assert.match(section, /on \$84\.00/);
    assert.doesNotMatch(section, /on \$99\.00/);
  });

  test("an exempt flow prints no tax line at all", () => {
    // Apparel is exempt. A "$0.00" tax row would read as a charge of zero
    // rather than a flow that is not taxed.
    const apparel = {
      ...REFERENCE,
      product: { ...REFERENCE.product, type: "Custom Apparel", supplier: "S&S", garmentType: "Tee" },
    };
    const section = note(apparel).split("WEBSITE ESTIMATE")[1];

    assert.doesNotMatch(section, /Total incl\. tax/);
    assert.doesNotMatch(section, /Tax \(/);
  });
});

describe("a healthy order reconciles GREEN", () => {
  test("Total matches to the cent", () => {
    const total = check(note(), "Total");

    assert.equal(total.status, "ok", "a correct order still reports a mismatch");
    assert.match(total.detail, /matches the website quote to the cent/);
  });

  test("Outstanding matches too", () => {
    assert.equal(check(note(), "Outstanding").status, "ok");
  });

  test("a REAL mismatch is still caught", () => {
    // The check has to keep working. Printavo $10 above the quote.
    const result = reconcileQuote({
      quoteNumber: "GS-T",
      printavoTotal: 114.25,
      amountOutstanding: 114.25,
      customerNote: note(),
    } as never) as never as { checks: { name: string; status: string; detail: string }[] };

    const total = result.checks.find((c) => c.name === "Total");
    assert.equal(total?.status, "mismatch");
    assert.match(String(total?.detail), /ABOVE/);
  });
});

describe("orders quoted before this change are not abandoned", () => {
  /** A note as written before the tax lines existed. */
  const legacy = note()
    .replace(/Tax \(.*\n/, "")
    .replace(/Total incl\. tax:.*\n/, "");

  test("a pre-tax note is UNKNOWN, not a mismatch", () => {
    const total = check(legacy, "Total");

    assert.equal(total.status, "unknown", "the false alarm is back");
    assert.match(total.detail, /PRE-TAX/);
    // The arithmetic, so a human can finish the check in one look.
    assert.match(total.detail, /\$5\.25/);
  });

  test("it still reads the pre-tax figure rather than giving up", () => {
    assert.deepEqual(readNoteTotal(legacy), { value: 99, taxInclusive: false });
  });

  test("a pre-tax note that happens to match exactly is still OK", () => {
    // An untaxed order — pickup on an exempt flow — has no tax to explain,
    // so the old note and Printavo agree and the check must say so.
    const result = reconcileQuote({
      quoteNumber: "GS-T", printavoTotal: 99, amountOutstanding: 99,
      customerNote: legacy,
    } as never) as never as { checks: { name: string; status: string }[] };

    assert.equal(result.checks.find((c) => c.name === "Total")?.status, "ok");
  });
});

describe("the two Total lines cannot be confused", () => {
  test("'Total incl. tax' wins over 'Total' on a note carrying both", () => {
    assert.deepEqual(readNoteTotal(note()), { value: 104.25, taxInclusive: true });
  });
});
