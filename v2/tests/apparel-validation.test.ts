import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { getApparelFieldErrors } from "../lib/validation";
import { FIELD_STEP, getFirstStepWithError } from "../lib/steps";

/**
 * What an apparel order has to answer, and what a special order is excused.
 *
 * Apparel has the most conditional structure of the three flows — a special
 * order skips half the rules and returns early — which made it the one least
 * safe to leave as an untestable closure inside app/page.tsx.
 *
 * The rule worth guarding hardest is the one that looks like an omission:
 * a special order does NOT require artwork. That is deliberate, load-bearing
 * and easy for a future reader to "fix".
 */

function apparel(overrides: Record<string, unknown> = {}) {
  return {
    specialOrder: false,
    specialOrderNotes: "",
    quantity: 24,
    printLocations: ["Front"],
    ...overrides,
  } as Parameters<typeof getApparelFieldErrors>[0];
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    customer: { customerName: "Casey", email: "casey@example.com" },
    artwork: { file: { name: "art.png" } },
    production: { needBy: "2026-09-01" },
    ...overrides,
  } as Parameters<typeof getApparelFieldErrors>[1];
}

function errorsFor(
  apparelOverrides: Record<string, unknown> = {},
  orderOverrides: Record<string, unknown> = {},
  sizeQuantityTotal = 24
) {
  return getApparelFieldErrors(
    apparel(apparelOverrides),
    order(orderOverrides),
    sizeQuantityTotal,
    // Pinned "today": this file tests the apparel rules themselves, so the
    // 14-business-day turnaround floor (lib/turnaround.ts) must never trip
    // the early-September fixture date. The floor has its own tests.
    "2026-08-03"
  );
}

describe("a menu apparel order", () => {
  test("a complete order reports nothing", () => {
    assert.deepEqual(errorsFor(), {});
  });

  test("artwork is required", () => {
    assert.equal(
      errorsFor({}, { artwork: { file: null } }).artwork,
      "Upload your artwork before submitting."
    );
  });

  test("at least one print location is required", () => {
    assert.equal(
      errorsFor({ printLocations: [] }).printLocations,
      "Choose at least one print location."
    );
  });

  test("an empty size grid is refused", () => {
    // Quantity IS the grid total, so the two cannot disagree. All that is left
    // to ask is for at least one shirt.
    assert.equal(errorsFor({}, {}, 0).sizeBreakdown, "Add at least one size.");
  });

  test("one shirt is a real order", () => {
    assert.equal(errorsFor({}, {}, 1).sizeBreakdown, undefined);
  });
});

describe("a special order is priced by hand, so the menu rules lift", () => {
  const SPECIAL = { specialOrder: true, specialOrderNotes: "40 embroidered hats" };

  test("no artwork is demanded", () => {
    /**
     * Deliberate, and the highest-value rule in this file. A customer asking
     * what 40 hoodies cost usually has no print-ready file yet. Demanding one
     * turns the shop's best enquiry into an upload problem and loses the lead
     * outright — the quote email already renders "No file uploaded" without
     * complaint. Anyone "tidying" this into a required field is breaking it.
     */
    const errors = getApparelFieldErrors(
      apparel(SPECIAL),
      order({ artwork: { file: null } }),
      0
    );

    assert.equal(errors.artwork, undefined);
  });

  test("no print location or size grid is demanded", () => {
    const errors = getApparelFieldErrors(
      apparel({ ...SPECIAL, printLocations: [] }),
      order(),
      0
    );

    assert.equal(errors.printLocations, undefined);
    assert.equal(errors.sizeBreakdown, undefined);
  });

  test("but it must say what they actually want", () => {
    const errors = getApparelFieldErrors(
      apparel({ specialOrder: true, specialOrderNotes: "   " }),
      order(),
      0
    );

    assert.equal(errors.specialOrderNotes, "Tell us what you need.");
  });

  test("and roughly how many", () => {
    const errors = getApparelFieldErrors(
      apparel({ ...SPECIAL, quantity: 0 }),
      order(),
      0
    );

    assert.equal(errors.quantity, "Enter roughly how many you need.");
  });

  test("the customer and date rules still apply", () => {
    // The early return skips the menu rules, not the ones about reaching the
    // person who asked.
    const errors = getApparelFieldErrors(
      apparel(SPECIAL),
      order({
        customer: { customerName: "", email: "" },
        production: { needBy: "" },
      }),
      0
    );

    assert.equal(errors.customerName, "Enter your name.");
    assert.equal(errors.customerEmail, "Enter your email.");
    assert.equal(errors.needBy, "Enter the date you need this in hand.");
  });
});

describe("nothing apparel reports can strand the customer", () => {
  test("every key apparel can raise has a step that owns it", () => {
    // A rule that blocks submit but maps to no step leaves the customer on
    // Review with nothing marked and nowhere to go. Asserted over the whole
    // error set so a rule added later is covered without anyone remembering.
    const menu = errorsFor(
      { printLocations: [] },
      {
        customer: { customerName: "", email: "" },
        artwork: { file: null },
        production: { needBy: "" },
      },
      0
    );

    const special = getApparelFieldErrors(
      apparel({ specialOrder: true, specialOrderNotes: "", quantity: 0 }),
      order({
        customer: { customerName: "", email: "" },
        production: { needBy: "" },
      }),
      0
    );

    for (const [label, errors] of [
      ["menu", menu],
      ["special order", special],
    ] as const) {
      assert.ok(
        Object.keys(errors).length >= 5,
        `expected a full sweep of ${label} failures`
      );

      for (const key of Object.keys(errors) as Array<keyof typeof FIELD_STEP>) {
        assert.ok(
          FIELD_STEP[key],
          `apparel can report "${key}" on a ${label} but no step owns it`
        );
      }

      assert.ok(
        getFirstStepWithError(errors),
        `a broken ${label} has nowhere to send the customer`
      );
    }
  });
});
