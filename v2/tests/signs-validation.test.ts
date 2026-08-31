import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { getSignsFieldErrors } from "../lib/validation";
import { getFirstStepWithError, FIELD_STEP } from "../lib/steps";

/**
 * What a sign quote has to answer before the shop is asked to make it.
 *
 * These rules lived inside app/page.tsx as a closure over component state, so
 * nothing could test them — which is exactly how the quantity check came to be
 * missing. Stickers and apparel both had one. Signs did not, and no suite was
 * in a position to notice.
 */

function signs(overrides: Record<string, unknown> = {}) {
  return {
    templateId: null,
    quantity: 25,
    customWidthInches: 0,
    customHeightInches: 0,
    artwork: { file: { name: "art.pdf" } },
    // The fixture is a yard sign — the one product whose size the shop fixes.
    needsTypedSize: false,
    ...overrides,
  } as Parameters<typeof getSignsFieldErrors>[0][number];
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    customer: { customerName: "Casey", email: "casey@example.com" },
    production: { needBy: "2026-09-01" },
    ...overrides,
  } as Parameters<typeof getSignsFieldErrors>[1];
}

/**
 * `needsTypedSize` defaults to false — the fixture is a yard sign, the one
 * product whose size the shop fixes. Pass true for anything the customer types
 * dimensions for, which is every other sign.
 */
function errorsFor(
  signsOverrides: Record<string, unknown> = {},
  orderOverrides: Record<string, unknown> = {},
  needsTypedSize = false
) {
  return getSignsFieldErrors(
    [signs({ needsTypedSize, ...signsOverrides })],
    order(orderOverrides),
    // Lane + pinned "today": this file tests the sign rules themselves, so
    // the turnaround floor (lib/turnaround.ts) must never trip the fixture.
    "slow",
    "2026-08-03"
  );
}

describe("a sign has to have a quantity", () => {
  test("a complete sign order reports nothing", () => {
    assert.deepEqual(errorsFor(), {});
  });

  for (const bad of [0, -5, Number.NaN]) {
    test(`quantity ${String(bad)} is refused`, () => {
      // A sign priced at zero is not a cheap sign. It is a quote the shop has
      // to spot as wrong before making it, and nothing downstream said so.
      assert.equal(errorsFor({ quantity: bad }).quantity, "Enter how many you need.");
    });
  }

  test("one sign is a real order, not a mistake", () => {
    assert.equal(errorsFor({ quantity: 1 }).quantity, undefined);
  });

  test("the quantity problem lands the customer on the step that owns the box", () => {
    /**
     * The rule and the mark have to agree about WHERE the problem is, or
     * submit blocks and moves the customer to a step with nothing painted on
     * it. quantity maps to Details, and the sign quantity box is on Details.
     */
    assert.equal(FIELD_STEP.quantity, "details");
    assert.equal(getFirstStepWithError(errorsFor({ quantity: 0 })), "details");
  });
});

describe("the rules signs already had still hold", () => {
  test("a template counts as artwork, so no file is demanded", () => {
    // Choosing a template REPLACES the upload. Requiring both would make a
    // finished design unsubmittable.
    // Artwork moved onto the DESIGN when signs grew a design list — a quote
    // with three signs in it has three files, not one.
    const errors = errorsFor({
      templateId: "open-house",
      artwork: { file: null },
    });
    assert.equal(errors.artwork, undefined);
  });

  test("no template and no file is a missing answer", () => {
    const errors = errorsFor({ artwork: { file: null } });
    assert.equal(
      errors.artwork,
      "Upload your artwork, or start from one of our templates."
    );
  });

  test("a typed-size product needs both dimensions", () => {
    /**
     * This rule was UNREACHABLE. It used to fire only when the size equalled
     * the "Custom size" sentinel, which was an option in a dropdown that no
     * longer exists — the builder now sets `size` to the product's first
     * preset label and never to the sentinel. So a banner could be submitted
     * with no size on it: it did not price, so it degraded into a hand-quote
     * request, and the shop was told a preset size the customer never chose.
     */
    const errors = errorsFor({}, {}, true);
    assert.equal(errors.width, "Enter a width.");
    assert.equal(errors.height, "Enter a height.");
  });

  test("and is satisfied once they are typed", () => {
    const errors = errorsFor(
      { customWidthInches: 25, customHeightInches: 37 },
      {},
      true
    );

    assert.equal(errors.width, undefined);
    assert.equal(errors.height, undefined);
  });

  test("a yard sign is frozen at one size, so blank dimensions are fine", () => {
    // Yard signs show no width or height field at all — the builder prints
    // 18" x 24" as static text. A blank box there is not a question the
    // customer failed to answer.
    const errors = errorsFor({ size: '18" x 24"' });
    assert.equal(errors.width, undefined);
    assert.equal(errors.height, undefined);
  });

  test("name, email and date are all required", () => {
    const errors = errorsFor(
      {},
      {
        customer: { customerName: "  ", email: "" },
        production: { needBy: "  " },
      }
    );

    assert.equal(errors.customerName, "Enter your name.");
    assert.equal(errors.customerEmail, "Enter your email.");
    assert.equal(errors.needBy, "Enter the date you need this in hand.");
  });
});

describe("every key signs can raise has a step that owns it", () => {
  test("nothing signs reports can strand the customer", () => {
    /**
     * The dead end this prevents: a rule that blocks submit but maps to no
     * step leaves the customer on Review with nothing marked and nowhere to
     * go. Worth asserting over the WHOLE error set rather than field by field,
     * so a rule added later is covered without anyone remembering to.
     */
    const everythingWrong = getSignsFieldErrors(
      [
        signs({
          quantity: 0,
          templateId: null,
          artwork: { file: null },
          needsTypedSize: true,
        }),
      ],
      order({
        customer: { customerName: "", email: "" },
        production: { needBy: "" },
      }),
      "slow",
      "2026-08-03"
    );

    assert.ok(Object.keys(everythingWrong).length >= 7, "expected a full sweep of failures");

    for (const key of Object.keys(everythingWrong) as Array<keyof typeof FIELD_STEP>) {
      assert.ok(
        FIELD_STEP[key],
        `signs can report "${key}" but no step owns it — submit would block with nowhere to send anyone`
      );
    }
  });
});
