import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/**
 * What each signs charge is FILED as in Printavo.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Signs derived their Printavo item numbers from the label text, so the SKU
 * moved whenever the wording did:
 *
 *   1 design               GORILLA-FEE-SETUP-FEE-PER-DESIGN
 *   2 designs              GORILLA-FEE-SETUP-2-DESIGNS-15
 *   3 designs              GORILLA-FEE-SETUP-3-DESIGNS-15
 *   pole pockets on 2      GORILLA-FEE-POLE-POCKETS-2-15
 *
 * Every order filed the same charge under a different SKU, so "how much setup
 * did we bill this quarter" or "how often does anyone buy pole pockets" had
 * no answer. Not a money bug — the prices were right — but Printavo's records
 * are the shop's records.
 *
 * The sticker setup fee already did this correctly, in the same function:
 * the description varies ("Setup and artwork prep (3 designs)") and the item
 * number is a fixed GORILLA-DECAL-SETUP. Signs were the odd one out.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * The description carries the story. The item number names the CHARGE and
 * holds still.
 */

function design(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "vinyl-banner",
    quantity: 2,
    customWidthInches: 72,
    customHeightInches: 36,
    material: "13 oz Scrim Vinyl",
    finishing: "Hemmed + Grommets",
    ...overrides,
  });
}

function planFor(designs: SignsDesign[]) {
  const cart = quoteSignsCart(designs);
  const parts = buildSignsPayloadParts(designs, cart);

  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-1099",
    order: {
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Pickup" },
      ...parts,
    },
  } as never) as never as {
    lineItems: Array<{ price: number; quantity: number }>;
    feeLineItems: Array<{ itemNumber: string; description: string; price: number }>;
  };

  return { cart, plan };
}

const copies = (n: number, overrides: Partial<SignsDesign> = {}) =>
  Array.from({ length: n }, () => design(overrides));

describe("setup is one SKU, whatever the design count", () => {
  for (const count of [1, 2, 3, 5]) {
    test(`${count} design${count > 1 ? "s" : ""}`, () => {
      const { plan } = planFor(copies(count));
      const setup = plan.feeLineItems.filter((f) =>
        /SETUP/.test(f.itemNumber)
      );

      assert.equal(setup.length, 1);
      assert.equal(setup[0].itemNumber, "GORILLA-SIGN-SETUP");
      assert.equal(setup[0].price, 15 * count);
    });
  }

  test("the DESCRIPTION is what says how many, not the item number", () => {
    const { plan } = planFor(copies(3));
    const setup = plan.feeLineItems.find((f) => f.itemNumber === "GORILLA-SIGN-SETUP");

    assert.ok(setup);
    assert.match(setup.description, /3 designs/);
    assert.doesNotMatch(setup.itemNumber, /3/);
  });
});

describe("an add-on is the same SKU at any quantity or price", () => {
  const QUANTITIES = [1, 2, 7, 25];

  test("pole pockets file identically however many banners", () => {
    const numbers = new Set(
      QUANTITIES.map((quantity) => {
        const { plan } = planFor([
          design({ quantity, bannerAddOns: ["polePockets"] }),
        ]);

        return plan.feeLineItems.find((f) => /POLEPOCKETS/.test(f.itemNumber))
          ?.itemNumber;
      })
    );

    assert.deepEqual([...numbers], ["GORILLA-SIGN-ADDON-POLEPOCKETS"]);
  });

  test("two different add-ons stay two different SKUs", () => {
    const { plan } = planFor([
      design({ bannerAddOns: ["polePockets", "windSlits"] }),
    ]);

    const numbers = plan.feeLineItems.map((f) => f.itemNumber).sort();

    assert.deepEqual(numbers, [
      "GORILLA-SIGN-ADDON-POLEPOCKETS",
      "GORILLA-SIGN-ADDON-WINDSLITS",
      "GORILLA-SIGN-SETUP",
    ]);
  });

  test("no item number carries a quantity or a rate", () => {
    // The specific shape of the bug: GORILLA-FEE-POLE-POCKETS-2-15 encoded
    // both the count and the price into the SKU.
    for (const quantity of QUANTITIES) {
      const { plan } = planFor([
        design({ quantity, bannerAddOns: ["polePockets", "windSlits"] }),
        design({ quantity }),
      ]);

      for (const fee of plan.feeLineItems) {
        assert.doesNotMatch(
          fee.itemNumber,
          /\d/,
          `${fee.itemNumber} encodes a number, so it moves with the order`
        );
      }
    }
  });
});

