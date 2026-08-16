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

const CUSTOM = "Custom size";

function signs(overrides: Record<string, unknown> = {}) {
  return {
    templateId: null,
    quantity: 25,
    size: '18" x 24"',
    customWidthInches: 0,
    customHeightInches: 0,
    ...overrides,
  } as Parameters<typeof getSignsFieldErrors>[0];
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    customer: { customerName: "Casey", email: "casey@example.com" },
    artwork: { file: { name: "art.pdf" } },
    production: { needBy: "2026-09-01" },
    ...overrides,
  } as Parameters<typeof getSignsFieldErrors>[1];
}

function errorsFor(
  signsOverrides: Record<string, unknown> = {},
  orderOverrides: Record<string, unknown> = {}
) {
  return getSignsFieldErrors(signs(signsOverrides), order(orderOverrides), CUSTOM);
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
    const errors = errorsFor({ templateId: "open-house" }, { artwork: { file: null } });
    assert.equal(errors.artwork, undefined);
  });

  test("no template and no file is a missing answer", () => {
    const errors = errorsFor({}, { artwork: { file: null } });
    assert.equal(
      errors.artwork,
      "Upload your artwork, or start from one of our templates."
    );
  });

  test("a custom size needs both dimensions typed", () => {
    const errors = errorsFor({ size: CUSTOM });
    assert.equal(errors.width, "Enter a width.");
    assert.equal(errors.height, "Enter a height.");
  });

  test("a menu size resolves from the product table, so blank dimensions are fine", () => {
    // The custom boxes sit at 0 whenever a menu size is chosen. That is not a
    // question the customer failed to answer.
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
      signs({ quantity: 0, size: CUSTOM, templateId: null }),
      order({
        customer: { customerName: "", email: "" },
        artwork: { file: null },
        production: { needBy: "" },
      }),
      CUSTOM
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
