import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getSignsTotals } from "../lib/tax";

/**
 * The compact card at the top of Review — the screen whose own heading says
 * "Check everything before submitting." Driven in Chromium with a two-design
 * sticker cart (a file on each design), a two-design signs cart, and a
 * special-order apparel quote. What it claimed before:
 *
 *   sticker cart   "Quantity 100"            the run was 200
 *                  "Sticker 3" x 3""         design 2 invisible
 *                  "Artwork: Not uploaded"   BOTH files were attached
 *   signs cart     "Estimate $177.00"        the summary beside it: $188.06
 *                  "Artwork: yard-art.png"   the last file, named for both
 *   apparel S.O.   "Estimate $169.00"        payload says quoteRequired,
 *                                            garments priced at $0.00 inside
 *
 * ── THE ARTWORK ROW, SPECIFICALLY ─────────────────────────────────────────
 * The footer read order.artwork.file. Sticker uploads never write that slot,
 * so EVERY sticker quote reviewed as "Artwork: Not uploaded" — inviting a
 * confused re-upload or a worried submit. Signs overwrite it on each upload,
 * so a cart named the last file as the artwork for every design. The row is
 * apparel-only now; stickers and signs name each design's file in its own
 * block.
 *
 * ── THE SPECIAL ORDER, ACROSS THREE SURFACES ──────────────────────────────
 * The payload says { total: 0, quoteRequired: true }; the shop email files
 * it as SPECIAL ORDER - NEEDS A HAND QUOTE. The review card, the
 * confirmation screen and the copy text all showed the engine's figure
 * anyway — printing and screens over a garment the catalogue could not
 * price. The customer kept a "confirmation" at a number the shop never saw.
 * Signs already said "Quoted by hand" on all three; apparel now does too.
 */

const card = readFileSync(
  new URL("../features/QuoteReviewCard.tsx", import.meta.url),
  "utf8"
);
const confirmation = readFileSync(
  new URL("../features/QuoteConfirmation.tsx", import.meta.url),
  "utf8"
);
const summaryCard = readFileSync(
  new URL("../features/apparel/ApparelSummaryCard.tsx", import.meta.url),
  "utf8"
);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

describe("the sticker cart reviews as a cart", () => {
  test("one block per design, not order.items[0]", () => {
    assert.match(card, /order\.items\.map\(\(item, index\)/);
    assert.doesNotMatch(card, /order\.items\[0\]\.size/);
  });

  test("each design names its own file", () => {
    assert.match(
      card,
      /\["Artwork", item\.artwork\.file\?\.name \|\| "Not uploaded"\]/
    );
  });
});

describe("the signs rows", () => {
  test("each design names its own file, templates their wording", () => {
    assert.match(card, /design\.artwork\.file\?\.name \|\| "Not uploaded"/);
    assert.match(card, /Our template — wording supplied/);
  });

  test("the estimate row is tax-inclusive", () => {
    assert.match(card, /signsTotals\.estimatedTotal\.toFixed\(2\)/);
    // The expression that rendered $177.00 next to a $188.06 summary.
    assert.doesNotMatch(card, /\$\{signsTotal\.toFixed\(2\)\}/);
  });

  test("the arithmetic behind the row the browser showed", () => {
    // The two-design cart driven in Chromium: $223.00, of which $30 is the
    // two setup fees. 6.25% on the $193 of signs. Was $236.94 while fees
    // were taxed; $235.06 since they are not (Gabe, 2026-09-04).
    const totals = getSignsTotals({ total: 223, feeTotal: 30 });

    assert.equal(totals.taxableSubtotal, 193);
    assert.equal(totals.estimatedTotal, 235.06);
  });
});

describe("the shared footer artwork row is apparel's alone", () => {
  test("gated on the flow whose slot it reads", () => {
    assert.match(
      card,
      /isApparelSelected && \(\s*\n?\s*<div className="mb-3 flex justify-between gap-4">\s*\n?\s*<span>Artwork<\/span>/
    );
  });

  test("exactly one read of the order-level slot remains", () => {
    const reads = card.match(/order\.artwork\.file/g) ?? [];
    assert.equal(reads.length, 1);
  });
});

describe("a special order is quoted by hand on every customer surface", () => {
  test("the review card", () => {
    assert.match(
      card,
      /apparelQuote\.specialOrder\s*\n?\s*\? "Quoted by hand"/
    );
  });

  test("the review card's big summary panel", () => {
    assert.match(summaryCard, /apparelQuote\.specialOrder \? \(/);
    assert.match(summaryCard, /Priced by hand/);
  });

  test("the confirmation screen", () => {
    assert.match(
      confirmation,
      /apparelQuote\.specialOrder \? \([\s\S]{0,900}Quoted by hand/
    );
  });

  test("the copy text", () => {
    assert.match(
      page,
      /apparelQuote\.specialOrder\s*\n?\s*\?[\s\S]{0,200}Special order — priced by hand by Gorilla Salem/
    );
  });

  test("a PRICED apparel quote still shows its figure on all of them", () => {
    // The gate must not swallow the ordinary case.
    assert.match(card, /`\$\$\{apparelPricing\.total\.toFixed\(2\)\}`/);
    assert.match(confirmation, /apparelPricing\.total\.toFixed\(2\)/);
    assert.match(page, /Estimated Apparel Total: \$\$\{apparelPricing\.total\.toFixed\(2\)\}/);
  });
});
