import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  defaultSignsQuote,
  getSignDimensions,
  getSignProduct,
  getSignSizeLabel,
  getSizeOptions,
  signProducts,
  type SignsQuote,
} from "../lib/signs";
import { calculateSignsPricing } from "../lib/signs-pricing";

/**
 * The size the shop is told to make.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * getSignSizeLabel returned `quote.size`, a leftover preset LABEL from the
 * days when sizes were picked from a dropdown. Sizes are typed now, and
 * handleSignProductSelect sets `size` to getSizeOptions(product)[0] — the
 * product's first preset — so that string had nothing to do with what the
 * customer entered.
 *
 * A rigid sign typed at 25" x 37" priced correctly off 6.42 sqft and then
 * reported itself as 12" x 18". A banner reported 2' x 4'. A poster reported
 * 18" x 24". That value is not cosmetic: app/page.tsx puts it in the quote
 * payload as `product.size`, which reaches the shop email and Printavo. The
 * shop would have cut the wrong sign, from the right price.
 *
 * ── WHY IT IS ASSERTED AGAINST THE PRICE ──────────────────────────────────
 * The label and the money now come from one function, getSignDimensions, so
 * the test that matters is not "does the label look right" but "do the label
 * and the charge describe the same object". Checking the label's square
 * footage against the square footage the engine actually billed is the
 * closest a test can get to the invoice.
 */

function quoteFor(productId: string, overrides: Partial<SignsQuote> = {}) {
  const product = getSignProduct(productId);

  return {
    ...defaultSignsQuote,
    productId,
    // Exactly what handleSignProductSelect does when the product changes.
    size: getSizeOptions(product)[0],
    customSize: "",
    customWidthInches: 0,
    customHeightInches: 0,
    material: product.materials[0],
    finishing: product.finishing[0],
    ...overrides,
  } as SignsQuote;
}

/** Square feet named by a label like `25" x 37"`. */
function sqftFromLabel(label: string) {
  const match = /^([\d.]+)" x ([\d.]+)"$/.exec(label);
  assert.ok(match, `label is not a pair of dimensions: ${label}`);
  return (Number(match[1]) * Number(match[2])) / 144;
}

const TYPED = signProducts.filter(
  (p) => p.pricingMethod !== null && p.pricingMethod !== "yard"
);

describe("the label names the size the customer typed", () => {
  for (const product of TYPED) {
    test(`${product.label} reports 25" x 37", not a preset`, () => {
      const quote = quoteFor(product.id, {
        customWidthInches: 25,
        customHeightInches: 37,
      });

      assert.equal(getSignSizeLabel(quote), '25" x 37"');

      // The specific regression: the preset label it used to return.
      assert.notEqual(getSignSizeLabel(quote), quote.size);
    });
  }

  test("a yard sign reports the size the shop makes it at", () => {
    // Frozen at 18" x 24" — the customer never types it, and typed values are
    // ignored by getSignDimensions, so the label must ignore them too.
    const quote = quoteFor("yard-sign", {
      customWidthInches: 25,
      customHeightInches: 37,
    });

    assert.equal(getSignSizeLabel(quote), '18" x 24"');
  });

  test("nothing typed falls back to the preset the PRICE also uses", () => {
    /**
     * Not a contradiction of the above. getSignDimensions keeps a legacy
     * lookup — `product.sizes.find(s => s.label === quote.size)` — so a quote
     * with nothing typed resolves to the product's first preset, and the
     * engine charges for that same preset. Label and price still agree, which
     * is the invariant this file is about.
     *
     * Submitting in that state is now blocked anyway: getSignsFieldErrors
     * requires a width and a height for every product that types them.
     */
    assert.equal(getSignSizeLabel(quoteFor("vinyl-banner")), '48" x 24"');
    assert.equal(getSignSizeLabel(quoteFor("rigid-sign")), '18" x 12"');
    assert.equal(getSignSizeLabel(quoteFor("poster")), '24" x 18"');
  });

  test("a product with no size at all says so", () => {
    // Window graphics carries no sizes, so nothing resolves. Naming a size
    // here would be inventing one: this string reaches the shop.
    assert.equal(
      getSignSizeLabel(quoteFor("window-graphics")),
      "Size not specified"
    );
  });
});

describe("the label and the price describe the same sign", () => {
  const SIZES: Array<[number, number]> = [
    [24, 18],
    [25, 37],
    [96, 48],
    [11.5, 17.25],
  ];

  for (const product of TYPED) {
    for (const [widthInches, heightInches] of SIZES) {
      test(`${product.label} at ${widthInches}x${heightInches}`, () => {
        const quote = quoteFor(product.id, {
          customWidthInches: widthInches,
          customHeightInches: heightInches,
        });

        const priced = calculateSignsPricing({
          method: product.pricingMethod as "banner" | "poster" | "rigid",
          quantity: 1,
          sizeKey: "",
          ...getSignDimensions(quote),
          material: quote.material,
          doubleSided: false,
          stepStakes: false,
          finishing: quote.finishing,
          bannerAddOns: [],
        });

        assert.equal(priced.priceable, true, priced.reason);

        // sqftEach is rounded to 2dp by the engine, so compare at that scale.
        assert.equal(
          Math.round(sqftFromLabel(getSignSizeLabel(quote)) * 100) / 100,
          priced.sqftEach,
          "the label describes a different sign from the one being charged for"
        );
      });
    }
  }
});
