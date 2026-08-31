import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { getSignsValidationSummary } from "../lib/validation";

/**
 * The list a customer reads when submit refuses.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Template wording errors were named by design — "Design 2: Enter the
 * address" — while artwork, quantity and size were read off the flat
 * FieldErrors map, which reports the FIRST design with a problem and drops
 * which one it was.
 *
 * So a three-design quote missing a file on design 2 said:
 *
 *     • Upload your artwork.
 *
 * and nothing more. The customer looks at design 1, finds a file on it, and
 * has nowhere to go — the same dead end the step mapping exists to prevent,
 * reached from a different direction. Found by driving a two-design quote to
 * Review in a browser and pressing send.
 *
 * ── AND WHY IT WAS POSSIBLE ───────────────────────────────────────────────
 * The list was assembled inside app/page.tsx, so nothing could test it.
 * AGENTS.md says exactly this: "the rules nothing could test were the ones
 * with gaps." Moving it here is most of the fix; the naming is the rest.
 */

const ORDER = {
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { needBy: "2026-09-15" },
};

// Lane + pinned "today" for every call: this file tests the problem list's
// wording and ordering, so the turnaround floor (lib/turnaround.ts) must
// never trip the mid-September fixture date.
const LANE = "slow" as const;
const TODAY = "2026-08-03";

/** A design with nothing wrong with it. */
function ok(overrides: Record<string, unknown> = {}) {
  return {
    templateId: null,
    quantity: 5,
    customWidthInches: 72,
    customHeightInches: 36,
    artwork: { file: { name: "art.pdf" } },
    needsTypedSize: true,
    ...overrides,
  } as Parameters<typeof getSignsValidationSummary>[0][number];
}

describe("one design says it plainly", () => {
  test("no design number when there is only one", () => {
    const problems = getSignsValidationSummary(
      [ok({ artwork: { file: null } })],
      ORDER,
      LANE,
      TODAY
    );

    assert.deepEqual(problems, ["Upload your artwork."]);
  });

  test("a complete quote reports nothing at all", () => {
    assert.deepEqual(getSignsValidationSummary([ok()], ORDER, LANE, TODAY), []);
  });
});

describe("several designs say WHICH", () => {
  test("names the one design that is missing a file", () => {
    // The case that sent the customer to the wrong card: designs 1 and 3 are
    // fine, only 2 is missing artwork.
    const problems = getSignsValidationSummary(
      [ok(), ok({ artwork: { file: null } }), ok()],
      ORDER,
      LANE,
      TODAY
    );

    assert.deepEqual(problems, ["Design 2: Upload your artwork."]);
  });

  test("names every design that has a problem, in FORM order", () => {
    /**
     * Sorted by the step that owns each field, not by design. Quantity is
     * asked on Details and artwork on Artwork, so design 3's missing count
     * comes before design 1's missing file — which is the order the customer
     * meets them walking through their own quote. Within a step the designs
     * keep their order.
     */
    const problems = getSignsValidationSummary(
      [
        ok({ artwork: { file: null } }),
        ok(),
        ok({ quantity: 0 }),
      ],
      ORDER,
      LANE,
      TODAY
    );

    assert.deepEqual(problems, [
      "Design 3: Enter how many you need.",
      "Design 1: Upload your artwork.",
    ]);
  });

  test("a design can raise more than one", () => {
    const problems = getSignsValidationSummary(
      [
        ok(),
        ok({
          artwork: { file: null },
          customWidthInches: 0,
          customHeightInches: 0,
        }),
      ],
      ORDER,
      LANE,
      TODAY
    );

    // Size is a Details question, artwork an Artwork one.
    assert.deepEqual(problems, [
      "Design 2: Enter the width and height.",
      "Design 2: Upload your artwork.",
    ]);
  });

  test("template wording is named the same way as everything else", () => {
    // These were already named; the rest were not. The point of the fix is
    // that one function decides, so they cannot diverge again.
    const problems = getSignsValidationSummary(
      [
        ok(),
        ok({
          templateId: "open-house",
          artwork: { file: null },
          templateTextErrors: { address: "Enter the address." },
        }),
      ],
      ORDER,
      LANE,
      TODAY
    );

    // A template IS the artwork, so no upload is owed — only the wording.
    assert.deepEqual(problems, ["Design 2: Enter the address."]);
  });
});

describe("order-level problems are never named by design", () => {
  test("one name, one address, one date, however many designs", () => {
    const problems = getSignsValidationSummary(
      [ok(), ok(), ok()],
      {
        customer: { customerName: "", email: "" },
        production: { needBy: "" },
      },
      LANE,
      TODAY
    );

    // The date is asked on Details, the name and address on Contact, so this
    // is the order the form asks them in.
    assert.deepEqual(problems, [
      "Enter the date you need this in hand.",
      "Enter your name.",
      "Enter your email.",
    ]);

    for (const problem of problems) {
      assert.doesNotMatch(problem, /^Design \d/);
    }
  });

  test("everything is ordered by the step that asks it", () => {
    /**
     * Not "order-level first", which is what this used to assert. The form
     * asks Details, then Artwork, then Contact — so the date comes first, the
     * missing file next, and the customer's name last. A list that ran the
     * other way sent someone reading it top to bottom backwards through their
     * own quote.
     */
    const problems = getSignsValidationSummary(
      [ok({ artwork: { file: null } })],
      {
        customer: { customerName: "", email: "dana@example.com" },
        production: { needBy: "" },
      },
      LANE,
      TODAY
    );

    assert.deepEqual(problems, [
      "Enter the date you need this in hand.",
      "Upload your artwork.",
      "Enter your name.",
    ]);
  });
});

describe("a yard sign owes no dimensions", () => {
  test("needsTypedSize false means blank boxes are not a problem", () => {
    const problems = getSignsValidationSummary(
      [
        ok({
          needsTypedSize: false,
          customWidthInches: 0,
          customHeightInches: 0,
        }),
      ],
      ORDER,
      LANE,
      TODAY
    );

    assert.deepEqual(problems, []);
  });
});
