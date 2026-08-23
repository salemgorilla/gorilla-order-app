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
      ORDER
    );

    assert.deepEqual(problems, ["Upload your artwork."]);
  });

  test("a complete quote reports nothing at all", () => {
    assert.deepEqual(getSignsValidationSummary([ok()], ORDER), []);
  });
});

describe("several designs say WHICH", () => {
  test("names the one design that is missing a file", () => {
    // The case that sent the customer to the wrong card: designs 1 and 3 are
    // fine, only 2 is missing artwork.
    const problems = getSignsValidationSummary(
      [ok(), ok({ artwork: { file: null } }), ok()],
      ORDER
    );

    assert.deepEqual(problems, ["Design 2: Upload your artwork."]);
  });

  test("names every design that has a problem, in order", () => {
    const problems = getSignsValidationSummary(
      [
        ok({ artwork: { file: null } }),
        ok(),
        ok({ quantity: 0 }),
      ],
      ORDER
    );

    assert.deepEqual(problems, [
      "Design 1: Upload your artwork.",
      "Design 3: Enter how many you need.",
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
      ORDER
    );

    assert.deepEqual(problems, [
      "Design 2: Upload your artwork.",
      "Design 2: Enter the width and height.",
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
      ORDER
    );

    // A template IS the artwork, so no upload is owed — only the wording.
    assert.deepEqual(problems, ["Design 2: Enter the address."]);
  });
});

describe("order-level problems are never named by design", () => {
  test("one name, one address, one date, however many designs", () => {
    const problems = getSignsValidationSummary([ok(), ok(), ok()], {
      customer: { customerName: "", email: "" },
      production: { needBy: "" },
    });

    assert.deepEqual(problems, [
      "Enter your name.",
      "Enter your email.",
      "Enter the date you need this in hand.",
    ]);

    for (const problem of problems) {
      assert.doesNotMatch(problem, /^Design \d/);
    }
  });

  test("order-level problems come before the per-design ones", () => {
    // Reading order: the things at the top of the form first.
    const problems = getSignsValidationSummary(
      [ok({ artwork: { file: null } })],
      { customer: { customerName: "", email: "x" }, production: { needBy: "" } }
    );

    assert.equal(problems[0], "Enter your name.");
    assert.equal(problems.at(-1), "Upload your artwork.");
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
      ORDER
    );

    assert.deepEqual(problems, []);
  });
});
