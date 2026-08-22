import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { productCategories } from "../lib/products";

/**
 * How step 01 divides the shop, and what each option is allowed to say.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Three equal cards implied three equal choices. The Banners card then said
 * both of these at once:
 *
 *   Beta                          (badge)
 *   Instant price · we invoice    (fulfilment line)
 *
 * "This returns a real price" and "this is unfinished", in the same breath,
 * on the one card that already does the hard thing. The pricing is real —
 * confirmed with Gabe — so the badge was not a caution, it was
 * self-deprecation on a working product, sitting exactly where a buyer
 * decides whether to trust it.
 *
 * Apparel had the same duplication in a milder form: a "By request" badge, a
 * "Quoted by hand" fulfilment line, and "Quoted by hand, usually same day"
 * trailing its description — one fact told three times in three vocabularies.
 *
 * ── WHAT REPLACED IT ──────────────────────────────────────────────────────
 * A split on something true: decoration (stickers, apparel) versus large
 * format (banners, yard signs, rigid signs, posters, window graphics). That
 * is a real production distinction — different equipment, different
 * substrate, different department — so each segment can state its own terms
 * without contradicting its neighbour.
 *
 * These assertions are about the DATA and about the rendered source, because
 * this repo has no React test renderer. The markup checks read app/page.tsx
 * as text — crude, but it is the difference between asserting the card grid
 * is two-up and hoping it is.
 */

const pageSource = readFileSync(
  new URL("../app/page.tsx", import.meta.url),
  "utf8"
);

/**
 * The source with comments removed.
 *
 * A comment saying WHY the Beta badge is gone is worth keeping, and a naive
 * grep for "Beta" cannot tell it apart from a badge that is still rendered.
 * Stripping /* … *\/ blocks — which covers both the JS comments and the
 * {/* … *\/} JSX ones — leaves only text that can actually reach a buyer.
 */
const page = pageSource.replace(/\/\*[\s\S]*?\*\//g, "");

describe("every option says exactly one thing about itself", () => {
  test("no product carries a badge any more", () => {
    for (const product of productCategories) {
      assert.ok(
        !("badge" in product),
        `${product.title} still has a badge field`
      );
    }
  });

  test("neither Beta nor By request can be rendered", () => {
    // Asserted against the source rather than the data: a badge deleted from
    // products.tsx but left hardcoded in the view would still reach a buyer.
    assert.doesNotMatch(page, /["'>]Beta[<"']/);
    assert.doesNotMatch(page, /By request/);

    for (const product of productCategories) {
      assert.doesNotMatch(product.description, /beta|by request/i);
    }
  });

  test("apparel's description no longer repeats its status line", () => {
    const apparel = productCategories.find((p) => p.id === "apparel");

    assert.ok(apparel);
    assert.doesNotMatch(apparel.description, /quoted by hand/i);
    assert.match(apparel.fulfilment, /hand quote/i);
    assert.match(apparel.fulfilment, /same day/i);
  });
});

describe("the split is on how the work is made", () => {
  test("every product declares a segment", () => {
    for (const product of productCategories) {
      assert.ok(
        product.segment === "decorated" || product.segment === "large-format",
        `${product.title} has segment ${product.segment}`
      );
    }
  });

  test("stickers and apparel are decorated; banners are large format", () => {
    const segmentOf = (id: string) =>
      productCategories.find((p) => p.id === id)?.segment;

    assert.equal(segmentOf("stickers"), "decorated");
    assert.equal(segmentOf("apparel"), "decorated");
    assert.equal(segmentOf("signs"), "large-format");
  });

  test("the card grid is two-up, and the band is not in it", () => {
    // The grid drops to md:grid-cols-2 because it now holds two cards. If
    // someone re-adds a third product to the decorated segment without
    // widening this, the layout is wrong and nothing else would say so.
    const decorated = productCategories.filter(
      (p) => p.segment === "decorated"
    );

    assert.equal(decorated.length, 2);
    assert.match(page, /grid gap-4 md:grid-cols-2/);
    assert.doesNotMatch(page, /grid gap-4 md:grid-cols-3/);
  });

  test("the large-format band is labelled and full width", () => {
    assert.match(page, /Large format/);
    assert.match(page, /flex w-full min-h-\[44px\]/);
  });
});

describe("the group survives the visual split", () => {
  test("all three options sit in one labelled group", () => {
    // The band is a different SHAPE, not a different question. Without this
    // a screen reader meets two cards and then an unrelated button.
    assert.match(page, /role="group"\s+aria-labelledby="product-heading"/);
    assert.match(page, /id=\{currentStepId === "product" \? "product-heading" : undefined\}/);
  });

  test("the band is a toggle button like the cards", () => {
    // Two aria-pressed usages on this screen: the cards and the band.
    const pressed = page.match(/aria-pressed=\{isSelected\}/g) || [];
    assert.ok(pressed.length >= 2, `found ${pressed.length} aria-pressed toggles`);
  });
});

describe("only the pay-online path is coloured", () => {
  test("exactly one product's status line earns the green", () => {
    // The colour is driven off /pay online/, which
    // tests/product-fulfilment.test.ts already pins to isStickerOrder() — the
    // server function that decides which flow actually takes money. So the
    // green cannot drift away from the thing it is claiming.
    const claiming = productCategories.filter((p) =>
      /pay online/i.test(p.fulfilment)
    );

    assert.equal(claiming.length, 1);
    assert.equal(claiming[0].id, "stickers");
    assert.equal(claiming[0].segment, "decorated");
  });

  test("the band's own status line stays muted", () => {
    const signs = productCategories.find((p) => p.id === "signs");

    assert.ok(signs);
    assert.doesNotMatch(signs.fulfilment, /pay online/i);
    assert.match(signs.fulfilment, /invoice/i);
  });

  test("the band explains the invoicing model once", () => {
    const signs = productCategories.find((p) => p.id === "signs");

    assert.ok(signs?.note);
    assert.match(signs.note, /invoice/i);

    // The cards have no room for a second line and do not get one.
    for (const product of productCategories.filter(
      (p) => p.segment === "decorated"
    )) {
      assert.equal(product.note, undefined, `${product.title} has a note`);
    }
  });
});
