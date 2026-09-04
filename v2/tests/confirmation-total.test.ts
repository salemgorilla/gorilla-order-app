import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getSignsTotals } from "../lib/tax";

/**
 * The number on the confirmation screen is the number the customer agreed to.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The signs confirmation rendered `signsTotal` raw — the PRE-TAX total —
 * while every surface before it is tax-inclusive. Driven in a browser on a
 * 72" x 36" banner:
 *
 *   estimate bar, while building     $188.06   (incl. $11.06 MA sales tax)
 *   review card, at Request Quote    $188.06   with its own tax line
 *   confirmation, one second later   $177.00   no tax mentioned anywhere
 *
 * An $11.06 drop that reads as a discount — until the invoice arrives at
 * $188.06, at which point the confirmation the customer screenshotted reads
 * as the shop marking the price up. Signs are invoiced rather than paid on
 * the spot, so this screen is the LAST number they hold until that invoice.
 *
 * The sticker branch of the SAME component fixed this exact defect, and its
 * comment names the pre-tax figure at this spot "the whole defect". Signs
 * are the sibling that did not get it — this repo's most repeated shape.
 *
 * The component has no test renderer; the behaviour was verified by driving
 * the real flow in Chromium (review $188.06 → confirmation $188.06 after the
 * fix). What is pinned here is the arithmetic and the wiring.
 */

const source = readFileSync(
  new URL("../features/QuoteConfirmation.tsx", import.meta.url),
  "utf8"
);

describe("the arithmetic the screen now performs", () => {
  test("the banner that surfaced it", () => {
    // $162 of banner + $15 setup. Tax is 6.25% of the BANNER: setup is a
    // fee, and all fees are untaxed (Gabe, 2026-09-04). This pin moved from
    // $11.06 / $188.06 in that change, deliberately.
    const totals = getSignsTotals({ total: 177, feeTotal: 15 });

    assert.equal(totals.estimatedTax, 10.13);
    assert.equal(totals.estimatedTotal, 187.13);
  });

  test("a two-design cart taxes the same way", () => {
    // 177 + 303 (a second, bigger banner), $15 of setup in each.
    const totals = getSignsTotals({ total: 480, feeTotal: 30 });

    assert.equal(totals.taxableSubtotal, 450);
    assert.equal(totals.estimatedTotal, 508.13);
  });
});

describe("the wiring", () => {
  test("the signs branch renders the tax-inclusive figure", () => {
    assert.match(source, /signsTotals\.estimatedTotal\.toFixed\(2\)/);
  });

  test("the raw pre-tax total is no longer rendered anywhere", () => {
    // The exact expression that shipped $177.00.
    assert.doesNotMatch(source, /\{signsTotal\.toFixed\(2\)\}/);
  });

  test("it says the tax is included, the way the sticker branch does", () => {
    // Both flows meet the same sentence, so a customer who orders both reads
    // one vocabulary. Gated on estimatedTax > 0 like its sibling, so a
    // zero-tax configuration never claims to include tax it did not add.
    // Two ternaries branch on the same flag (the spec block and the totals
    // block); [1] alone would stop at the second one and miss the totals.
    const signsBlock = source.split("isSignsSubmitted ? (").slice(1).join("");
    assert.match(
      signsBlock,
      /signsTotals\.estimatedTax > 0 && \(\s*\n?\s*<p[^>]*>\s*\n?\s*Includes estimated \{SALES_TAX\.label\}/
    );
  });

  test("hand-quoted signs still show no number at all", () => {
    // A cart with an unpriceable design has no total to make tax-inclusive.
    // "Quoted by hand" must survive this change untouched.
    assert.match(source, /Quoted by hand/);
    // The null guard, not its line breaks: the totals call gained a
    // feeTotal argument (fees are untaxed) and wrapped across lines. What
    // must hold is that a null total never reaches getSignsTotals.
    assert.match(
      source,
      /signsTotal !== null\s*\?\s*getSignsTotals\(/
    );
  });
});
