import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  getOrderFieldErrors,
  getSignsFieldErrors,
  getApparelFieldErrors,
  type FieldKey,
} from "../lib/validation";
import { FIELD_STEP } from "../lib/steps";

/**
 * Every rule must be able to fire.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * A validation rule that cannot be reached is worse than a missing one: the
 * repo reads as covered, a test asserting the rule passes, and the customer
 * gets nothing. That is not hypothetical here. The `quantity > 0` rules in
 * all three flows were unreachable for the ordinary typing customer, because
 * NumberField's blur snapped a cleared box up to 1 before the rule saw a 0 —
 * and the comment beside the signs rule described that spring-back as a
 * reason the rule was merely redundant.
 *
 * lib/steps.ts already forces every FieldKey to declare which step owns it,
 * and that is a compile-time check: add a key without a step and the build
 * fails. What nothing checked was the runtime half — that some real input
 * state actually produces each key. This file is that half.
 *
 * Verified against the browser too, which is what these stand in for: with
 * every box emptied, stickers show 7 errors, signs 5 and the live apparel
 * request flow 5, none of the three POSTs, and the apparel flow correctly
 * does NOT demand artwork.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** A sticker cart with one design and nothing filled in. */
const emptyStickerOrder = {
  items: [
    {
      id: "a",
      widthInches: 0,
      heightInches: 0,
      quantity: 0,
      artwork: { file: null },
    },
  ],
  production: { needBy: "" },
  customer: { customerName: "", email: "" },
} as unknown as Parameters<typeof getOrderFieldErrors>[0];

const emptyOrderPart = {
  customer: { customerName: "", email: "" },
  artwork: { file: null },
  production: { needBy: "" },
};

/**
 * Which flow can produce each key, and the state that does it.
 *
 * Keyed by FieldKey so the exhaustiveness check below is real: a new key with
 * no entry here fails to compile, and a key whose rule stops firing fails at
 * run time.
 */
const REACHABLE: Record<FieldKey, () => string | undefined> = {
  // Stickers — per-design rules plus the order-level ones.
  width: () => getOrderFieldErrors(emptyStickerOrder).width,
  height: () => getOrderFieldErrors(emptyStickerOrder).height,
  quantity: () => getOrderFieldErrors(emptyStickerOrder).quantity,
  artwork: () => getOrderFieldErrors(emptyStickerOrder).artwork,
  needBy: () => getOrderFieldErrors(emptyStickerOrder).needBy,
  customerName: () => getOrderFieldErrors(emptyStickerOrder).customerName,
  customerEmail: () => getOrderFieldErrors(emptyStickerOrder).customerEmail,

  // Apparel — the two keys only apparel can raise.
  specialOrderNotes: () =>
    getApparelFieldErrors(
      {
        specialOrder: true,
        specialOrderNotes: "",
        quantity: 10,
        printLocations: [],
      },
      emptyOrderPart,
      10
    ).specialOrderNotes,

  /**
   * printLocations and sizeBreakdown belong to the apparel MENU flow, which
   * is not reachable in the product today — choosing apparel pins
   * specialOrder and routes to the request builder, because the menu flow's
   * pricing is not signed off. The rules are still live code and still
   * correct, so they are exercised here directly rather than deleted or
   * marked skipped. When the menu flow ships, these become customer-facing
   * with no change needed.
   */
  printLocations: () =>
    getApparelFieldErrors(
      {
        specialOrder: false,
        specialOrderNotes: "",
        quantity: 24,
        printLocations: [],
      },
      { ...emptyOrderPart, artwork: { file: { name: "art.png" } } },
      24
    ).printLocations,

  /**
   * The apparel cart: a line the customer added and left blank. The rule
   * takes the per-line problems already resolved against the catalogue
   * (lib/apparel-cart-lines.ts) and surfaces the first at field level.
   */
  garmentLines: () =>
    getApparelFieldErrors(
      {
        specialOrder: false,
        specialOrderNotes: "",
        quantity: 24,
        printLocations: ["Front"],
      },
      { ...emptyOrderPart, artwork: { file: { name: "art.png" } } },
      24,
      undefined,
      { "garment-1": "Choose a garment." }
    ).garmentLines,

  // sizeBreakdown left this map when sizes became optional at estimate
  // time (the blend prices an assumed mix until they exist) — no rule
  // raises it any more, so reachability has nothing to prove for it. The
  // menu flow's zero-count case now raises `quantity`, covered above.
};

describe("every validated field can actually be marked", () => {
  for (const key of Object.keys(REACHABLE) as FieldKey[]) {
    test(`${key} is reachable`, () => {
      const message = REACHABLE[key]();

      assert.ok(
        message && message.trim().length > 0,
        `nothing can make "${key}" fail — the rule exists but no customer can trigger it, which is how the quantity checks came to be dead in all three flows`
      );
    });
  }

  test("no FieldKey is missing a reachability case", () => {
    // FIELD_STEP is the exhaustive map — lib/steps.ts makes the compiler
    // require an entry for every key. Comparing against it means adding a new
    // validated field without proving it can fire fails here rather than
    // shipping a rule nothing can reach.
    const declared = Object.keys(FIELD_STEP).sort();
    const covered = Object.keys(REACHABLE).sort();

    assert.deepEqual(covered, declared);
  });
});

describe("the flows that share a rule all enforce it", () => {
  /**
   * The recurring defect in this repo is a rule that is right in one flow and
   * missing in its siblings — which is literally how the signs quantity check
   * came to be absent. Quantity is the one rule all three flows own.
   */
  test("all three flows refuse a zero quantity", () => {
    assert.ok(getOrderFieldErrors(emptyStickerOrder).quantity, "stickers");

    assert.ok(
      getSignsFieldErrors(
        [
          {
            templateId: null,
            quantity: 0,
            customWidthInches: 0,
            customHeightInches: 0,
            artwork: { file: null },
            needsTypedSize: false,
          },
        ],
        emptyOrderPart,
        // Lane is irrelevant here — the fixture has no date for the
        // turnaround floor to judge.
        "slow"
      ).quantity,
      "signs"
    );

    assert.ok(
      getApparelFieldErrors(
        {
          specialOrder: true,
          specialOrderNotes: "40 hoodies",
          quantity: 0,
          printLocations: [],
        },
        emptyOrderPart,
        0
      ).quantity,
      "apparel"
    );
  });

  test("apparel still does not demand artwork for a hand-quote request", () => {
    // Deliberate, and load-bearing: a customer asking what 40 hoodies cost
    // usually has no print-ready file, and demanding one turns the shop's
    // highest-value enquiry into an upload problem. Asserted so a later
    // "consistency" pass across the flows cannot quietly add it.
    const errors = getApparelFieldErrors(
      {
        specialOrder: true,
        specialOrderNotes: "40 hoodies, two colours",
        quantity: 40,
        printLocations: [],
      },
      { ...emptyOrderPart, production: { needBy: "2026-12-01" } },
      40
    );

    assert.equal(errors.artwork, undefined);
  });
});
