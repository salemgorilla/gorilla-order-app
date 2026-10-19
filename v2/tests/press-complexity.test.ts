/**
 * THE PRESS QUERY'S SECOND ERROR — AND A COST MODEL PINNED TO PRINTAVO'S OWN NUMBER.
 *
 * #206 fixed the missing `LineItem.quantity`. The first production call on
 * that build, 2026-10-14T01:31Z, answered:
 *
 *   Printavo: Query has complexity of 40962, which exceeds max complexity of 25000
 *
 * The model in lib/printavo.ts is fitted to that figure, and the first test
 * here holds it to it. A model that cannot reproduce the one number Printavo
 * has actually told us is not a model, it is a guess with a function name —
 * and the first draft of this one was off by 80 for exactly that reason.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  PRESS_PAGE,
  PRINTAVO_MAX_COMPLEXITY,
  maxPressInvoices,
  pressQueryComplexity,
} from "../lib/printavo";

describe("the cost model matches what Printavo said", () => {
  test("the old page sizes cost exactly 40962", () => {
    assert.equal(
      pressQueryComplexity({ invoices: 40, lineItemGroups: 10, lineItems: 25 }),
      40962
    );
  });

  test("the admin probe's five invoices were always under the cap", () => {
    // Which is why the probe could look healthy while every public request
    // failed — the probe asks for 5, the hero for 40.
    assert.ok(
      pressQueryComplexity({ invoices: 5, lineItemGroups: 10, lineItems: 25 }) <
        PRINTAVO_MAX_COMPLEXITY
    );
  });
});

describe("the query that ships stays under the cap", () => {
  test("the production page sizes fit, with room to spare", () => {
    const cost = pressQueryComplexity(PRESS_PAGE);

    assert.ok(cost <= PRINTAVO_MAX_COMPLEXITY, `${cost} exceeds ${PRINTAVO_MAX_COMPLEXITY}`);
    // Headroom, so one more field on a line item is not an outage.
    assert.ok(cost <= PRINTAVO_MAX_COMPLEXITY * 0.9, `${cost} leaves under 10% headroom`);
  });

  test("the clamp stops at the largest invoice page that fits", () => {
    const max = maxPressInvoices();

    assert.ok(pressQueryComplexity({ ...PRESS_PAGE, invoices: max }) <= PRINTAVO_MAX_COMPLEXITY);
    assert.ok(
      pressQueryComplexity({ ...PRESS_PAGE, invoices: max + 1 }) > PRINTAVO_MAX_COMPLEXITY,
      "the clamp is looser than it needs to be, or the model moved"
    );
  });

  test("the week is still covered: the default invoice page is not what was cut", () => {
    // Groups came down, not invoices. The hero counts a WEEK of work, so the
    // invoice count is what decides whether the figure is complete.
    assert.ok(PRESS_PAGE.invoices >= 40);
    assert.ok(PRESS_PAGE.invoices <= maxPressInvoices());
  });
});

describe("the query text reads its sizes from the budget", () => {
  test("no page size is hardcoded in the press query", async () => {
    const src = await readFile(new URL("../lib/printavo.ts", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const start = code.indexOf("query GorillaPressActivity");
    const query = code.slice(start, code.indexOf("`,", start));

    assert.match(query, /lineItemGroups\(first: \$\{PRESS_PAGE\.lineItemGroups\}\)/);
    assert.match(query, /lineItems\(first: \$\{PRESS_PAGE\.lineItems\}\)/);
    assert.doesNotMatch(
      query,
      /(lineItemGroups|lineItems)\(first: \d+\)/,
      "a literal page size here bypasses the cost model — the bug this file exists for"
    );
  });
});
