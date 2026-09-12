import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DECAL_SHIPPING_PRICE,
  describeStickerSize,
  getCartSetupFee,
  getShippingPrice,
  getStickerMaterialPrice,
  getStickerPrice,
  getStickerUnitPrice,
  parseStickerSizeInches,
  STICKER_SETUP_FEE,
  STICKER_SETUP_FEE_ADDITIONAL,
} from "../lib/pricing";
import { repriceStickers } from "../lib/sticker-repricing";

/**
 * The sticker pricing engine.
 *
 * money-path.test.ts covers what this ADDS UP TO, through repriceStickers and
 * the Printavo plan. Nothing covered the pieces, and two defects were living
 * in them — both in the fallback path that runs when the real dimensions are
 * missing, which is precisely the path nobody exercises by hand.
 *
 * The formula, from the shop, 2026-08-05:
 *
 *   material per sticker = area in sq in x $0.032
 *   setup                = $25 first design, $12.50 each after
 *
 * Area is the BOUNDING BOX — a circle is priced on the square it is cut from,
 * because that is what comes off the roll.
 */

const VINYL = "Gloss White Vinyl";
// $0.34 per sticker + $0.04 per square inch: 100 x 3" is $70 of stickers at a
// $15 setup, which is the $85 everything is anchored to.
const RATE = 0.04;
const PER_PIECE = 0.34;

