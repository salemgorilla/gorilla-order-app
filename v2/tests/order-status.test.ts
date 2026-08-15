import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { toCustomerStatus } from "../lib/order-status";

/**
 * What a customer reads about their own order.
 *
 * The shop's status names sort work on a production board. They were never
 * written to be read by the person waiting, and two of the eight leak shop
 * language outright. The risk this file guards is the NINTH status: anything
 * added to Printavo later that nobody thought to map.
 */

describe("the eight agreed statuses", () => {
  const expected: Array<[string, string, number | null]> = [
    ["Lab Order Placed", "Order received", 1],
    ["Lab Order Pre-Press", "Preparing your artwork", 2],
    ["Lab Order Printing", "Printing", 3],
    ["Lab Order Completed - Ready For Local Pickup", "Ready for pickup in Salem", 4],
    ["Lab Order Completed - Picked Up", "Picked up — thank you", 4],
    ["Lab Order Completed - Ready To Ship", "Ready to ship", 4],
    ["Lab Order Completed - Shipped", "Shipped", 4],
  ];

  for (const [printavo, label, step] of expected) {
    test(`"${printavo}" reads as "${label}"`, () => {
      const status = toCustomerStatus(printavo);

      assert.equal(status.label, label);
      assert.equal(status.step, step);
      assert.equal(status.unrecognised, false);
      // Shop taxonomy must never survive into the customer's view.
      assert.doesNotMatch(status.label, /lab order/i);
    });
  }

  test("a hold says who acts next, and shows no progress bar", () => {
    // "Order on Hold (Issue)" reads to a customer as something is wrong,
    // possibly their fault, with nothing to do about it.
    const status = toCustomerStatus("Order on Hold (Issue)");

    assert.match(status.label, /we need to check something with you/);
    assert.doesNotMatch(status.label, /issue/i);
    assert.match(status.detail, /getting in touch/);
    assert.equal(status.step, null, "a bar guessing at a position is a lie");
    assert.equal(status.stage, "hold");
  });

  test("only the terminal statuses are complete", () => {
    assert.equal(toCustomerStatus("Lab Order Completed - Shipped").complete, true);
    assert.equal(toCustomerStatus("Lab Order Completed - Picked Up").complete, true);
    // Ready is not done — the customer still has to collect it.
    assert.equal(
      toCustomerStatus("Lab Order Completed - Ready For Local Pickup").complete,
      false
    );
  });
});

describe("matching survives the Printavo UI", () => {
  for (const variant of [
    "lab order printing",
    "LAB ORDER PRINTING",
    "  Lab Order Printing  ",
    "Lab Order  Printing",
  ]) {
    test(`"${variant}" still maps`, () => {
      // A status renamed with a stray double space, or re-typed in a different
      // case, must not drop a real order into the unrecognised path.
      assert.equal(toCustomerStatus(variant).label, "Printing");
    });
  }
});

describe("a status nobody mapped", () => {
  test("harmless wording shows through", () => {
    const status = toCustomerStatus("Awaiting Payment");

    assert.equal(status.label, "Awaiting Payment");
    assert.equal(status.unrecognised, true);
    assert.equal(status.step, null);
  });

  for (const internal of [
    "Customer owes balance",
    "DNP - test order",
    "(internal) chase artwork",
    "Lab Order Reprint (our error)",
    "Hold - waste, redo",
  ]) {
    test(`"${internal}" is withheld`, () => {
      // The cost of withholding something a customer could have read is one
      // vague sentence. The cost of showing one we should not have is a
      // customer reading the shop's private note about their own job.
      const status = toCustomerStatus(internal);

      assert.equal(status.label, "In progress");
      assert.equal(status.unrecognised, true);
    });
  }

  test("an empty status still says something sayable", () => {
    // A tracker that renders nothing because Printavo sent an empty string is
    // worse than one that admits it is unsure.
    const status = toCustomerStatus("");

    assert.ok(status.label.length > 0);
    assert.ok(status.detail.length > 0);
    assert.equal(status.unrecognised, true);
  });

  test("every unrecognised status is flagged so it can be mapped", () => {
    // The route logs on this flag. Without it a drifted board is invisible.
    for (const value of ["Awaiting Payment", "Customer owes balance", ""]) {
      assert.equal(toCustomerStatus(value).unrecognised, true);
    }
  });
});
