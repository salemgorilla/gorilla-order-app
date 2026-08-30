import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  createSignsDesignForFamily,
  createSignsQuote,
  defaultSignsDesign,
  getSignProduct,
  SIGN_FAMILIES,
} from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";

/**
 * A fresh design must wear its own product's spec.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * createSignsDesignForFamily overrode only productId, so the Signs
 * pipeline's default quote was a Yard Sign carrying the BASE defaults —
 * which are the banner's: size 3' x 6', material "13 oz Scrim Vinyl",
 * finishing "Hemmed + Grommets". Found on the mobile sweep, five days after
 * the hard split shipped it.
 *
 * Why nothing caught it: the price never moved (yard pricing keys on size,
 * and getSignDimensions freezes yard dimensions regardless of the stale
 * label), and one click on the product picker runs handleSignProductSelect,
 * which resets everything. Only the customer who accepted every default hit
 * it — and sent the shop a build sheet asking for a hemmed coroplast lawn
 * sign, with neither Finishing chip rendering as selected because
 * "Hemmed + Grommets" is not among a yard sign's options.
 */

describe("every family's default design wears its own product's spec", () => {
  for (const family of Object.keys(SIGN_FAMILIES) as (keyof typeof SIGN_FAMILIES)[]) {
    test(`${family}: material, finishing and size all belong to the product`, () => {
      const design = createSignsDesignForFamily(family);
      const product = getSignProduct(design.productId);

      assert.equal(product.family, family);
      assert.ok(
        product.materials.includes(design.material),
        `${design.material} is not a ${product.label} material`
      );
      assert.ok(
        product.finishing.includes(design.finishing),
        `${design.finishing} is not a ${product.label} finishing`
      );
      assert.ok(
        product.sizes.some((s) => s.label === design.size),
        `${design.size} is not a ${product.label} size`
      );
    });
  }

  test("the signs default is specifically a coroplast yard sign, signs only", () => {
    // The exact shape that shipped wrong: yard sign, scrim vinyl, hemmed.
    const design = createSignsDesignForFamily("signs");
    assert.equal(design.productId, "yard-sign");
    assert.equal(design.material, "Coroplast");
    assert.equal(design.finishing, "Signs Only");
  });

  test("the banners default is byte-for-byte the historical base default", () => {
    // The entry price the banners card quotes is computed from these; the
    // fix must not silently move the landing spec.
    const design = createSignsDesignForFamily("banners");
    const { id, ...rest } = design;
    const { id: baseId, ...base } = defaultSignsDesign;
    assert.deepEqual(
      { ...rest, templateText: {}, bannerAddOns: [], artwork: { file: null } },
      { ...base, templateText: {}, bannerAddOns: [], artwork: { file: null } }
    );
  });

  test("both families' default quotes still price online, at the known totals", () => {
    // Banners: the historical 3' x 6' scrim default the entry price quotes.
    // Signs: one 18" x 24" coroplast yard sign ($31) plus the $15 setup.
    // Literal figures on purpose, price-sheet style: a drift here is a
    // repricing and must be a readable diff, not a surprise.
    assert.equal(quoteSignsCart(createSignsQuote("banners").designs).total, 177);
    const signs = quoteSignsCart(createSignsQuote("signs").designs);
    assert.equal(signs.priceable, true);
    assert.equal(signs.total, 46);
  });
});