describe("the formula is the formula", () => {
  test("material is area x rate x quantity", () => {
    // 3" x 3": (0.34 x 0.80 per piece + 9 x 0.04 x 0.39 per area) x 1000 —
    // the two volume curves at 1,000 (tests/sticker-volume.test.ts) = $412.40.
    assert.equal(
      getStickerMaterialPrice(1000, VINYL, '3"', { widthInches: 3, heightInches: 3 }),
      412.4
    );
  });

  test("a rectangle is priced on its real area, not its longest side", () => {
    // 2 x 6 = 12 sq in, not 36 and not 4.
    assert.equal(
      getStickerMaterialPrice(100, VINYL, "", { widthInches: 2, heightInches: 6 }),
      Math.round((PER_PIECE + 12 * RATE) * 100 * 100) / 100
    );
  });

  test("getStickerPrice is the material plus one setup fee", () => {
    // Which is exactly a one-design cart, and is why the cart migration left
    // single-design prices untouched.
    assert.equal(
      getStickerPrice(1000, VINYL, "Gloss", '3"', { widthInches: 3, heightInches: 3 }),
      412.4 + STICKER_SETUP_FEE
    );
  });

  test("finish does not change the price", () => {
    // Matte and gloss cost the same. The parameter is carried for the shop's
    // benefit, not the arithmetic's.
    const dims = { widthInches: 3, heightInches: 3 };

    assert.equal(
      getStickerPrice(500, VINYL, "Gloss", '3"', dims),
      getStickerPrice(500, VINYL, "Matte", '3"', dims)
    );
  });

  test("chrome and holographic mark up the material only", () => {
    const dims = { widthInches: 3, heightInches: 3 };
    const plain = getStickerMaterialPrice(100, VINYL, '3"', dims);

    // The old site's rates, restored 2026-09-12: chrome +30%, holographic
    // +35%. Both had been a guessed +60%.
    for (const [premium, markup] of [["Chrome", 1.3], ["Holographic", 1.35]] as const) {
      assert.equal(
        getStickerMaterialPrice(100, premium, '3"', dims),
        Math.round(plain * markup * 10000) / 10000,
        premium
      );

      // The setup fee is labour, identical whichever substrate goes on the
      // machine, so it must NOT carry the markup.
      assert.equal(
        getStickerPrice(100, premium, "Gloss", '3"', dims) -
          getStickerMaterialPrice(100, premium, '3"', dims),
        STICKER_SETUP_FEE,
        premium
      );
    }
  });

  test("the per-sticker curve never turns back up", () => {
    // The old seven-rung table went UP per sticker above 1000. Material is
    // constant per unit and setup only ever amortises further, so this class
    // of bug is meant to be impossible — asserted rather than assumed.
    const dims = { widthInches: 3, heightInches: 3 };
    let previous = Infinity;

    for (const qty of [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
      const unit = getStickerUnitPrice(qty, VINYL, "Gloss", '3"', dims);
      assert.ok(unit <= previous, `unit price rose at ${qty}: ${unit} > ${previous}`);
      previous = unit;
    }
  });
});

describe("setup is per design, once per cart", () => {
  test("one design is exactly the old flat fee", () => {
    // The cart must not quietly reprice the common case.
    assert.equal(getCartSetupFee(1), STICKER_SETUP_FEE);
  });

  test("each design after the first is half", () => {
    assert.equal(getCartSetupFee(2), 22.5);
    assert.equal(getCartSetupFee(3), 30);
    assert.equal(
      getCartSetupFee(4),
      STICKER_SETUP_FEE + STICKER_SETUP_FEE_ADDITIONAL * 3
    );
  });

  test("nonsense design counts still cost one setup", () => {
    for (const n of [0, -3, Number.NaN]) {
      assert.equal(getCartSetupFee(n), STICKER_SETUP_FEE, String(n));
    }
  });

  test("the agreed cart price for three designs", () => {
    // From CART-PLAN: 3 x 100 x 3" shipped. It was $148.40 at the old rate;
    // the 2026-09-11 re-rate moved it to $227.00, and the 2026-09-12
    // rebalance ($15 setup, more on the rate) to $252.00. The figure changed, the
    // property it exists for did not — a cart still costs less than three
    // separate orders, which is checked in tests/price-sheet.test.ts.
    const material = getStickerMaterialPrice(100, VINYL, '3"', {
      widthInches: 3,
      heightInches: 3,
    });

    const total = material * 3 + getCartSetupFee(3) + DECAL_SHIPPING_PRICE;

    assert.equal(Math.round(total * 100) / 100, 252);
  });
});

describe("shipping", () => {
  test("mailed orders carry the tier for their goods, pickup is free", () => {
    // The old site's tiers, by goods subtotal. $12 — the old flat rate — is
    // the $75-$200 tier, which is where a typical single-design order sits.
    assert.equal(getShippingPrice("Ship", 85), DECAL_SHIPPING_PRICE);
    assert.equal(getShippingPrice("Ship", 40), 8);
    assert.equal(getShippingPrice("Ship", 75), 8);
    assert.equal(getShippingPrice("Ship", 75.01), 12);
    assert.equal(getShippingPrice("Ship", 200), 12);
    assert.equal(getShippingPrice("Ship", 350), 18);
    assert.equal(getShippingPrice("Ship", 500), 18);
    assert.equal(getShippingPrice("Ship", 501), 25);
    assert.equal(getShippingPrice("Ship", 5000), 25);
    assert.equal(getShippingPrice("Pickup", 5000), 0);
    // Anything unrecognised must not invent a charge.
    assert.equal(getShippingPrice("", 5000), 0);
    // And a missing subtotal is the cheapest tier, never a crash.
    assert.equal(getShippingPrice("Ship"), 8);
  });
});

describe("reading a size label", () => {
  /**
   * Only reached when the real dimensions are missing — which is exactly when
   * the label is the only thing left to price from.
   */
  test("a preset is one number, and square", () => {
    assert.equal(parseStickerSizeInches('3"'), 3);
    assert.equal(parseStickerSizeInches("3"), 3);
    assert.equal(parseStickerSizeInches(3), 3);
    assert.equal(parseStickerSizeInches('3.375"'), 3.375);
  });

  test("an unreadable label is not a size", () => {
    assert.equal(parseStickerSizeInches("large"), 0);
    assert.equal(parseStickerSizeInches(""), 0);
  });

  test("a WxH label prices as a rectangle, not as its first number", () => {
    // THE DEFECT. parseStickerSizeInches takes the FIRST match, so '2" x 6"'
    // read as 2 and the fallback priced twelve square inches as four —
    // $12.80 per hundred instead of $38.40.
    const withDims = getStickerMaterialPrice(100, VINYL, "", {
      widthInches: 2,
      heightInches: 6,
    });

    assert.equal(getStickerMaterialPrice(100, VINYL, '2" x 6"'), withDims);
    assert.equal(getStickerMaterialPrice(100, VINYL, "2 x 6 in"), withDims);
  });

  test("real dimensions still win over the label", () => {
    // The label is a fallback, never an override.
    assert.equal(
      getStickerMaterialPrice(100, VINYL, '3"', { widthInches: 2, heightInches: 6 }),
      getStickerMaterialPrice(100, VINYL, "", { widthInches: 2, heightInches: 6 })
    );
  });

  test("describeStickerSize prefers the real dimensions", () => {
    assert.equal(
      describeStickerSize('3"', { widthInches: 2, heightInches: 6 }),
      '2" x 6"'
    );
    assert.equal(describeStickerSize('3"', { widthInches: 0, heightInches: 0 }), '3"');
  });
});

describe("nothing auto-bills at a price nobody set", () => {
  /**
   * ── THE ONE THAT MATTERS ──────────────────────────────────────────────
   * Material is area x rate, so a payload with no width, no height and no
   * usable label priced at exactly $0 and said nothing. A submission for
   * 1,000 stickers came out of repriceStickers at $25 — the setup fee alone —
   * and stickers self-check-out, so that was a live payable link at a price
   * nobody set.
   *
   * The browser validates width and height, so this is not reachable through
   * the form. That is the point: repriceStickers exists BECAUSE the browser
   * is not the authority on price, and it was trusting the browser for the
   * one input the price is computed from.
   */
  const stickerOrder = (items: Record<string, unknown>[]) => ({
    customer: { customerName: "T", email: "t@example.com" },
    production: { deliveryMethod: "Pickup" },
    product: { type: "Custom Stickers", quantity: 1 },
    items,
    pricing: { total: 0 },
  });

  const good = {
    quantity: 500,
    material: VINYL,
    size: '3" x 3"',
    widthInches: 3,
    heightInches: 3,
  };

  test("an ordinary order is priced and bills", () => {
    const priced = repriceStickers(stickerOrder([good]));

    assert.equal(priced.unpriceable, false);
    // 500 x (0.34 x 0.85 + 9 x 0.04 x 0.47) = $229.10 on the two curves.
    assert.equal(priced.serverTotal, 229.1 + STICKER_SETUP_FEE);
  });

  test("a design with no dimensions is flagged, not billed", () => {
    const priced = repriceStickers(
      stickerOrder([{ quantity: 1000, material: VINYL }])
    );

    assert.equal(priced.unpriceable, true);
    // Still priced and still sent to the shop — only the link is withheld.
    assert.equal(priced.serverTotal, STICKER_SETUP_FEE);
  });

  test("negative dimensions are flagged too", () => {
    const priced = repriceStickers(
      stickerOrder([
        { quantity: 1000, material: VINYL, widthInches: -5, heightInches: -5 },
      ])
    );

    assert.equal(priced.unpriceable, true);
  });

  test("one broken design in a cart stops the whole cart billing", () => {
    // The good design cannot vouch for the bad one. A cart is one payment.
    const priced = repriceStickers(
      stickerOrder([good, { quantity: 500, material: VINYL }])
    );

    assert.equal(priced.unpriceable, true);
  });

  test("a WxH label alone is enough to price, and bills", () => {
    // The label fallback working is what keeps this from over-flagging an
    // older payload that never carried dimensions.
    const priced = repriceStickers(
      stickerOrder([{ quantity: 100, material: VINYL, size: '2" x 6"' }])
    );

    assert.equal(priced.unpriceable, false);
    // 100 x ($0.34 + 12 sq in x $0.04) = $82.
    assert.equal(priced.serverTotal, 82 + STICKER_SETUP_FEE);
  });

  test("a non-sticker order is never flagged by this", () => {
    // Signs and apparel are hand-priced and never auto-bill anyway; the flag
    // must not leak into their branch and mean something it does not.
    const priced = repriceStickers({
      customer: {},
      production: {},
      product: { type: "Banners & Signs", signType: "Banner" },
      pricing: { total: 120 },
    });

    assert.equal(priced.unpriceable, false);
  });
});
