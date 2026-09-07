/**
 * The blended garment price — the number apparel shows before sizes exist
 * (handoff "give apparel a number", 29–31 Aug 2026).
 *
 * The mix shares are Gabe's decision as literal figures, pinned like the
 * price sheet pins totals: changing the assumption must be a readable
 * diff, not a side effect. Everything else is read from the live
 * catalogue at runtime; here it is exercised against the committed capture
 * of the real production catalog plus crafted colours for the edge rows.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  ASSUMED_EXTENDED_MIX,
  baseGarmentUnitPrice,
  blendedGarmentUnitPrice,
  describeAssumedMix,
  exactGarmentTotal,
  garmentUnitPriceFromSizes,
} from "../lib/apparel-blend";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { isStickerOrder } from "../lib/sticker-repricing";

const CATALOG = JSON.parse(
  readFileSync(
    new URL("./e2e/fixtures/ss-catalog-live-2026-08-25.json", import.meta.url),
    "utf8"
  )
);

type Color = Parameters<typeof blendedGarmentUnitPrice>[0];

function color(name: string, prices: Record<string, number>): Color {
  return {
    colorName: name,
    colorHex: "#000000",
    swatchImage: null,
    frontImage: null,
    backImage: null,
    sideImage: null,
    isAvailable: true,
    outOfStock: false,
    sizes: Object.entries(prices).map(([sizeName, markedUpPrice], i) => ({
      sku: `TEST${i}`,
      sizeName,
      markedUpPrice,
      isAvailable: true,
      outOfStock: false,
    })),
  } as Color;
}

describe("the assumption is Gabe's, as literal figures", () => {
  test("15% oversize: 9% 2XL, 6% 3XL — set 2026-08-29", () => {
    assert.deepEqual(ASSUMED_EXTENDED_MIX, [
      { size: "2XL", share: 0.09 },
      { size: "3XL", share: 0.06 },
    ]);
  });

  test("the on-screen sentence derives from the same table", () => {
    assert.equal(
      describeAssumedMix(),
      "Assumes about 15% of the order is 2XL or 3XL."
    );
  });
});

describe("the blend, against the real production catalog", () => {
  const starterTee = CATALOG.products.find(
    (p: { customerLabel: string }) => p.customerLabel === "Basic Tee"
  );
  const white = starterTee.colors.find(
    (c: { colorName: string }) => c.colorName === "White"
  );

  test("Gildan 2000 White: base is the standard-size price", () => {
    // At the matrix's base markup (150%) since 6 Sep: the $3.49 the
    // catalogue served at 40% is $6.23 at 2.5 × cost, and the lower tiers
    // are served alongside it.
    assert.equal(baseGarmentUnitPrice(white), 6.23);
    assert.equal(baseGarmentUnitPrice(white, 1.4), 5.98);
    assert.equal(baseGarmentUnitPrice(white, 1.3), 5.73);
  });

  test("Gildan 2000 White blends to the hand-computed figure", () => {
    // base 6.23; 2XL 11.25 (+5.02), 3XL 16.38 (+10.15)
    // 6.23 + 0.09×5.02 + 0.06×10.15 = 7.2908 → ceil to 5¢ = 7.30
    assert.equal(blendedGarmentUnitPrice(white), 7.3);
  });

  test("every catalog colour blends to a clean 5-cent figure at or above base", () => {
    for (const product of CATALOG.products) {
      for (const c of product.colors) {
        const blended = blendedGarmentUnitPrice(c);
        const base = baseGarmentUnitPrice(c);

        assert.ok(blended >= base, `${product.customerLabel} ${c.colorName}`);
        assert.equal(
          Math.round(blended * 100) % 5,
          0,
          `${c.colorName} blended to ${blended}`
        );
      }
    }
  });
});

describe("sizes the style does not carry drop out, never substitute", () => {
  test("a style that stops at 2XL contributes no 3XL row", () => {
    const stopsAt2XL = color("Test", { M: 5.0, L: 5.0, "2XL": 7.0 });

    // 5.00 + 0.09×2.00, no 3XL term → 5.18 → ceil-to-5¢ 5.20
    assert.equal(blendedGarmentUnitPrice(stopsAt2XL), 5.2);
  });

  test("a colour sold only in extended sizes prices from what exists", () => {
    const extendedOnly = color("Heather Marmalade-ish", {
      XS: 5.87,
      "3XL": 9.87,
    });

    assert.equal(baseGarmentUnitPrice(extendedOnly), 5.87);
    // 5.87 + 0.06×4.00 = 6.11 → 6.15 after ceil-to-5¢
    assert.equal(blendedGarmentUnitPrice(extendedOnly), 6.15);
  });

  test("an extended size CHEAPER than base never discounts the blend", () => {
    const odd = color("Odd", { M: 8.0, "2XL": 7.0 });

    assert.equal(blendedGarmentUnitPrice(odd), 8.0);
  });
});

describe("real sizes replace the assumption with per-SKU pricing", () => {
  const mixed = color("Mixed", { M: 3.49, "2XL": 6.3, "3XL": 9.17 });

  test("the exact total is the SKU sum", () => {
    assert.equal(
      exactGarmentTotal(mixed, { M: 12, "2XL": 6, "3XL": 6 }),
      12 * 3.49 + 6 * 6.3 + 6 * 9.17
    );
  });

  test("the per-shirt unit is a clean 2dp ceiling of the SKU sum", () => {
    // (12×3.49 + 12×6.30) / 24 = 4.895 → 4.90. Printavo stores a unit and
    // multiplies, so the garment component must be unit × quantity of a
    // 2dp figure — the raw division re-opens the documented 4dp drift.
    assert.equal(
      garmentUnitPriceFromSizes(mixed, { M: 12, "2XL": 12 }, 24),
      4.9
    );
  });

  test("a phantom size in the grid is skipped, not invented", () => {
    assert.equal(exactGarmentTotal(mixed, { M: 10, "5XL": 4 }), 10 * 3.49);
  });
});

describe("the estimate composes through the real engine", () => {
  test("Stacey-shaped: 20 shirts, 3 colours, 1 location, dark garment", () => {
    // A fixed $4.10 garment unit (the legacy single figure) so this is the
    // PRINT composition under the matrix: 3 colours plus the underbase is
    // 4 colours; 20 shirts print at the 24 row's 4c cell ($9.70) × 24
    // (never pay more); screens 4 × 1 × $25 = $100.
    const pricing = calculateApparelPricing({
      quantity: 20,
      garmentUnitPrice: 4.1,
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: true,
    });

    assert.equal(pricing.garmentTotal.toFixed(2), "82.00");
    assert.equal(pricing.inkColorCount, 4, "the underbase is a colour");
    assert.equal(pricing.printTierQuantity, 24);
    assert.equal(pricing.printTotal.toFixed(2), "232.80");
    assert.equal(pricing.setupTotal.toFixed(2), "100.00");
    assert.equal(pricing.total.toFixed(2), "414.80");
  });
});

describe("THE THING THAT MUST NOT HAPPEN (handoff Task 4)", () => {
  test("a priced apparel payload never classifies as auto-billing", () => {
    // isStickerOrder() decides which submissions get a live payable link
    // with no human in the loop. Giving apparel a computed total is exactly
    // the kind of change that could make it look like a sticker order to
    // that gate. This payload mirrors what buildQuotePayload sends for a
    // PRICED configurator order — real total, quoteRequired false — and it
    // must still be refused a payment link.
    const pricedApparelOrder = {
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "Basic Tee",
        quantity: 24,
        garmentColor: "White",
        printLocations: ["Front"],
        inkColors: "1 color",
        sizeBreakdown: "",
        specialOrder: false,
        supplier: {
          source: "S&S Activewear",
          productName: "Basic Tee",
          catalogStyle: "39",
          sku: "B00760004",
        },
      },
      pricing: {
        total: 252.76,
        quoteRequired: false,
      },
    };

    assert.equal(isStickerOrder(pricedApparelOrder), false);
  });
});
