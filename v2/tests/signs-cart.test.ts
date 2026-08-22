import { test as it, describe } from "node:test";
import assert from "node:assert/strict";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { priceSignsDesign, quoteSignsCart } from "../lib/signs-cart";
import { signsPricingConfig } from "../lib/signs-pricing-config";

/**
 * A signs quote with more than one design in it.
 *
 * ── THE MODEL ─────────────────────────────────────────────────────────────
 * Setup is $15 per design and calculateSignsPricing already prices one design
 * including its own setup, so a cart is the SUM of its designs. There is no
 * cart-level arithmetic, which is the point: nothing here can drift from the
 * engine, because nothing here recomputes anything the engine computes.
 *
 * The sticker cart is deliberately not like this — its setup tapers ($25 then
 * $12.50), so it cannot be summed design by design. The two are different
 * because the shop prices them differently, and a test says so below.
 *
 * ── WHAT MUST NOT MOVE ────────────────────────────────────────────────────
 * Every signs quote the shop has ever taken has exactly one design. A
 * one-design cart must therefore be byte-identical to what a single sign
 * produced before carts existed — same total, same lines, same wording.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

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

const YARD = {
  productId: "yard-sign",
  material: "Coroplast",
  finishing: "Signs Only",
  customWidthInches: 0,
  customHeightInches: 0,
};

describe("one design is exactly what it always was", () => {
  it("matches the engine, line for line", () => {
    const only = design();
    const cart = quoteSignsCart([only]);
    const alone = priceSignsDesign(only);

    assert.equal(cart.total, alone.total);
    assert.equal(cart.subtotal, alone.subtotal);
    assert.deepEqual(cart.lines, alone.lines);
  });

  it("keeps the 3' x 6' banner at the price on the sheet", () => {
    // tests/signs-price-sheet.test.ts row: banner | 1 | 72x36 | 13 oz | single
    assert.equal(quoteSignsCart([design()]).total, 177);
  });

  it("does not prefix or rename anything", () => {
    const lines = quoteSignsCart([design()]).lines;

    assert.equal(lines.at(-1)?.label, "Setup fee (per design)");
    for (const line of lines) {
      assert.doesNotMatch(line.label, /^\d+ · /);
    }
  });
});

describe("several designs are summed", () => {
  it("adds up to the designs priced separately", () => {
    const a = design();
    const b = design({ ...YARD, quantity: 10 });
    const c = design({ productId: "poster", material: "Indoor Poster Paper", finishing: "Standard", customWidthInches: 24, customHeightInches: 18, quantity: 3 });

    const cart = quoteSignsCart([a, b, c]);
    const separately =
      priceSignsDesign(a).total +
      priceSignsDesign(b).total +
      priceSignsDesign(c).total;

    assert.equal(cart.total, Math.round(separately * 100) / 100);
    assert.equal(cart.designs.length, 3);
  });

  it("charges setup once per design, in one row", () => {
    const cart = quoteSignsCart([design(), design(), design()]);
    const setup = cart.lines.filter((line) => line.kind === "setup");

    assert.equal(setup.length, 1, "three setup rows would read as a mistake");
    assert.equal(setup[0].amount, signsPricingConfig.setupFee * 3);
    assert.equal(setup[0].label, "Setup (3 designs × $15)");
  });

  it("prices three of the same design as three times one", () => {
    // Each design carries its own setup, so identical designs multiply
    // cleanly. This is the property that makes the sum the whole model.
    const one = quoteSignsCart([design()]).total;
    const three = quoteSignsCart([design(), design(), design()]).total;

    assert.equal(three, round2(one * 3));
  });

  it("charges $15 more for splitting a run across two designs", () => {
    // What a customer actually pays to have two different layouts instead of
    // one: exactly one extra setup. The vinyl is the same either way.
    const asOne = quoteSignsCart([design({ quantity: 2 })]).total;
    const asTwo = quoteSignsCart([design(), design()]).total;

    assert.equal(round2(asTwo - asOne), signsPricingConfig.setupFee);
  });

  it("counts SIGNS, not designs, for the quantity", () => {
    const cart = quoteSignsCart([
      design({ quantity: 2 }),
      design({ ...YARD, quantity: 10 }),
    ]);

    assert.equal(cart.designs.length, 2);
    assert.equal(cart.quantity, 12);
    assert.equal(cart.unitPrice, Math.round((cart.total / 12) * 100) / 100);
  });

  it("numbers each design's lines by position", () => {
    const cart = quoteSignsCart([design(), design({ ...YARD, quantity: 6 })]);
    const product = cart.lines.filter((line) => line.kind !== "setup");

    assert.ok(product.some((line) => line.label.startsWith("1 · ")));
    assert.ok(product.some((line) => line.label.startsWith("2 · ")));
  });

  it("keeps every label short, for readability rather than for safety", () => {
    /**
     * This ceiling used to be described as what stops long labels breaking
     * the shop email's dollar amounts. It is not, and saying so was worse
     * than saying nothing: this assertion PASSED at 40 characters while a
     * two-design estimate rendered "$327.00" one character per line on a
     * phone.
     *
     * The email's own table is what protects the numbers now — the label cell
     * no longer carries `white-space: nowrap`, so it wraps instead of
     * starving the value column. See tests/email-money-wrapping.test.ts,
     * which measures the thing itself.
     *
     * Short labels are still worth having; they are just not a safety
     * mechanism.
     */
    const cart = quoteSignsCart([
      design({ ...YARD, quantity: 29 }),
      design({ customWidthInches: 96, customHeightInches: 48 }),
      design({ productId: "rigid-sign", material: 'AlumaCorr 0.4"', finishing: "Drilled Holes", customWidthInches: 25, customHeightInches: 37 }),
    ]);

    for (const line of cart.lines) {
      assert.ok(
        line.label.length <= 40,
        `${line.label.length} chars: ${line.label}`
      );
    }
  });
});

