import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";

/**
 * "Estimated Each", and when it means anything.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The signs summary showed an each-price whenever the order held more than
 * one SIGN. On a cart that is an average of unlike things: a quote with a
 * $162 banner and a $288 banner reported
 *
 *     Estimated Each   $240.00
 *
 * which is the price of neither sign in it. Found by removing the middle
 * design from a three-design quote in a browser and reading what was left.
 *
 * The sticker summary already had this right — it keys on
 * `order.items.length === 1`, the DESIGN count. Signs keyed on the sign
 * count, which answers a different question. Same shape as most of the
 * defects in this repo: correct for one flow, wrong for its sibling.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * An each-price is shown for ONE design at a quantity above one, where "each"
 * has a referent. Never across a cart, where the per-design line items are
 * what the customer should be reading.
 */

function design(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "vinyl-banner",
    quantity: 1,
    customWidthInches: 72,
    customHeightInches: 36,
    material: "13 oz Scrim Vinyl",
    finishing: "Hemmed + Grommets",
    ...overrides,
  });
}

describe("the arithmetic is right; the meaning is what was wrong", () => {
  test("a mixed cart's average is a price no sign in it costs", () => {
    // The exact quote that surfaced this, straight from the browser.
    const cart = quoteSignsCart([
      design(),
      design({ customWidthInches: 96, customHeightInches: 48 }),
    ]);

    assert.equal(cart.designs[0].pricing.subtotal, 162);
    assert.equal(cart.designs[1].pricing.subtotal, 288);
    assert.equal(cart.unitPrice, 240);

    // 240 is not what either sign costs, and that is the point.
    assert.notEqual(cart.unitPrice, 162);
    assert.notEqual(cart.unitPrice, 288);
  });

  test("one design at a real quantity still has a meaningful each", () => {
    const cart = quoteSignsCart([design({ quantity: 4 })]);

    assert.equal(cart.designs.length, 1);
    assert.equal(cart.quantity, 4);
    assert.equal(cart.unitPrice, Math.round((cart.total / 4) * 100) / 100);
  });
});

describe("so the views only show it when it has a referent", () => {
  const card = readFileSync(
    new URL("../features/signs/SignsSummaryCard.tsx", import.meta.url),
    "utf8"
  );
  const page = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8"
  );

  test("the summary card gates on the DESIGN count", () => {
    assert.match(
      card,
      /pricing\.designs\.length === 1 && pricing\.quantity > 1/
    );
  });

  test("the copyable order summary gates on it too", () => {
    // Two places render this, and they drifted apart before — the card and
    // the plain-text summary the shop pastes into Printavo.
    assert.match(
      page,
      /signsPricing\.designs\.length === 1 && signsPricing\.quantity > 1/
    );
  });

  test("neither gates on the sign count alone any more", () => {
    // The old condition, which is what produced "$240.00 each".
    assert.doesNotMatch(card, /\{pricing\.quantity > 1 && \(/);
    assert.doesNotMatch(page, /^\s*signsPricing\.quantity > 1$/m);
  });
});

describe("removing a design leaves the rest coherent", () => {
  /**
   * Driven in a browser first — remove the middle of three and the survivors
   * renumber, setup drops by one, and the total falls by exactly that design.
   * These pin the arithmetic that made the browser numbers right.
   */
  test("the survivors renumber from one", () => {
    const [a, , c] = [design(), design({ quantity: 2 }), design({ quantity: 3 })];
    const after = quoteSignsCart([a, c]);

    assert.deepEqual(
      after.designs.map((entry) => entry.label),
      ["Design 1", "Design 2"]
    );
  });

  test("setup follows the count down", () => {
    const three = quoteSignsCart([design(), design(), design()]);
    const two = quoteSignsCart([design(), design()]);

    const setupOf = (cart: ReturnType<typeof quoteSignsCart>) =>
      cart.lines.find((line) => line.kind === "setup")?.amount;

    assert.equal(setupOf(three), 45);
    assert.equal(setupOf(two), 30);
  });

  test("the total falls by exactly the design that left", () => {
    const kept = [design(), design({ customWidthInches: 96, customHeightInches: 48 })];
    const removed = design({ quantity: 2, customWidthInches: 48, customHeightInches: 24 });

    const before = quoteSignsCart([kept[0], removed, kept[1]]);
    const after = quoteSignsCart(kept);

    assert.equal(
      Math.round((before.total - after.total) * 100) / 100,
      quoteSignsCart([removed]).total
    );
  });
});
