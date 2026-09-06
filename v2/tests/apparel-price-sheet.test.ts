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
 * Three sections:
 *  1. ANCHORS — figures verified OUTSIDE this suite, in a real browser this
 *     session (31 Aug 2026): Stacey's and Kurt's scenario runs and the
 *     audit driver's worked examples. These tie the sheet to reality.
 *  2. THE BLEND SHEET — the blended per-shirt garment price for every one
 *     of the 191 colours in the committed production catalog capture. A
 *     change to the mix table, the rounding, or the base-size rule moves
 *     this whole section visibly.
 *  3. THE ENGINE GRID — totals across quantity tiers, ink counts,
 *     locations and underbase at a fixed $4.10 garment unit (Starter Tee
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

const CATALOG = JSON.parse(
  readFileSync(
    new URL("./e2e/fixtures/ss-catalog-live-2026-08-25.json", import.meta.url),
    "utf8"
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
  // the engine to the cent when first written (31 Aug). Black Starter Tee
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
  test("Stacey: 20 black shirts, 3 colors, front = $434.80", () => {
    const r = calculateApparelPricing({
      quantity: 20,
      garmentPriceByMarkup: garmentPriceByMarkup(colorOf("Starter Tee", "Black"), null, 20),
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: false,
    });
    assert.equal(r.garmentUnitPrice, 8.15);
    assert.equal(r.total.toFixed(2), "434.80");
    assert.equal(r.printTierQuantity, 24, "printed at the 24-piece rate");
  });

  test("Stacey's ink lever: 1 color = $296.00", () => {
    const r = calculateApparelPricing({
      quantity: 20,
      garmentUnitPrice: 8.15,
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "296.00");
  });

  test("Stacey's tier lever: 24 shirts = $467.40 ($19.47 each)", () => {
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 8.15,
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "467.40");
    assert.equal(r.unitPrice.toFixed(2), "19.47");
  });

  test("Kurt: 1 white shirt, front and back, 1 color = $99.30", () => {
    // The matrix's qty-1 row is $21 a print per location; two locations
    // and two screens on one $7.30 shirt.
    const r = calculateApparelPricing({
      quantity: 1,
      garmentPriceByMarkup: garmentPriceByMarkup(colorOf("Starter Tee", "White"), null, 1),
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "99.30");
  });

  test("the audit's worked example: 24 white M/L exact = $282.52", () => {
    // Exact basis: M and L both price 6.23 at 150%, so the quantized unit
    // is 6.23; 24 × $4.50 print + one $25 screen. THE RUNBOOK'S ORDER 0.
    const r = calculateApparelPricing({
      quantity: 24,
      garmentPriceByMarkup: garmentPriceByMarkup(colorOf("Starter Tee", "White"), { M: 12, L: 12 }, 24),
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.garmentUnitPrice, 6.23);
    assert.equal(r.total.toFixed(2), "282.52");
  });

  test("the audit's second location: $415.52", () => {
    // A second placement is a second pass through the matrix — another
    // $4.50 a piece at 24 — plus its own screen.
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 6.23,
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "415.52");
  });
});

/**
 * Every colour's blended per-shirt price, from the committed 25 Aug capture
 * of the live catalog. [product / colour, blended unit].
 */
const BLEND_SHEET: [string, number][] = [
  ["Premium Soft Tee / Athletic Heather", 11.30],
  ["Premium Soft Tee / Black Heather", 11.30],
  ["Premium Soft Tee / Dark Grey Heather", 11.30],
  ["Premium Soft Tee / Deep Heather", 11.30],
  ["Premium Soft Tee / Heather Aqua", 11.30],
  ["Premium Soft Tee / Heather Autumn", 11.30],
  ["Premium Soft Tee / Heather Baby Blue", 11.30],
  ["Premium Soft Tee / Heather Blue", 11.30],
  ["Premium Soft Tee / Heather Blue Lagoon", 11.30],
  ["Premium Soft Tee / Heather Blue Storm", 11.30],
  ["Premium Soft Tee / Heather Brown", 11.30],
  ["Premium Soft Tee / Heather Bubble Gum", 11.30],
  ["Premium Soft Tee / Heather Canvas Red", 11.30],
  ["Premium Soft Tee / Heather Cardinal", 11.30],
  ["Premium Soft Tee / Heather Carolina Blue", 11.30],
  ["Premium Soft Tee / Heather Cement", 11.30],
  ["Premium Soft Tee / Heather Charity Pink", 11.30],
  ["Premium Soft Tee / Heather Clay", 11.30],
  ["Premium Soft Tee / Heather Columbia Blue", 11.30],
  ["Premium Soft Tee / Heather Cool Grey", 11.30],
  ["Premium Soft Tee / Heather Dark Lavender", 11.30],
  ["Premium Soft Tee / Heather Deep Teal", 11.30],
  ["Premium Soft Tee / Heather Dust", 11.30],
  ["Premium Soft Tee / Heather Dusty Blue", 11.30],
  ["Premium Soft Tee / Heather Emerald", 11.30],
  ["Premium Soft Tee / Heather Forest", 11.30],
  ["Premium Soft Tee / Heather French Vanilla", 11.30],
  ["Premium Soft Tee / Heather Grass Green", 11.30],
  ["Premium Soft Tee / Heather Green", 11.30],
  ["Premium Soft Tee / Heather Ice Blue", 11.30],
  ["Premium Soft Tee / Heather Kelly", 11.30],
  ["Premium Soft Tee / Heather Lapis", 11.30],
  ["Premium Soft Tee / Heather Magenta", 11.30],
  ["Premium Soft Tee / Heather Marmalade", 10.95],
  ["Premium Soft Tee / Heather Maroon", 11.30],
  ["Premium Soft Tee / Heather Mauve", 11.30],
  ["Premium Soft Tee / Heather Midnight Navy", 11.30],
  ["Premium Soft Tee / Heather Military Green", 11.30],
  ["Premium Soft Tee / Heather Mint", 11.30],
  ["Premium Soft Tee / Heather Mustard", 11.30],
  ["Premium Soft Tee / Heather Natural", 11.30],
  ["Premium Soft Tee / Heather Navy", 11.30],
  ["Premium Soft Tee / Heather Oatmeal", 11.30],
  ["Premium Soft Tee / Heather Olive", 11.30],
  ["Premium Soft Tee / Heather Orange", 11.30],
  ["Premium Soft Tee / Heather Orchid", 11.30],
  ["Premium Soft Tee / Heather Peach", 11.30],
  ["Premium Soft Tee / Heather Pink", 11.30],
  ["Premium Soft Tee / Heather Pink Gravel", 11.30],
  ["Premium Soft Tee / Heather Prism Blue", 11.30],
  ["Premium Soft Tee / Heather Prism Dusty Blue", 11.30],
  ["Premium Soft Tee / Heather Prism Ice Blue", 11.30],
  ["Premium Soft Tee / Heather Prism Lilac", 11.30],
  ["Premium Soft Tee / Heather Prism Mint", 11.30],
  ["Premium Soft Tee / Heather Prism Natural", 11.30],
  ["Premium Soft Tee / Heather Prism Peach", 11.30],
  ["Premium Soft Tee / Heather Prism Sunset", 10.50],
  ["Premium Soft Tee / Heather Purple", 11.30],
  ["Premium Soft Tee / Heather Raspberry", 11.30],
  ["Premium Soft Tee / Heather Red", 11.30],
  ["Premium Soft Tee / Heather Sage", 11.30],
  ["Premium Soft Tee / Heather Sand Dune", 11.30],
  ["Premium Soft Tee / Heather Sea Green", 11.30],
  ["Premium Soft Tee / Heather Silver", 11.30],
  ["Premium Soft Tee / Heather Slate", 11.30],
  ["Premium Soft Tee / Heather Soft Cream", 11.30],
  ["Premium Soft Tee / Heather Stone", 11.30],
  ["Premium Soft Tee / Heather Storm", 11.30],
  ["Premium Soft Tee / Heather Sunset", 11.30],
  ["Premium Soft Tee / Heather Tan", 11.30],
  ["Premium Soft Tee / Heather Team Purple", 11.30],
  ["Premium Soft Tee / Heather True Royal", 11.30],
  ["Premium Soft Tee / Heather Yellow", 11.30],
  ["Premium Soft Tee / Heather Yellow Gold", 11.30],
  ["Premium Soft Tee / Neon Blue", 11.30],
  ["Premium Soft Tee / Neon Orange", 11.30],
  ["Premium Soft Tee / Neon Pink", 11.30],
  ["Premium Soft Tee / Neon Yellow", 11.30],
  ["Premium Soft Tee / Solid Asphalt Blend", 11.30],
  ["Premium Soft Tee / Solid Black Blend", 11.30],
  ["Premium Soft Tee / Solid Navy Blend", 11.30],
  ["Premium Soft Tee / Solid Red Blend", 11.30],
  ["Premium Soft Tee / Solid True Royal Blend", 11.30],
  ["Premium Soft Tee / Solid White Blend", 11.30],
  ["Classic Hoodie / Antique Cherry Red", 27.60],
  ["Classic Hoodie / Antique Sapphire", 27.60],
  ["Classic Hoodie / Ash", 27.60],
  ["Classic Hoodie / Azalea", 27.60],
  ["Classic Hoodie / Black", 27.60],
  ["Classic Hoodie / Cardinal Red", 27.60],
  ["Classic Hoodie / Carolina Blue", 27.60],
  ["Classic Hoodie / Charcoal", 27.60],
  ["Classic Hoodie / Cherry Red", 27.60],
  ["Classic Hoodie / Dark Chocolate", 27.60],
  ["Classic Hoodie / Dark Heather", 27.60],
  ["Classic Hoodie / Fan Charcoal Heather", 27.60],
  ["Classic Hoodie / Fan Dark Green", 27.60],
  ["Classic Hoodie / Fan Deep Royal", 27.60],
  ["Classic Hoodie / Forest", 27.60],
  ["Classic Hoodie / Garnet", 27.60],
  ["Classic Hoodie / Gold", 27.60],
  ["Classic Hoodie / Graphite Heather", 27.60],
  ["Classic Hoodie / Heather Dark Green", 27.60],
  ["Classic Hoodie / Heather Dark Maroon", 27.60],
  ["Classic Hoodie / Heather Dark Navy", 27.60],
  ["Classic Hoodie / Heather Deep Royal", 27.60],
  ["Classic Hoodie / Heather Scarlet Red", 26.55],
  ["Classic Hoodie / Heliconia", 27.60],
  ["Classic Hoodie / Indigo Blue", 27.60],
  ["Classic Hoodie / Irish Green", 27.60],
  ["Classic Hoodie / Light Blue", 27.60],
  ["Classic Hoodie / Light Pink", 27.60],
  ["Classic Hoodie / Maroon", 27.60],
  ["Classic Hoodie / Military Green", 27.60],
  ["Classic Hoodie / Mint Green", 27.60],
  ["Classic Hoodie / Navy", 27.60],
  ["Classic Hoodie / Neon Blue", 27.60],
  ["Classic Hoodie / Old Gold", 27.60],
  ["Classic Hoodie / Orange", 27.60],
  ["Classic Hoodie / Orchid", 27.60],
  ["Classic Hoodie / Purple", 27.60],
  ["Classic Hoodie / Red", 27.60],
  ["Classic Hoodie / Royal", 27.60],
  ["Classic Hoodie / Safety Green", 27.60],
  ["Classic Hoodie / Safety Orange", 27.60],
  ["Classic Hoodie / Safety Pink", 27.60],
  ["Classic Hoodie / Sand", 27.60],
  ["Classic Hoodie / Sapphire", 27.60],
  ["Classic Hoodie / Sport Grey", 27.60],
  ["Classic Hoodie / Violet", 27.60],
  ["Classic Hoodie / White", 27.60],
  ["Starter Tee / Antique Cherry Red", 8.15],
  ["Starter Tee / Antique Irish Green", 8.15],
  ["Starter Tee / Antique Royal", 8.15],
  ["Starter Tee / Ash", 8.15],
  ["Starter Tee / Azalea", 8.15],
  ["Starter Tee / Black", 8.15],
  ["Starter Tee / Blue Dusk", 8.15],
  ["Starter Tee / Cardinal Red", 8.15],
  ["Starter Tee / Carolina Blue", 8.15],
  ["Starter Tee / Charcoal", 8.15],
  ["Starter Tee / Cherry Red", 8.15],
  ["Starter Tee / Cornsilk", 8.15],
  ["Starter Tee / Daisy", 8.15],
  ["Starter Tee / Dark Chocolate", 8.15],
  ["Starter Tee / Dark Heather", 8.15],
  ["Starter Tee / Forest", 8.15],
  ["Starter Tee / Galapagos Blue", 8.15],
  ["Starter Tee / Gold", 8.15],
  ["Starter Tee / Heather Cardinal", 8.15],
  ["Starter Tee / Heather Indigo", 8.15],
  ["Starter Tee / Heather Navy", 8.15],
  ["Starter Tee / Heather Sapphire", 8.15],
  ["Starter Tee / Heliconia", 8.15],
  ["Starter Tee / Ice Grey", 8.15],
  ["Starter Tee / Indigo Blue", 8.15],
  ["Starter Tee / Iris", 8.15],
  ["Starter Tee / Irish Green", 8.15],
  ["Starter Tee / Jade Dome", 8.15],
  ["Starter Tee / Kelly", 8.15],
  ["Starter Tee / Light Blue", 8.15],
  ["Starter Tee / Light Pink", 8.15],
  ["Starter Tee / Lime", 8.15],
  ["Starter Tee / Maroon", 8.15],
  ["Starter Tee / Metro Blue", 8.15],
  ["Starter Tee / Military Green", 8.15],
  ["Starter Tee / Mint Green", 8.15],
  ["Starter Tee / Natural", 7.30],
  ["Starter Tee / Navy", 8.15],
  ["Starter Tee / Olive", 8.15],
  ["Starter Tee / Orange", 8.15],
  ["Starter Tee / Orchid", 8.15],
  ["Starter Tee / PFD White", 7.85],
  ["Starter Tee / Pistachio", 8.15],
  ["Starter Tee / Prairie Dust", 8.15],
  ["Starter Tee / Purple", 8.15],
  ["Starter Tee / Red", 8.15],
  ["Starter Tee / Royal", 8.15],
  ["Starter Tee / Safety Green", 8.15],
  ["Starter Tee / Safety Orange", 8.15],
  ["Starter Tee / Safety Pink", 8.15],
  ["Starter Tee / Sand", 8.15],
  ["Starter Tee / Sapphire", 8.15],
  ["Starter Tee / Sky", 8.15],
  ["Starter Tee / Sport Grey", 8.15],
  ["Starter Tee / Stone Blue", 8.15],
  ["Starter Tee / Tan", 8.15],
  ["Starter Tee / Tangerine", 8.15],
  ["Starter Tee / Texas Orange", 8.15],
  ["Starter Tee / Vegas Gold", 8.15],
  ["Starter Tee / White", 7.30],];

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
 * Engine totals at a fixed $4.10 garment unit (Starter Tee White's blended
 * figure). Label: quantity @ inks, locations, underbase. Tier boundaries
 * are pinned from both sides.
 */
const ENGINE_GRID: [string, number][] = [
  ["1 @ 1ink 1loc", 50.10],
  ["1 @ 1ink 1loc +ub", 95.10],
  ["1 @ 1ink 2loc", 96.10],
  ["1 @ 1ink 2loc +ub", 186.10],
  ["1 @ 2ink 1loc", 95.10],
  ["1 @ 2ink 2loc", 186.10],
  ["1 @ 3ink 1loc", 140.10],
  ["1 @ 3ink 2loc", 276.10],
  ["1 @ 5+ink 1loc", 209.10],
  ["1 @ 5+ink 2loc", 414.10],
  ["12 @ 1ink 1loc", 146.20],
  ["12 @ 1ink 1loc +ub", 255.20],
  ["12 @ 1ink 2loc", 243.20],
  ["12 @ 1ink 2loc +ub", 461.20],
  ["12 @ 2ink 1loc", 255.20],
  ["12 @ 2ink 2loc", 461.20],
  ["12 @ 3ink 1loc", 316.20],
  ["12 @ 3ink 2loc", 583.20],
  ["12 @ 5+ink 1loc", 438.20],
  ["12 @ 5+ink 2loc", 827.20],
  ["23 @ 1ink 1loc", 227.30],
  ["23 @ 1ink 1loc +ub", 303.90],
  ["23 @ 1ink 2loc", 360.30],
  ["23 @ 1ink 2loc +ub", 513.50],
  ["23 @ 2ink 1loc", 303.90],
  ["23 @ 2ink 2loc", 513.50],
  ["23 @ 3ink 1loc", 366.10],
  ["23 @ 3ink 2loc", 637.90],
  ["23 @ 5+ink 1loc", 489.30],
  ["23 @ 5+ink 2loc", 884.30],
  ["24 @ 1ink 1loc", 231.40],
  ["24 @ 1ink 1loc +ub", 308.00],
  ["24 @ 1ink 2loc", 364.40],
  ["24 @ 1ink 2loc +ub", 517.60],
  ["24 @ 2ink 1loc", 308.00],
  ["24 @ 2ink 2loc", 517.60],
  ["24 @ 3ink 1loc", 370.20],
  ["24 @ 3ink 2loc", 642.00],
  ["24 @ 5+ink 1loc", 493.40],
  ["24 @ 5+ink 2loc", 888.40],
  ["25 @ 1ink 1loc", 240.00],
  ["25 @ 1ink 1loc +ub", 318.75],
  ["25 @ 1ink 2loc", 377.50],
  ["25 @ 1ink 2loc +ub", 535.00],
  ["25 @ 2ink 1loc", 318.75],
  ["25 @ 2ink 2loc", 535.00],
  ["25 @ 3ink 1loc", 382.50],
  ["25 @ 3ink 2loc", 662.50],
  ["25 @ 5+ink 1loc", 508.75],
  ["25 @ 5+ink 2loc", 915.00],
  ["49 @ 1ink 1loc", 421.90],
  ["49 @ 1ink 1loc +ub", 495.90],
  ["49 @ 1ink 2loc", 642.90],
  ["49 @ 1ink 2loc +ub", 790.90],
  ["49 @ 2ink 1loc", 495.90],
  ["49 @ 2ink 2loc", 790.90],
  ["49 @ 3ink 1loc", 569.90],
  ["49 @ 3ink 2loc", 938.90],
  ["49 @ 5+ink 1loc", 717.90],
  ["49 @ 5+ink 2loc", 1234.90],
  ["50 @ 1ink 1loc", 430.00],
  ["50 @ 1ink 1loc +ub", 505.00],
  ["50 @ 1ink 2loc", 655.00],
  ["50 @ 1ink 2loc +ub", 805.00],
  ["50 @ 2ink 1loc", 505.00],
  ["50 @ 2ink 2loc", 805.00],
  ["50 @ 3ink 1loc", 580.00],
  ["50 @ 3ink 2loc", 955.00],
  ["50 @ 5+ink 1loc", 730.00],
  ["50 @ 5+ink 2loc", 1255.00],
  ["99 @ 1ink 1loc", 752.65],
  ["99 @ 1ink 1loc +ub", 876.65],
  ["99 @ 1ink 2loc", 1099.40],
  ["99 @ 1ink 2loc +ub", 1347.40],
  ["99 @ 2ink 1loc", 876.65],
  ["99 @ 2ink 2loc", 1347.40],
  ["99 @ 3ink 1loc", 1000.65],
  ["99 @ 3ink 2loc", 1595.40],
  ["99 @ 5+ink 1loc", 1248.65],
  ["99 @ 5+ink 2loc", 2091.40],
  ["100 @ 1ink 1loc", 760.00],
  ["100 @ 1ink 1loc +ub", 885.00],
  ["100 @ 1ink 2loc", 1110.00],
  ["100 @ 1ink 2loc +ub", 1360.00],
  ["100 @ 2ink 1loc", 885.00],
  ["100 @ 2ink 2loc", 1360.00],
  ["100 @ 3ink 1loc", 1010.00],
  ["100 @ 3ink 2loc", 1610.00],
  ["100 @ 5+ink 1loc", 1260.00],
  ["100 @ 5+ink 2loc", 2110.00],
  ["249 @ 1ink 1loc", 1765.90],
  ["249 @ 1ink 1loc +ub", 2066.90],
  ["249 @ 1ink 2loc", 2510.90],
  ["249 @ 1ink 2loc +ub", 3112.90],
  ["249 @ 2ink 1loc", 2066.90],
  ["249 @ 2ink 2loc", 3112.90],
  ["249 @ 3ink 1loc", 2340.90],
  ["249 @ 3ink 2loc", 3660.90],
  ["249 @ 5+ink 1loc", 2888.90],
  ["249 @ 5+ink 2loc", 4756.90],
  ["250 @ 1ink 1loc", 1770.00],
  ["250 @ 1ink 1loc +ub", 2075.00],
  ["250 @ 1ink 2loc", 2515.00],
  ["250 @ 1ink 2loc +ub", 3125.00],
  ["250 @ 2ink 1loc", 2075.00],
  ["250 @ 2ink 2loc", 3125.00],
  ["250 @ 3ink 1loc", 2350.00],
  ["250 @ 3ink 2loc", 3675.00],
  ["250 @ 5+ink 1loc", 2900.00],
  ["250 @ 5+ink 2loc", 4775.00],
  ["500 @ 1ink 1loc", 3041.00],
  ["500 @ 1ink 1loc +ub", 3150.00],
  ["500 @ 1ink 2loc", 4032.00],
  ["500 @ 1ink 2loc +ub", 4250.00],
  ["500 @ 2ink 1loc", 3150.00],
  ["500 @ 2ink 2loc", 4250.00],
  ["500 @ 3ink 1loc", 3511.00],
  ["500 @ 3ink 2loc", 4972.00],
  ["500 @ 5+ink 1loc", 4149.00],
  ["500 @ 5+ink 2loc", 6248.00],];

describe("THE ENGINE GRID — 120 committed totals", () => {
  for (const [label, expected] of ENGINE_GRID) {
    test(label, () => {
      // Label shape: "<qty> @ <n>ink <n>loc[ +ub]", e.g. "24 @ 3ink 2loc".
      const match = label.match(/^(\d+) @ (\S+)ink (\d)loc( \+ub)?$/);
      assert.ok(match, `unparseable row label: ${label}`);
      const [, qty, inkToken, locCount, underbase] = match;

      const r = calculateApparelPricing({
        quantity: Number(qty),
        garmentUnitPrice: 4.1,
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
