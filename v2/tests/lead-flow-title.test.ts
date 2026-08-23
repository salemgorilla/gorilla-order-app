import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { productCategories } from "../lib/products";

/**
 * What the abandoned-quote email calls the product.
 *
 * The beacon sends `flow: selectedProductId` — a lowercase internal key —
 * and /api/lead printed it raw: "Product: banners", subject "(banners)".
 * The shop reads that email to decide whether a lead is worth a call, and
 * the card the customer actually clicked says "Vinyl Banners". Verified by
 * driving the beacon in a browser (fill an email on the banners flow, hide
 * the page) and reading the intercepted payload.
 *
 * Resolved against the real catalogue rather than a second id→name map, so
 * a renamed or added card can never drift from this email.
 */

const route = readFileSync(
  new URL("../app/api/lead/route.ts", import.meta.url),
  "utf8"
);

describe("every flow the beacon can send has a title to resolve to", () => {
  test("the four cards cover the four flow ids", () => {
    for (const id of ["stickers", "apparel", "banners", "signs"]) {
      const card = productCategories.find((product) => product.id === id);
      assert.ok(card, `no card for flow "${id}"`);
      assert.ok(card.title.length > 0);
    }
  });
});

describe("the route uses the title, and falls back to the raw id", () => {
  test("resolved from the catalogue, not a second map", () => {
    assert.match(
      route,
      /productCategories\.find\(\(product\) => product\.id === flow\)\?\.title \|\| flow/
    );
  });

  test("both places the shop reads it", () => {
    // The subject line is what a phone notification shows; the Product row
    // is what the follow-up call works from.
    assert.match(route, /\["Product", flowTitle\]/);
    assert.match(route, /\(\$\{flowTitle\}\)`/);
    // The raw id must not have survived in either spot.
    assert.doesNotMatch(route, /\["Product", flow\]/);
    assert.doesNotMatch(route, /\(\$\{flow\}\)`/);
  });
});