describe("a design nobody can price stops the whole quote", () => {
  it("refuses the cart, not just that design", () => {
    // Quoting two of three designs shows a total the customer reads as THE
    // price, and the shop has to walk it back.
    const cart = quoteSignsCart([
      design(),
      design({ productId: "window-graphics" }),
    ]);

    assert.equal(cart.priceable, false);
    assert.equal(cart.total, 0);
    assert.deepEqual(cart.lines, []);
  });

  it("says which design it was, once there is more than one", () => {
    const cart = quoteSignsCart([
      design(),
      design({ productId: "window-graphics" }),
    ]);

    assert.match(cart.reason || "", /Design 2/);
    assert.match(cart.reason || "", /Window & Wall Graphics/);
  });

  it("keeps the plain reason when there is only one design", () => {
    const cart = quoteSignsCart([design({ productId: "window-graphics" })]);

    assert.doesNotMatch(cart.reason || "", /Design 1/);
  });

  it("still reports the sign count, so the form can say what was asked for", () => {
    const cart = quoteSignsCart([design({ quantity: 4, productId: "window-graphics" })]);

    assert.equal(cart.quantity, 4);
  });
});

describe("the two carts are different on purpose", () => {
  it("signs setup does not taper, stickers' does", () => {
    /**
     * Written down because "make them consistent" is the obvious refactor and
     * it would be a repricing. Signs: $15 for every design. Stickers: $25 for
     * the first and $12.50 after, which is why the sticker cart cannot be
     * summed one design at a time and this one can.
     */
    const one = quoteSignsCart([design()]);
    const two = quoteSignsCart([design(), design()]);
    const three = quoteSignsCart([design(), design(), design()]);

    const setupOf = (cart: ReturnType<typeof quoteSignsCart>) =>
      cart.lines.filter((l) => l.kind === "setup").reduce((s, l) => s + l.amount, 0);

    assert.equal(setupOf(one), 15);
    assert.equal(setupOf(two), 30);
    assert.equal(setupOf(three), 45);
  });
});

describe("designs carry their own identity", () => {
  it("gives every design a distinct id", () => {
    const ids = [design(), design(), design()].map((d) => d.id);

    assert.equal(new Set(ids).size, 3);
  });

  it("does not share the mutable fields between designs", () => {
    // A shared array or object literal is how "add a design" ends up editing
    // the one before it.
    const a = design();
    const b = design();

    a.bannerAddOns.push("polePockets");
    a.templateText.headline = "OPEN HOUSE";

    assert.deepEqual(b.bannerAddOns, []);
    assert.deepEqual(b.templateText, {});
    assert.notEqual(a.artwork, b.artwork);
  });

  it("reports each design's own price back", () => {
    const cart = quoteSignsCart([design(), design({ ...YARD, quantity: 10 })]);

    assert.equal(cart.designs[0].productLabel, "Vinyl Banner");
    assert.equal(cart.designs[1].productLabel, "Yard Sign");
    assert.equal(
      cart.designs[0].pricing.total + cart.designs[1].pricing.total,
      cart.total
    );
  });
});
