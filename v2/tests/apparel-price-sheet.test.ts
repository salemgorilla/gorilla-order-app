/**
 * The apparel price sheet — the second line, exactly as price-sheet.test.ts
 * is for stickers: committed totals as LITERAL NUMBERS, so any edit that
 * moves an apparel price shows up as a readable diff and a repricing has to
 * be intended and reviewed rather than noticed later.
 *
 * Regenerate DELIBERATELY (scratchpad generator sweeps the engine and the
 * committed catalog fixture) and say why in the commit. Never "fix" a row
 * to make a failing test pass — a failing row IS the finding.
 *
 * REGENERATED 2026-11-11 FOR THE 3% RETAIL UPLIFT (Gabe: "we will increase
 * our retail price by 3% and discount those who pay via ACH"). Every print
 * cell, the screen fee and the blank are 3% up; the regeneration refused any
 * row further from (old x 1.03) than rounding allows (blends round up to the
 * nickel, so a blank can sit 3 to 5 cents off). The committed catalog
 * capture is from before the uplift, so retailCatalog() below lifts it the way
 * the server now does.
 *
 * Three sections:
 *  1. ANCHORS — figures verified OUTSIDE this suite, in a real browser this
 *     session (31 Aug 2026): Stacey's and Kurt's scenario runs and the
 *     audit driver's worked examples. These tie the sheet to reality.
 *  2. THE BLEND SHEET — the blended per-shirt garment price for every one
 *     of the 191 colours in the committed production catalog capture. A
 *     change to the mix table, the rounding, or the base-size rule moves
 *     this whole section visibly.
 *  3. THE ENGINE GRID — totals across quantity tiers, ink counts,
 *     locations and underbase at a fixed $4.10 garment unit (Basic Tee
 *     White's blended figure), including every tier boundary from both
 *     sides (23/24, 49/50, 99/100, 249/250).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  blendedGarmentUnitPrice,
  garmentPriceByMarkup,
} from "../lib/apparel-blend";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { retail2 } from "../lib/retail";

/**
 * The committed fixture is the live catalog AS CAPTURED on 25 Aug, before the
 * 3% retail uplift (Gabe, 2026-11-11). The live catalog now serves every
 * blank at retail — lib/ss-activewear.ts multiplies the marked-up price by
 * RETAIL_MULTIPLIER — so this sheet models that: each size's price is lifted
 * the same way the server does it. The fixture file itself is a capture and is
 * left as captured.
 */
function retailCatalog<T>(raw: T): T {
  type Size = { markedUpPrice: number; priceByMarkup?: Record<string, number> };
  const catalog = raw as unknown as {
    products: { colors: { sizes: Size[] }[] }[];
  };

  for (const product of catalog.products) {
    for (const color of product.colors) {
      for (const size of color.sizes) {
        size.markedUpPrice = retail2(size.markedUpPrice);
        if (size.priceByMarkup) {
          for (const key of Object.keys(size.priceByMarkup)) {
            size.priceByMarkup[key] = retail2(size.priceByMarkup[key]);
          }
        }
      }
    }
  }

  return raw;
}

const CATALOG = retailCatalog(
  JSON.parse(
    readFileSync(
      new URL("./e2e/fixtures/ss-catalog-live-2026-08-25.json", import.meta.url),
      "utf8"
    )
  )
);

function colorOf(label: string, colorName: string) {
  const product = CATALOG.products.find(
    (p: { customerLabel: string }) => p.customerLabel === label
  );
  return product.colors.find(
    (c: { colorName: string }) => c.colorName === colorName
  );
}

