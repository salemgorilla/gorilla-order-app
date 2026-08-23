import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FIELD_STEP, getStepIndex, orderProblemsByStep } from "../lib/steps";
import {
  getApparelValidationSummary,
  getOrderValidationErrors,
  getSignsValidationSummary,
} from "../lib/validation";
import { defaultOrder } from "../lib/order";

/**
 * One order for the checklist, across all three flows.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Each flow built its problem list by hand, and each picked a different
 * order for the same panel:
 *
 *   stickers  artwork, size, quantity, date, name, email
 *   signs     name, email, date, then the designs
 *   apparel   name, email, artwork, date, notes, quantity, locations, sizes
 *
 * The form asks in ONE order — details, artwork, contact — so all three sent
 * a customer reading top to bottom backwards through their own quote, and a
 * customer who switched products met the same list rearranged.
 *
 * It is the same class of thing as the apparel messages that once read
 * "Customer name is required." while the other two said "Enter your name.":
 * one panel behaving differently depending on which product was picked. That
 * got fixed; the ORDER did not.
 *
 * ── THE FIX ───────────────────────────────────────────────────────────────
 * FIELD_STEP already decides which step owns each field — it is what powers
 * "jump to the first thing wrong". Sorting by it means the list and the jump
 * agree by construction, and the three flows cannot diverge again.
 */

describe("the sort itself", () => {
  test("orders by step, whatever order they arrive in", () => {
    const ordered = orderProblemsByStep([
      { field: "customerName", message: "contact" },
      { field: "artwork", message: "artwork" },
      { field: "quantity", message: "details" },
    ]);

    assert.deepEqual(ordered, ["details", "artwork", "contact"]);
  });

  test("is stable within a step", () => {
    // Two Details problems keep the order the caller pushed — which is
    // reading order down the form, and design 1 before design 2.
    const ordered = orderProblemsByStep([
      { field: "quantity", message: "first" },
      { field: "width", message: "second" },
      { field: "needBy", message: "third" },
    ]);

    assert.deepEqual(ordered, ["first", "second", "third"]);
  });

  test("carries problems that have no field of their own", () => {
    // Template wording has no FieldKey — it is per-template and would have to
    // join the union for every template anyone adds.
    const ordered = orderProblemsByStep([
      { field: "customerName", message: "name" },
      { step: "details", message: "template" },
    ]);

    assert.deepEqual(ordered, ["template", "name"]);
  });

  test("every FieldKey maps to a real step, so nothing sorts by accident", () => {
    for (const [field, step] of Object.entries(FIELD_STEP)) {
      assert.ok(
        getStepIndex(step) >= 0,
        `${field} maps to ${step}, which is not a step`
      );
    }
  });
});

describe("all three flows ask in the same sequence", () => {
  /** Everything blank, so each flow reports as much as it can at once. */
  const EMPTY_CONTACT = {
    customer: { customerName: "", email: "" },
    production: { needBy: "" },
  };

  /** Where in the form the first mention of each concern appears. */
  function stepsOf(problems: string[]) {
    const seen: string[] = [];

    for (const problem of problems) {
      const step = /name|email|address/i.test(problem)
        ? "contact"
        : /artwork/i.test(problem)
        ? "artwork"
        : "details";

      if (seen.at(-1) !== step) seen.push(step);
    }

    return seen;
  }

  test("stickers: details, then artwork, then contact", () => {
    const problems = getOrderValidationErrors({
      ...defaultOrder,
      customer: { ...defaultOrder.customer, customerName: "", email: "" },
      production: { ...defaultOrder.production, needBy: "" },
      items: defaultOrder.items.map((item) => ({
        ...item,
        artwork: { file: null },
      })),
    });

    assert.deepEqual(stepsOf(problems), ["details", "artwork", "contact"]);
  });

  test("signs: details, then artwork, then contact", () => {
    const problems = getSignsValidationSummary(
      [
        {
          templateId: null,
          quantity: 5,
          customWidthInches: 0,
          customHeightInches: 0,
          artwork: { file: null },
          needsTypedSize: true,
        },
      ],
      EMPTY_CONTACT
    );

    assert.deepEqual(stepsOf(problems), ["details", "artwork", "contact"]);
  });

  test("apparel: details, then artwork, then contact", () => {
    const problems = getApparelValidationSummary(
      {
        specialOrder: false,
        garmentType: "T-Shirt",
        quantity: 0,
        printLocations: [],
        specialOrderNotes: "",
        sizeBreakdown: "",
      } as never,
      { ...EMPTY_CONTACT, artwork: { file: null } } as never,
      0
    );

    assert.deepEqual(stepsOf(problems), ["details", "artwork", "contact"]);
  });

  test("no flow puts the customer's name before their quote", () => {
    // The specific reversal all three had: contact problems at the top, so
    // the first thing a customer read was about a field four steps away.
    const signs = getSignsValidationSummary(
      [
        {
          templateId: null,
          quantity: 0,
          customWidthInches: 72,
          customHeightInches: 36,
          artwork: { file: { name: "art.pdf" } },
          needsTypedSize: true,
        },
      ],
      EMPTY_CONTACT
    );

    assert.doesNotMatch(signs[0], /name|email/i);
  });
});
