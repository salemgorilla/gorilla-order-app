import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  resolveBlurValue,
  snapQuantity,
  sanitizeSizeInches,
} from "../lib/units";
import { getItemFieldErrors, getSignsFieldErrors } from "../lib/validation";

/**
 * Clearing "How many" used to sell you one.
 *
 * ── THE DEFECT, AS OBSERVED IN A BROWSER ──────────────────────────────────
 * Set stickers to 100, clear the quantity box, press Tab. The field came back
 * reading 1. No error, no invalid treatment, and every step in the bar ticked
 * green — so a customer who cleared the field to retype it and glanced away
 * submitted an order for ONE sticker. Stickers self-check-out, so that is a
 * live payable link at the wrong quantity with nobody in the loop. Signs
 * behaved identically.
 *
 * The cause was one expression: NumberField's blur ran `snap(...)` on every
 * exit, and `snapQuantity` is `Math.max(1, ...)`. So the blank box was read
 * as the number 0 and corrected up to 1 before validation ever saw it. The
 * `quantity > 0` rules in lib/validation.ts were not missing — they were
 * unreachable.
 *
 * priceStickerItem carries a comment saying quantity is deliberately NOT
 * clamped into state, for exactly this reason. That fix was real but it was
 * one layer too low: the clamp was happening in the field, above it, so the
 * behaviour the comment describes never actually held. Worth remembering that
 * a comment asserting a fix is not evidence the fix works.
 * ──────────────────────────────────────────────────────────────────────────
 */

describe("a cleared field stays cleared", () => {
  test("an empty box is not a quantity of one", () => {
    // The whole defect, in one line.
    assert.equal(resolveBlurValue("", snapQuantity), 0);
  });

  test("whitespace is still empty", () => {
    assert.equal(resolveBlurValue("   ", snapQuantity), 0);
  });

  test("a cleared size box is not a size", () => {
    // sanitizeSizeInches has no floor, so this one was never wrong — asserted
    // so that giving sizes a minimum later cannot reintroduce the bug there.
    assert.equal(resolveBlurValue("", sanitizeSizeInches), 0);
  });
});

describe("what the customer actually typed is still corrected", () => {
  test("a fractional count snaps to a whole one", () => {
    assert.equal(resolveBlurValue("2.7", snapQuantity), 2);
  });

  test("a typed zero is an answer, and a wrong one, so the floor holds", () => {
    // Deliberately NOT treated as cleared. Typing 0 is a statement; the box
    // then visibly reads 1, which is feedback. An empty box shows nothing,
    // which is why only that case is left alone.
    assert.equal(resolveBlurValue("0", snapQuantity), 1);
  });

  test("a negative count is corrected, not accepted", () => {
    assert.equal(resolveBlurValue("-5", snapQuantity), 1);
  });

  test("an ordinary count passes through", () => {
    assert.equal(resolveBlurValue("1000", snapQuantity), 1000);
  });

  test("junk is not a quantity", () => {
    assert.equal(resolveBlurValue("abc", snapQuantity), 1);
  });

  test("shop fractions survive to four decimals", () => {
    // 3 3/8". Rounding sizes to hundredths was tried once and repriced every
    // order that used a sixteenth.
    assert.equal(resolveBlurValue("3.375", sanitizeSizeInches), 3.375);
  });

  test("float noise does not reach the price", () => {
    assert.equal(resolveBlurValue("1.7500000000000002", sanitizeSizeInches), 1.75);
  });
});

describe("the validation rules can now actually fire", () => {
  /**
   * The point of the fix. These rules already existed and already passed
   * their own tests — what they never got was a 0 to judge, because the field
   * corrected it away first. Asserting the rules here ties them to the value
   * a cleared box now produces.
   */
  const cleared = resolveBlurValue("", snapQuantity);

  /**
   * Everything BUT quantity is valid, so a failure here can only be the
   * quantity rule. A partial fixture throws inside the validator before it
   * reaches that rule, which would have passed for the wrong reason.
   */
  function signsErrors(quantity: number) {
    return getSignsFieldErrors(
      [
        {
          templateId: null,
          quantity,
          customWidthInches: 0,
          customHeightInches: 0,
          artwork: { file: { name: "art.pdf" } },
          // A yard sign: its size is fixed by the shop, so no dimensions are
          // owed.
          needsTypedSize: false,
        },
      ],
      {
        customer: { customerName: "Casey", email: "casey@example.com" },
        production: { needBy: "2026-09-01" },
      }
    );
  }

  test("stickers: a cleared quantity is an error", () => {
    const errors = getItemFieldErrors({
      widthInches: 3,
      heightInches: 3,
      quantity: cleared,
      artwork: { file: {} as never },
    } as never);

    assert.equal(errors.quantity, "Enter how many you need.");
  });

  test("signs: a cleared quantity is an error", () => {
    assert.equal(signsErrors(cleared).quantity, "Enter how many you need.");
  });

  test("and a real quantity is not", () => {
    const ok = resolveBlurValue("250", snapQuantity);

    assert.equal(
      getItemFieldErrors({
        widthInches: 3,
        heightInches: 3,
        quantity: ok,
        artwork: { file: {} as never },
      } as never).quantity,
      undefined
    );

    assert.equal(signsErrors(ok).quantity, undefined);
  });
});