describe("ANCHORS — figures the browser has shown, re-verified 6 Sep 2026", () => {
  // Stacey Beer's scenario, driven in Chromium against the dev server with
  // the catalog fixture: every figure below appeared ON SCREEN and matched
  // the engine to the cent when first written (31 Aug). Black Basic Tee
  // blended to 4.55 then.
  //
  // REPRICED 6 Sep 2026, deliberately and entirely: Gabe made the shop's
  // Printavo screen-print matrix (corrected 22 Aug) the app's price,
  // garment markup included (lib/apparel-pricing-config.ts). Every anchor
  // moved — the blank went from S&S × 1.4 to × 2.5 at these run sizes,
  // and printing from a formula table to the matrix's cells. Black now
  // blends to 8.15, White to 7.30. The 4 Sep never-pay-more rule is kept:
  // 20 shirts still print at the 24 row. Re-verified on screen the same
  // day (tests/e2e/apparel-configurator-audit.mjs compares the summary to
  // this engine).
  test("Stacey: 20 black shirts, 3 colors, front = $448.05", () => {
    const r = calculateApparelPricing({
      quantity: 20,
      garmentPriceByMarkup: garmentPriceByMarkup(colorOf("Basic Tee", "Black"), null, 20),
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: false,
    });
    assert.equal(r.garmentUnitPrice, 8.4);
    assert.equal(r.total.toFixed(2), "448.05");
    assert.equal(r.printTierQuantity, 24, "printed at the 24-piece rate");
  });

  test("Stacey's ink lever: 1 color = $305.11", () => {
    const r = calculateApparelPricing({
      quantity: 20,
      garmentUnitPrice: 8.4,
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "305.11");
  });

  test("Stacey's tier lever: 24 shirts = $481.65 ($20.07 each)", () => {
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 8.4,
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "481.65");
    assert.equal(r.unitPrice.toFixed(2), "20.07");
  });

  test("Kurt: 1 white shirt, front and back, 1 color = $102.31", () => {
    // The matrix's qty-1 row is $21 a print per location; two locations
    // and two screens on one $7.30 shirt.
    const r = calculateApparelPricing({
      quantity: 1,
      garmentPriceByMarkup: garmentPriceByMarkup(colorOf("Basic Tee", "White"), null, 1),
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "102.31");
  });

  test("the audit's worked example: 24 white M/L exact = $291.19", () => {
    // Exact basis: M and L both price 6.23 at 150%, so the quantized unit
    // is 6.23; 24 × $4.50 print + one $25 screen. THE RUNBOOK'S ORDER 0.
    const r = calculateApparelPricing({
      quantity: 24,
      garmentPriceByMarkup: garmentPriceByMarkup(colorOf("Basic Tee", "White"), { M: 12, L: 12 }, 24),
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.garmentUnitPrice, 6.42);
    assert.equal(r.total.toFixed(2), "291.19");
  });

  test("the audit's second location: $428.30", () => {
    // A second placement is a second pass through the matrix — another
    // $4.50 a piece at 24 — plus its own screen.
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 6.42,
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "428.30");
  });
});

/**
 * Every colour's blended per-shirt price, from the committed 25 Aug capture
 * of the live catalog. [product / colour, blended unit].
 */
const BLEND_SHEET: [string, number][] = [
  ["Premium Soft Tee / Athletic Heather", 11.65],
  ["Premium Soft Tee / Black Heather", 11.65],
  ["Premium Soft Tee / Dark Grey Heather", 11.65],
  ["Premium Soft Tee / Deep Heather", 11.65],
  ["Premium Soft Tee / Heather Aqua", 11.65],
  ["Premium Soft Tee / Heather Autumn", 11.65],
  ["Premium Soft Tee / Heather Baby Blue", 11.65],
  ["Premium Soft Tee / Heather Blue", 11.65],
  ["Premium Soft Tee / Heather Blue Lagoon", 11.65],
  ["Premium Soft Tee / Heather Blue Storm", 11.65],
  ["Premium Soft Tee / Heather Brown", 11.65],
  ["Premium Soft Tee / Heather Bubble Gum", 11.65],
  ["Premium Soft Tee / Heather Canvas Red", 11.65],
  ["Premium Soft Tee / Heather Cardinal", 11.65],
  ["Premium Soft Tee / Heather Carolina Blue", 11.65],
  ["Premium Soft Tee / Heather Cement", 11.65],
  ["Premium Soft Tee / Heather Charity Pink", 11.65],
  ["Premium Soft Tee / Heather Clay", 11.65],
  ["Premium Soft Tee / Heather Columbia Blue", 11.65],
  ["Premium Soft Tee / Heather Cool Grey", 11.65],
  ["Premium Soft Tee / Heather Dark Lavender", 11.65],
  ["Premium Soft Tee / Heather Deep Teal", 11.65],
  ["Premium Soft Tee / Heather Dust", 11.65],
  ["Premium Soft Tee / Heather Dusty Blue", 11.65],
  ["Premium Soft Tee / Heather Emerald", 11.65],
  ["Premium Soft Tee / Heather Forest", 11.65],
  ["Premium Soft Tee / Heather French Vanilla", 11.65],
  ["Premium Soft Tee / Heather Grass Green", 11.65],
  ["Premium Soft Tee / Heather Green", 11.65],
  ["Premium Soft Tee / Heather Ice Blue", 11.65],
  ["Premium Soft Tee / Heather Kelly", 11.65],
  ["Premium Soft Tee / Heather Lapis", 11.65],
  ["Premium Soft Tee / Heather Magenta", 11.65],
  ["Premium Soft Tee / Heather Marmalade", 11.25],
  ["Premium Soft Tee / Heather Maroon", 11.65],
  ["Premium Soft Tee / Heather Mauve", 11.65],
  ["Premium Soft Tee / Heather Midnight Navy", 11.65],
  ["Premium Soft Tee / Heather Military Green", 11.65],
  ["Premium Soft Tee / Heather Mint", 11.65],
  ["Premium Soft Tee / Heather Mustard", 11.65],
  ["Premium Soft Tee / Heather Natural", 11.65],
  ["Premium Soft Tee / Heather Navy", 11.65],
  ["Premium Soft Tee / Heather Oatmeal", 11.65],
  ["Premium Soft Tee / Heather Olive", 11.65],
  ["Premium Soft Tee / Heather Orange", 11.65],
  ["Premium Soft Tee / Heather Orchid", 11.65],
  ["Premium Soft Tee / Heather Peach", 11.65],
  ["Premium Soft Tee / Heather Pink", 11.65],
  ["Premium Soft Tee / Heather Pink Gravel", 11.65],
  ["Premium Soft Tee / Heather Prism Blue", 11.65],
  ["Premium Soft Tee / Heather Prism Dusty Blue", 11.65],
  ["Premium Soft Tee / Heather Prism Ice Blue", 11.65],
  ["Premium Soft Tee / Heather Prism Lilac", 11.65],
  ["Premium Soft Tee / Heather Prism Mint", 11.65],
  ["Premium Soft Tee / Heather Prism Natural", 11.65],
  ["Premium Soft Tee / Heather Prism Peach", 11.65],
  ["Premium Soft Tee / Heather Prism Sunset", 10.80],
  ["Premium Soft Tee / Heather Purple", 11.65],
  ["Premium Soft Tee / Heather Raspberry", 11.65],
  ["Premium Soft Tee / Heather Red", 11.65],
  ["Premium Soft Tee / Heather Sage", 11.65],
  ["Premium Soft Tee / Heather Sand Dune", 11.65],
  ["Premium Soft Tee / Heather Sea Green", 11.65],
  ["Premium Soft Tee / Heather Silver", 11.65],
  ["Premium Soft Tee / Heather Slate", 11.65],
  ["Premium Soft Tee / Heather Soft Cream", 11.65],
  ["Premium Soft Tee / Heather Stone", 11.65],
  ["Premium Soft Tee / Heather Storm", 11.65],
  ["Premium Soft Tee / Heather Sunset", 11.65],
  ["Premium Soft Tee / Heather Tan", 11.65],
  ["Premium Soft Tee / Heather Team Purple", 11.65],
  ["Premium Soft Tee / Heather True Royal", 11.65],
  ["Premium Soft Tee / Heather Yellow", 11.65],
  ["Premium Soft Tee / Heather Yellow Gold", 11.65],
  ["Premium Soft Tee / Neon Blue", 11.65],
  ["Premium Soft Tee / Neon Orange", 11.65],
  ["Premium Soft Tee / Neon Pink", 11.65],
  ["Premium Soft Tee / Neon Yellow", 11.65],
  ["Premium Soft Tee / Solid Asphalt Blend", 11.65],
  ["Premium Soft Tee / Solid Black Blend", 11.65],
  ["Premium Soft Tee / Solid Navy Blend", 11.65],
  ["Premium Soft Tee / Solid Red Blend", 11.65],
  ["Premium Soft Tee / Solid True Royal Blend", 11.65],
  ["Premium Soft Tee / Solid White Blend", 11.65],
  ["Classic Hoodie / Antique Cherry Red", 28.40],
  ["Classic Hoodie / Antique Sapphire", 28.40],
  ["Classic Hoodie / Ash", 28.40],
  ["Classic Hoodie / Azalea", 28.40],
  ["Classic Hoodie / Black", 28.40],
  ["Classic Hoodie / Cardinal Red", 28.40],
  ["Classic Hoodie / Carolina Blue", 28.40],
  ["Classic Hoodie / Charcoal", 28.40],
  ["Classic Hoodie / Cherry Red", 28.40],
  ["Classic Hoodie / Dark Chocolate", 28.40],
  ["Classic Hoodie / Dark Heather", 28.40],
  ["Classic Hoodie / Fan Charcoal Heather", 28.40],
  ["Classic Hoodie / Fan Dark Green", 28.40],
  ["Classic Hoodie / Fan Deep Royal", 28.40],
  ["Classic Hoodie / Forest", 28.40],
  ["Classic Hoodie / Garnet", 28.40],
  ["Classic Hoodie / Gold", 28.40],
  ["Classic Hoodie / Graphite Heather", 28.40],
  ["Classic Hoodie / Heather Dark Green", 28.40],
  ["Classic Hoodie / Heather Dark Maroon", 28.40],
  ["Classic Hoodie / Heather Dark Navy", 28.40],
  ["Classic Hoodie / Heather Deep Royal", 28.40],
  ["Classic Hoodie / Heather Scarlet Red", 27.35],
  ["Classic Hoodie / Heliconia", 28.40],
  ["Classic Hoodie / Indigo Blue", 28.40],
  ["Classic Hoodie / Irish Green", 28.40],
  ["Classic Hoodie / Light Blue", 28.40],
  ["Classic Hoodie / Light Pink", 28.40],
  ["Classic Hoodie / Maroon", 28.40],
  ["Classic Hoodie / Military Green", 28.40],
  ["Classic Hoodie / Mint Green", 28.40],
  ["Classic Hoodie / Navy", 28.40],
  ["Classic Hoodie / Neon Blue", 28.40],
  ["Classic Hoodie / Old Gold", 28.40],
  ["Classic Hoodie / Orange", 28.40],
  ["Classic Hoodie / Orchid", 28.40],
  ["Classic Hoodie / Purple", 28.40],
  ["Classic Hoodie / Red", 28.40],
  ["Classic Hoodie / Royal", 28.40],
  ["Classic Hoodie / Safety Green", 28.40],
  ["Classic Hoodie / Safety Orange", 28.40],
  ["Classic Hoodie / Safety Pink", 28.40],
  ["Classic Hoodie / Sand", 28.40],
  ["Classic Hoodie / Sapphire", 28.40],
  ["Classic Hoodie / Sport Grey", 28.40],
  ["Classic Hoodie / Violet", 28.40],
  ["Classic Hoodie / White", 28.40],
  ["Basic Tee / Antique Cherry Red", 8.40],
  ["Basic Tee / Antique Irish Green", 8.40],
  ["Basic Tee / Antique Royal", 8.40],
  ["Basic Tee / Ash", 8.40],
  ["Basic Tee / Azalea", 8.40],
  ["Basic Tee / Black", 8.40],
  ["Basic Tee / Blue Dusk", 8.40],
  ["Basic Tee / Cardinal Red", 8.40],
  ["Basic Tee / Carolina Blue", 8.40],
  ["Basic Tee / Charcoal", 8.40],
  ["Basic Tee / Cherry Red", 8.40],
  ["Basic Tee / Cornsilk", 8.40],
  ["Basic Tee / Daisy", 8.40],
  ["Basic Tee / Dark Chocolate", 8.40],
  ["Basic Tee / Dark Heather", 8.40],
  ["Basic Tee / Forest", 8.40],
  ["Basic Tee / Galapagos Blue", 8.40],
  ["Basic Tee / Gold", 8.40],
  ["Basic Tee / Heather Cardinal", 8.40],
  ["Basic Tee / Heather Indigo", 8.40],
  ["Basic Tee / Heather Navy", 8.40],
  ["Basic Tee / Heather Sapphire", 8.40],
  ["Basic Tee / Heliconia", 8.40],
  ["Basic Tee / Ice Grey", 8.40],
  ["Basic Tee / Indigo Blue", 8.40],
  ["Basic Tee / Iris", 8.40],
  ["Basic Tee / Irish Green", 8.40],
  ["Basic Tee / Jade Dome", 8.40],
  ["Basic Tee / Kelly", 8.40],
  ["Basic Tee / Light Blue", 8.40],
  ["Basic Tee / Light Pink", 8.40],
  ["Basic Tee / Lime", 8.40],
  ["Basic Tee / Maroon", 8.40],
  ["Basic Tee / Metro Blue", 8.40],
  ["Basic Tee / Military Green", 8.40],
  ["Basic Tee / Mint Green", 8.40],
  ["Basic Tee / Natural", 7.55],
  ["Basic Tee / Navy", 8.40],
  ["Basic Tee / Olive", 8.40],
  ["Basic Tee / Orange", 8.40],
  ["Basic Tee / Orchid", 8.40],
  ["Basic Tee / PFD White", 8.10],
  ["Basic Tee / Pistachio", 8.40],
  ["Basic Tee / Prairie Dust", 8.40],
  ["Basic Tee / Purple", 8.40],
  ["Basic Tee / Red", 8.40],
  ["Basic Tee / Royal", 8.40],
  ["Basic Tee / Safety Green", 8.40],
  ["Basic Tee / Safety Orange", 8.40],
  ["Basic Tee / Safety Pink", 8.40],
  ["Basic Tee / Sand", 8.40],
  ["Basic Tee / Sapphire", 8.40],
  ["Basic Tee / Sky", 8.40],
  ["Basic Tee / Sport Grey", 8.40],
  ["Basic Tee / Stone Blue", 8.40],
  ["Basic Tee / Tan", 8.40],
  ["Basic Tee / Tangerine", 8.40],
  ["Basic Tee / Texas Orange", 8.40],
  ["Basic Tee / Vegas Gold", 8.40],
  ["Basic Tee / White", 7.55],];

describe("THE BLEND SHEET — 191 colours, one committed figure each", () => {
  const byKey = new Map<string, { label: string; color: unknown }>();
  for (const p of CATALOG.products) {
    for (const c of p.colors) {
      byKey.set(`${p.customerLabel} / ${c.colorName}`, {
        label: p.customerLabel,
        color: c,
      });
    }
  }

  test("the sheet covers the whole catalog, no more, no less", () => {
    assert.equal(BLEND_SHEET.length, byKey.size);
  });

  for (const [key, expected] of BLEND_SHEET) {
    test(key, () => {
      const entry = byKey.get(key);
      assert.ok(entry, "colour vanished from the fixture");
      assert.equal(
        blendedGarmentUnitPrice(entry.color as never).toFixed(2),
        expected.toFixed(2)
      );
    });
  }
});

/**
 * Engine totals at a fixed $4.10 garment unit (Basic Tee White's blended
 * figure). Label: quantity @ inks, locations, underbase. Tier boundaries
 * are pinned from both sides.
 */
const ENGINE_GRID: [string, number][] = [
  ["1 @ 1ink 1loc", 51.60],
  ["1 @ 1ink 1loc +ub", 97.95],
  ["1 @ 1ink 2loc", 98.98],
  ["1 @ 1ink 2loc +ub", 191.68],
  ["1 @ 2ink 1loc", 97.95],
  ["1 @ 2ink 2loc", 191.68],
  ["1 @ 3ink 1loc", 144.30],
  ["1 @ 3ink 2loc", 284.38],
  ["1 @ 5+ink 1loc", 215.37],
  ["1 @ 5+ink 2loc", 426.52],
  ["12 @ 1ink 1loc", 150.55],
  ["12 @ 1ink 1loc +ub", 262.82],
  ["12 @ 1ink 2loc", 250.46],
  ["12 @ 1ink 2loc +ub", 475.00],
  ["12 @ 2ink 1loc", 262.82],
  ["12 @ 2ink 2loc", 475.00],
  ["12 @ 3ink 1loc", 325.65],
  ["12 @ 3ink 2loc", 600.66],
  ["12 @ 5+ink 1loc", 451.31],
  ["12 @ 5+ink 2loc", 851.98],
  ["23 @ 1ink 1loc", 234.17],
  ["23 @ 1ink 1loc +ub", 312.96],
  ["23 @ 1ink 2loc", 371.28],
  ["23 @ 1ink 2loc +ub", 528.86],
  ["23 @ 2ink 1loc", 312.96],
  ["23 @ 2ink 2loc", 528.86],
  ["23 @ 3ink 1loc", 377.11],
  ["23 @ 3ink 2loc", 657.16],
  ["23 @ 5+ink 1loc", 503.97],
  ["23 @ 5+ink 2loc", 910.88],
  ["24 @ 1ink 1loc", 238.39],
  ["24 @ 1ink 1loc +ub", 317.18],
  ["24 @ 1ink 2loc", 375.50],
  ["24 @ 1ink 2loc +ub", 533.08],
  ["24 @ 2ink 1loc", 317.18],
  ["24 @ 2ink 2loc", 533.08],
  ["24 @ 3ink 1loc", 381.33],
  ["24 @ 3ink 2loc", 661.38],
  ["24 @ 5+ink 1loc", 508.19],
  ["24 @ 5+ink 2loc", 915.10],
  ["25 @ 1ink 1loc", 247.25],
  ["25 @ 1ink 1loc +ub", 328.25],
  ["25 @ 1ink 2loc", 389.00],
  ["25 @ 1ink 2loc +ub", 551.00],
  ["25 @ 2ink 1loc", 328.25],
  ["25 @ 2ink 2loc", 551.00],
  ["25 @ 3ink 1loc", 394.00],
  ["25 @ 3ink 2loc", 682.50],
  ["25 @ 5+ink 1loc", 524.00],
  ["25 @ 5+ink 2loc", 942.50],
  ["49 @ 1ink 1loc", 434.41],
  ["49 @ 1ink 1loc +ub", 510.63],
  ["49 @ 1ink 2loc", 662.04],
  ["49 @ 1ink 2loc +ub", 814.48],
  ["49 @ 2ink 1loc", 510.63],
  ["49 @ 2ink 2loc", 814.48],
  ["49 @ 3ink 1loc", 586.85],
  ["49 @ 3ink 2loc", 966.92],
  ["49 @ 5+ink 1loc", 739.29],
  ["49 @ 5+ink 2loc", 1271.80],
  ["50 @ 1ink 1loc", 442.75],
  ["50 @ 1ink 1loc +ub", 520.00],
  ["50 @ 1ink 2loc", 674.50],
  ["50 @ 1ink 2loc +ub", 829.00],
  ["50 @ 2ink 1loc", 520.00],
  ["50 @ 2ink 2loc", 829.00],
  ["50 @ 3ink 1loc", 597.25],
  ["50 @ 3ink 2loc", 983.50],
  ["50 @ 5+ink 1loc", 751.75],
  ["50 @ 5+ink 2loc", 1292.50],
  ["99 @ 1ink 1loc", 775.18],
  ["99 @ 1ink 1loc +ub", 902.90],
  ["99 @ 1ink 2loc", 1132.58],
  ["99 @ 1ink 2loc +ub", 1388.02],
  ["99 @ 2ink 1loc", 902.90],
  ["99 @ 2ink 2loc", 1388.02],
  ["99 @ 3ink 1loc", 1030.62],
  ["99 @ 3ink 2loc", 1643.46],
  ["99 @ 5+ink 1loc", 1286.06],
  ["99 @ 5+ink 2loc", 2154.34],
  ["100 @ 1ink 1loc", 782.75],
  ["100 @ 1ink 1loc +ub", 911.50],
  ["100 @ 1ink 2loc", 1143.50],
  ["100 @ 1ink 2loc +ub", 1401.00],
  ["100 @ 2ink 1loc", 911.50],
  ["100 @ 2ink 2loc", 1401.00],
  ["100 @ 3ink 1loc", 1040.25],
  ["100 @ 3ink 2loc", 1658.50],
  ["100 @ 5+ink 1loc", 1297.75],
  ["100 @ 5+ink 2loc", 2173.50],
  ["249 @ 1ink 1loc", 1819.57],
  ["249 @ 1ink 1loc +ub", 2128.16],
  ["249 @ 1ink 2loc", 2588.36],
  ["249 @ 1ink 2loc +ub", 3205.54],
  ["249 @ 2ink 1loc", 2128.16],
  ["249 @ 2ink 2loc", 3205.54],
  ["249 @ 3ink 1loc", 2410.38],
  ["249 @ 3ink 2loc", 3769.98],
  ["249 @ 5+ink 1loc", 2974.82],
  ["249 @ 5+ink 2loc", 4898.86],
  ["250 @ 1ink 1loc", 1823.79],
  ["250 @ 1ink 1loc +ub", 2136.50],
  ["250 @ 1ink 2loc", 2592.58],
  ["250 @ 1ink 2loc +ub", 3218.00],
  ["250 @ 2ink 1loc", 2136.50],
  ["250 @ 2ink 2loc", 3218.00],
  ["250 @ 3ink 1loc", 2419.75],
  ["250 @ 3ink 2loc", 3784.50],
  ["250 @ 5+ink 1loc", 2986.25],
  ["250 @ 5+ink 2loc", 4917.50],
  ["500 @ 1ink 1loc", 3126.95],
  ["500 @ 1ink 1loc +ub", 3245.10],
  ["500 @ 1ink 2loc", 4143.90],
  ["500 @ 1ink 2loc +ub", 4380.20],
  ["500 @ 2ink 1loc", 3245.10],
  ["500 @ 2ink 2loc", 4380.20],
  ["500 @ 3ink 1loc", 3615.25],
  ["500 @ 3ink 2loc", 5120.50],
  ["500 @ 5+ink 1loc", 4271.55],
  ["500 @ 5+ink 2loc", 6433.10],];

describe("THE ENGINE GRID — 120 committed totals", () => {
  for (const [label, expected] of ENGINE_GRID) {
    test(label, () => {
      // Label shape: "<qty> @ <n>ink <n>loc[ +ub]", e.g. "24 @ 3ink 2loc".
      const match = label.match(/^(\d+) @ (\S+)ink (\d)loc( \+ub)?$/);
      assert.ok(match, `unparseable row label: ${label}`);
      const [, qty, inkToken, locCount, underbase] = match;

      const r = calculateApparelPricing({
        quantity: Number(qty),
        // 4.10 in the old price book; retail is 4.22.
        garmentUnitPrice: retail2(4.1),
        printLocations: locCount === "2" ? ["Front", "Back"] : ["Front"],
        inkColors:
          inkToken === "1" ? "1 color"
          : inkToken === "2" ? "2 colors"
          : inkToken === "3" ? "3 colors"
          : "5+ colors / Full color / Not sure",
        hasUnderbase: Boolean(underbase),
      });

      assert.equal(r.total.toFixed(2), expected.toFixed(2), label);
    });
  }
});
