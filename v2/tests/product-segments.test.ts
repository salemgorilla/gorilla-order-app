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
    // Since the 6 Sep flip the status line is the estimate promise, not the
    // hand quote it was; the description must not repeat that either, and
    // the line must never call the figure a price (the handoff's rule).
    assert.doesNotMatch(apparel.description, /estimate/i);
    assert.match(apparel.fulfilment, /estimate/i);
    assert.doesNotMatch(apparel.fulfilment, /price/i);
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

  test("the large-format segment is labelled, and its cards match the others", () => {
    /**
     * The band used to be full width — a different SHAPE for a different
     * kind of thing. By 7 Sep it was not a different kind of thing: signs
     * and banners pay online exactly as stickers do, and Gabe asked for the
     * four cards uniform. The segment keeps its rule-label (large format IS
     * a different department); the cards no longer claim a second
     * distinction the business does not make.
     */
    assert.match(page, /Large format/);
    assert.doesNotMatch(page, /flex w-full min-h-\[44px\]/);
    // Both segments render through the one component.
    assert.equal((page.match(/<ProductCard/g) || []).length, 2);
  });
});

describe("the group survives the visual split", () => {
  test("all three options sit in one labelled group", () => {
    // The band is a different SHAPE, not a different question. Without this
    // a screen reader meets two cards and then an unrelated button.
    assert.match(page, /role="group"\s+aria-labelledby="product-heading"/);
    assert.match(page, /id=\{currentStepId === "product" \? "product-heading" : undefined\}/);
  });

  test("every option is a toggle button", () => {
    // One component draws all four cards, so one aria-pressed covers them —
    // and page.tsx must no longer carry a hand-built card of its own.
    const card = readFileSync(
      new URL("../components/ProductCard.tsx", import.meta.url),
      "utf8"
    );
    assert.match(card, /aria-pressed=\{isSelected\}/);
    assert.doesNotMatch(page, /product\.fulfilment/);
  });
});

describe("only the pay-online paths are coloured", () => {
  test("the green marks self-billing, and only self-billing", () => {
    /**
     * The colour is driven off /pay online/, which
     * tests/product-fulfilment.test.ts pins to the SERVER functions that
     * decide which flows actually take money — isStickerOrder() and
     * decideSignsAutoBill(). So the green cannot drift away from the thing
     * it is claiming.
     *
     * Three cards earn it since 7 Sep, not one (Gabe: "All 3 should be
     * instant price - pay online"). What the colour means is unchanged —
     * "you can pay for this right now" — and the one card without it is the
     * one flow that genuinely cannot: apparel, an estimate the shop confirms
     * against a supplier catalogue before invoicing.
     */
    const claiming = productCategories.filter((p) =>
      /pay online/i.test(p.fulfilment)
    );

    assert.deepEqual(claiming.map((p) => p.id).sort(), [
      "banners",
      "signs",
      "stickers",
    ]);

    const quiet = productCategories.filter(
      (p) => !/pay online/i.test(p.fulfilment)
    );

    assert.deepEqual(quiet.map((p) => p.id), ["apparel"]);
  });

  test("apparel's status line stays muted, and never says price", () => {
    // The handoff's standing language rule: apparel is an ESTIMATE. It is
    // the one card that must not read as money settled.
    const apparel = productCategories.find((p) => p.id === "apparel");

    assert.ok(apparel);
    assert.doesNotMatch(apparel.fulfilment, /pay online/i);
    assert.match(apparel.fulfilment, /estimate/i);
  });

  test("the band explains its delivery caveat once", () => {
    /**
     * ONCE means once for the segment, not once per card. The band holds two
     * pipelines since the split, and since 7 Sep both pay online — what the
     * note now carries is the one thing that price does NOT cover, which is
     * shipping (lib/auto-bill.ts says why that is safe). The note sits on the
     * first card and the second stays quiet, because the same sentence twice
     * in adjacent cards reads as a bug.
     */
    const noted = productCategories.filter(
      (p) => p.segment === "large-format" && p.note
    );

    assert.equal(noted.length, 1, "the segment's note appears " + noted.length + " times");
    assert.match(noted[0].note ?? "", /separately/i);

    // The cards have no room for a second line and do not get one.
    for (const product of productCategories.filter(
      (p) => p.segment === "decorated"
    )) {
      assert.equal(product.note, undefined, `${product.title} has a note`);
    }
  });
});
