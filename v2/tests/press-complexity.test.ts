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
  PRINTAVO_MAX_PAGE,
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

  test("the clamp is the SMALLER of the two limits", () => {
    // Written when complexity was the only limit, and it asserted that one
    // more invoice than the clamp would break the cap. With Printavo's page
    // limit now binding first, that is no longer true - 26 invoices cost far
    // less than 25,000 - and the right claim is that the clamp is whichever
    // limit is tighter.
    const perInvoice = pressQueryComplexity({ ...PRESS_PAGE, invoices: 1 }) - 2;
    const byComplexity = Math.floor((PRINTAVO_MAX_COMPLEXITY - 2) / perInvoice);

    assert.equal(maxPressInvoices(), Math.min(PRINTAVO_MAX_PAGE, byComplexity));
    assert.ok(pressQueryComplexity({ ...PRESS_PAGE, invoices: maxPressInvoices() }) <= PRINTAVO_MAX_COMPLEXITY);
    assert.ok(
      pressQueryComplexity({ ...PRESS_PAGE, invoices: byComplexity + 1 }) > PRINTAVO_MAX_COMPLEXITY,
      "the complexity bound itself moved"
    );
  });

  test("the invoice page is as large as Printavo allows, and no larger", () => {
    // This used to assert `>= 40`, on the reasoning that the hero counts a
    // week so the invoice count decides completeness. Printavo caps every
    // list at 25 ('first' must not be greater than 25), so 40 was never
    // askable; the production error on 19 October said so. 25 is the most
    // the API will give, and an invoice beyond it is undercounted - the safe
    // direction.
    assert.equal(PRESS_PAGE.invoices, PRINTAVO_MAX_PAGE);
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

describe("the clamp honours BOTH of Printavo's limits", () => {
  test("a caller asking for more than a page still gets a page", () => {
    // Complexity alone allowed 48 invoices. Printavo allows 25. The clamp
    // was the one place that could have caught the mistake, and it read only
    // one of the two limits.
    assert.equal(maxPressInvoices(), PRINTAVO_MAX_PAGE);
    assert.ok(
      pressQueryComplexity({ ...PRESS_PAGE, invoices: 48 }) <= PRINTAVO_MAX_COMPLEXITY,
      "48 fits the COMPLEXITY cap - which is exactly why complexity alone was not enough"
    );
  });
});

describe("no connection in this file asks for more than Printavo allows", () => {
  // 19 October: `'first' must not be greater than 25`, from the press query
  // (40 invoices). The same mistake was already sitting in the reconciler's
  // line-item query (50) and in the `sizes` fallback shape (50) - neither had
  // ever run, so neither had ever failed. This reads the whole file so a
  // fourth cannot be added.
  test("every literal `first:` is within the cap", async () => {
    const src = await readFile(new URL("../lib/printavo.ts", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const found = [...code.matchAll(/\bfirst:\s*(\d+)/g)].map((m) => Number(m[1]));

    // Four are written as literals (contacts, sizes fallback, reconciler groups
    // and lines); the others read a named value, which the next test covers.
    assert.ok(found.length >= 4, `expected to find the file's literal page sizes, found ${found.length}`);

    for (const n of found) {
      assert.ok(n <= PRINTAVO_MAX_PAGE, `a query asks for first: ${n}; Printavo's limit is ${PRINTAVO_MAX_PAGE}`);
    }
  });

  test("so is every named page size a query reads", async () => {
    const src = await readFile(new URL("../lib/printavo.ts", import.meta.url), "utf8");
    const named = /const ORDER_SEARCH_PAGE_SIZE = (\d+)/.exec(src);

    assert.ok(named, "ORDER_SEARCH_PAGE_SIZE moved - update this test");
    assert.ok(Number(named[1]) <= PRINTAVO_MAX_PAGE);
    assert.ok(PRESS_PAGE.lineItemGroups <= PRINTAVO_MAX_PAGE);
    assert.ok(PRESS_PAGE.lineItems <= PRINTAVO_MAX_PAGE);
  });
});
