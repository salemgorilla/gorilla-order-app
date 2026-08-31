/**
 * Phantom sizes in the apparel grid — the defect and its wiring.
 *
 * The size grid's rows derive from the selected COLOR's size run, but the
 * typed counts live in their own state. Before the prune, switching from a
 * Starter Tee (M-12, L-12 entered) to a colour S&S stocks only in
 * XS/3XL/4XL left the badge saying "24 shirts" over a grid of three zero
 * rows: the counts still totalled, still validated (quantity IS the grid
 * total, so the reconciliation flag is honestly always true), and would
 * have shipped a payload whose size breakdown the chosen colour cannot be
 * ordered in — with no control on screen to see or fix it. Found by
 * driving the live catalog in Chromium, not by a unit test, which is why
 * the wiring pins below exist alongside the function tests.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { pruneSizeQuantities } from "../lib/size-quantities";

test("sizes the new colour does not offer are dropped", () => {
  const { quantities, breakdown } = pruneSizeQuantities(
    { M: 12, L: 12 },
    ["XS", "3XL", "4XL"]
  );

  assert.deepEqual(quantities, {});
  assert.equal(breakdown, "");
});

test("sizes that carry over survive a colour switch", () => {
  const { quantities, breakdown } = pruneSizeQuantities(
    { M: 12, L: 12, "5XL": 2 },
    ["S", "M", "L", "XL", "2XL", "3XL"]
  );

  assert.deepEqual(quantities, { M: 12, L: 12 });
  assert.equal(breakdown, "M-12, L-12");
});

test("zero and negative rows never survive the prune", () => {
  const { quantities, breakdown } = pruneSizeQuantities(
    { M: 0, L: 6 },
    ["M", "L"]
  );

  assert.deepEqual(quantities, { L: 6 });
  assert.equal(breakdown, "L-6");
});

test("an untouched grid prunes to an untouched grid", () => {
  const { quantities, breakdown } = pruneSizeQuantities({}, ["S", "M", "L"]);

  assert.deepEqual(quantities, {});
  assert.equal(breakdown, "");
});

// ── Wiring pins ─────────────────────────────────────────────────────────
// The function is only a fix if both paths that change the colour call it:
// picking a colour directly, and picking a product (which auto-selects the
// product's first colour). These pins fail if either call is removed.

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("picking a colour prunes the grid to that colour's sizes", () => {
  const handler = page.slice(
    page.indexOf("function handleSsColorSelect"),
    page.indexOf("function handleSsSizeSelect")
  );

  assert.match(handler, /pruneSizeQuantitiesToColor\(color\)/);
});

test("picking a product prunes the grid to its first colour's sizes", () => {
  const handler = page.slice(
    page.indexOf("function handleSsProductSelect"),
    page.indexOf("function handleApparelCategorySelect")
  );

  assert.match(handler, /pruneSizeQuantitiesToColor\(firstColor\)/);
});

test("the prune helper delegates to the tested function", () => {
  assert.match(page, /pruneSizeQuantities\(current, available\)/);
});
