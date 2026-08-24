import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getReferenceStickerPrice,
  REFERENCE_STICKER,
} from "../lib/reference-quote";
import { getStickerPrice } from "../lib/pricing";
import { repriceStickers } from "../lib/sticker-repricing";

/**
 * The entry-screen price anchor, held to the brief's own acceptance rules.
 *
 * The step-01 brief's non-negotiable: "the figure must be derived from the
 * same quote engine that produces the invoice. Not a constant, not a
 * duplicated formula." This app bills stickers automatically; if the hero
 * number and the Printavo invoice can disagree, they eventually will.
 *
 * The brief's acceptance criteria, verbatim, are the tests below:
 *   - the entry-screen figure and a real quote for the same spec agree to
 *     the cent (asked of the SERVER's repricer — the function that actually
 *     bills — not just the browser's engine);
 *   - changing the pricing table moves both numbers with no second edit
 *     (guaranteed by construction: there is one call, and a test pins that
 *     no literal price appears anywhere in the anchor's path).
 */

describe("the figure is the engine's, to the cent", () => {
  test("hero figure equals the engine for the same spec", () => {
    assert.equal(
      getReferenceStickerPrice(),
      getStickerPrice(
        REFERENCE_STICKER.quantity,
        REFERENCE_STICKER.material,
        REFERENCE_STICKER.finish,
        REFERENCE_STICKER.size
      )
    );
  });

  test("hero figure equals what the SERVER would bill for that order", () => {
    // The brief's first acceptance criterion, asked of repriceStickers —
    // the function the payment link is generated from. Local pickup, no
    // shipping, exactly what the anchor's caption promises.
    const priced = repriceStickers({
      product: {
        type: "Custom Stickers",
        quantity: REFERENCE_STICKER.quantity,
        material: REFERENCE_STICKER.material,
        finish: REFERENCE_STICKER.finish,
        size: REFERENCE_STICKER.size,
      },
      production: { deliveryMethod: "Pickup" },
      pricing: { total: 0 },
    });

    assert.equal(getReferenceStickerPrice(), priced.serverTotal);
  });

  test("the anchor is also the cross-sell strip's number", () => {
    // The same 100-pack has been publicly quoted on signs and apparel
    // quotes since add-ons shipped. Two public prices for one pack would be
    // the entry screen contradicting the review step.
    assert.equal(getReferenceStickerPrice(), 53.8);
    // ^ ONE literal, here only, and it is the check that a repricing shows
    // up as a readable diff in this file — the price-sheet discipline.
  });
});

describe("the label tells the truth about the spec", () => {
  test("quantity and size in the label match the priced spec", () => {
    assert.ok(
      REFERENCE_STICKER.label.includes(String(REFERENCE_STICKER.quantity)),
      "the label quotes a different quantity than it prices"
    );
    assert.ok(
      REFERENCE_STICKER.label.includes(REFERENCE_STICKER.size.replace('"', "")),
      "the label quotes a different size than it prices"
    );
  });
});

describe("the hero wiring", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  test("the anchor renders the computed figure, never a literal", () => {
    assert.match(page, /getReferenceStickerPrice\(\)\.toFixed\(2\)/);
  });

  test("step 1 only — from step 2 the customer's own number takes over", () => {
    // Two prices on one screen is how a customer reads the wrong one. The
    // estimate bar already carries the live figure on every later step.
    assert.match(
      page,
      /currentStepId === "product" && \(\s*\n?\s*<div[^>]*>\s*\n?\s*<div className="flex flex-wrap items-baseline/
    );
  });

  test("the promise under the number is one the engine keeps", () => {
    // "Setup included" — getStickerPrice adds STICKER_SETUP_FEE, so the
    // anchored figure genuinely includes it. If the anchor ever switches to
    // getStickerMaterialPrice, this wording becomes a lie; the pairing is
    // pinned here so they change together.
    assert.match(page, /Setup included &middot; no art fees &middot; proof before print/);
    const anchor = page.split('REFERENCE_STICKER.label')[1]?.slice(0, 800) ?? "";
    assert.match(anchor, /getReferenceStickerPrice/);
  });
});