describe("an add-on is itemised whether or not the quote has one design", () => {
  /**
   * A cart used to fold finishing add-ons into the per-unit line price, so
   * "Pole Pockets $30" was a visible, adjustable line on a one-design invoice
   * and invisible inside a $177 unit price on a two-design one. Same work,
   * same money, two different invoices — and the shop loses the ability to
   * waive one charge without recomputing a unit price by hand, which is the
   * stated reason fees are separate lines at all.
   */
  test("one design: its own fee line", () => {
    const { plan } = planFor([design({ bannerAddOns: ["polePockets"] })]);
    const pockets = plan.feeLineItems.find((f) =>
      /POLEPOCKETS/.test(f.itemNumber)
    );

    assert.ok(pockets, "pole pockets are not on the invoice");
    assert.equal(pockets.price, 30);
  });

  test("two designs: still its own fee line, and it says which design", () => {
    const { plan } = planFor([
      design({ bannerAddOns: ["polePockets"] }),
      design(),
    ]);

    const pockets = plan.feeLineItems.find((f) =>
      /POLEPOCKETS/.test(f.itemNumber)
    );

    assert.ok(pockets, "pole pockets vanished into the line item");
    assert.equal(pockets.price, 30);
    assert.match(pockets.description, /Design 1/);
  });

  test("the line item carries the product only, so nothing is billed twice", () => {
    const withAddOn = planFor([
      design({ bannerAddOns: ["polePockets"] }),
      design(),
    ]);
    const without = planFor([design(), design()]);

    // Identical banners; the add-on must not have moved the line price.
    assert.deepEqual(
      withAddOn.plan.lineItems.map((li) => li.price),
      without.plan.lineItems.map((li) => li.price)
    );

    // ...and the difference between the two quotes is exactly the add-on.
    assert.equal(
      Math.round((withAddOn.cart.total - without.cart.total) * 100) / 100,
      30
    );
  });

  test("each design's add-ons are named separately, not merged", () => {
    const { plan } = planFor([
      design({ bannerAddOns: ["polePockets", "windSlits"] }),
      design(),
      design({ bannerAddOns: ["windSlits"] }),
    ]);

    const slits = plan.feeLineItems.filter((f) =>
      /WINDSLITS/.test(f.itemNumber)
    );

    // Two designs bought wind slits; merging them into one $24 row would hide
    // which design is getting the work.
    assert.equal(slits.length, 2);
    assert.ok(slits.some((f) => /Design 1/.test(f.description)));
    assert.ok(slits.some((f) => /Design 3/.test(f.description)));
  });

  test("a quoted-by-hand add-on does not become a $0 invoice line", () => {
    // The engine emits those at amount 0 to say "quoted separately". A zero
    // line on an invoice reads as a charge that was waived.
    const { plan } = planFor([
      design({ bannerAddOns: ["polePockets"] }),
      design(),
    ]);

    for (const fee of plan.feeLineItems) {
      assert.ok(fee.price > 0, `${fee.description} is a $0 line`);
    }
  });
});

describe("the SKUs changed and the money did not", () => {
  /**
   * The whole point of this change is that it is invisible on the invoice
   * total. Checked across the matrix rather than on one case, because a
   * charge that moved between a line item and a fee line would still sum
   * correctly on some configurations and not others.
   */
  const CASES: Array<[string, SignsDesign[]]> = [
    ["one design", copies(1)],
    ["two designs", copies(2)],
    ["three designs", copies(3)],
    ["one design with pole pockets", [design({ bannerAddOns: ["polePockets"] })]],
    [
      "one design with two add-ons",
      [design({ bannerAddOns: ["polePockets", "windSlits"] })],
    ],
    [
      "two designs, one with add-ons",
      [design({ bannerAddOns: ["polePockets"] }), design()],
    ],
    ["a big run", copies(2, { quantity: 25 })],
    [
      "two designs, both with add-ons",
      [
        design({ bannerAddOns: ["polePockets"] }),
        design({ bannerAddOns: ["windSlits"] }),
      ],
    ],
    [
      "three designs, add-ons on two of them",
      [
        design({ bannerAddOns: ["polePockets", "windSlits"] }),
        design(),
        design({ bannerAddOns: ["windSlits"] }),
      ],
    ],
    [
      "a cart carrying the no-hem credit, which is negative",
      [
        design({
          material: "18 oz Heavy Duty Vinyl",
          finishing: "No Hem or Grommets",
        }),
        design(),
      ],
    ],
  ];

  for (const [name, designs] of CASES) {
    test(`${name}: Printavo sums to the quote`, () => {
      const { cart, plan } = planFor(designs);

      const printavo =
        plan.lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0) +
        plan.feeLineItems.reduce((sum, fee) => sum + fee.price, 0);

      assert.ok(
        Math.abs(printavo - cart.total) < 0.005,
        `quote $${cart.total.toFixed(2)}, Printavo $${printavo.toFixed(2)}`
      );
    });
  }
});
