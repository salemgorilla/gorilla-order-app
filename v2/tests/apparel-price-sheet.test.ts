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

describe("ANCHORS — browser-verified figures, 31 Aug 2026", () => {
  // Stacey Beer's scenario, driven in Chromium against the dev server with
  // the catalog fixture: every figure below appeared ON SCREEN and matched
  // the engine to the cent. Black Starter Tee blends to 4.55.
  test("Stacey: 20 black shirts, 3 colors, front = $352.00", () => {
    const r = calculateApparelPricing({
      quantity: 20,
      garmentUnitPrice: blendedGarmentUnitPrice(colorOf("Starter Tee", "Black")),
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "352.00");
  });

  test("Stacey's ink lever: 1 color = $276.00", () => {
    const r = calculateApparelPricing({
      quantity: 20,
      garmentUnitPrice: 4.55,
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "276.00");
  });

  test("Stacey's tier lever: 24 shirts = $359.40 ($14.97 each)", () => {
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 4.55,
      printLocations: ["Front"],
      inkColors: "3 colors",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "359.40");
    assert.equal(r.unitPrice.toFixed(2), "14.97");
  });

  test("Kurt: 1 white shirt, front and back, 1 color = $64.60", () => {
    const r = calculateApparelPricing({
      quantity: 1,
      garmentUnitPrice: blendedGarmentUnitPrice(colorOf("Starter Tee", "White")),
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "64.60");
  });

  test("the audit's worked example: 24 white M/L exact = $252.76", () => {
    // Exact basis: M and L both price 3.49, so the quantized unit is 3.49.
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 3.49,
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "252.76");
  });

  test("the audit's second location: $337.76", () => {
    const r = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 3.49,
      printLocations: ["Front", "Back"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    assert.equal(r.total.toFixed(2), "337.76");
  });
});

/**
 * Every colour's blended per-shirt price, from the committed 25 Aug capture
 * of the live catalog. [product / colour, blended unit].
 */
const BLEND_SHEET: [string, number][] = [
  ["Premium Soft Tee / Athletic Heather", 6.35],
  ["Premium Soft Tee / Black Heather", 6.35],
  ["Premium Soft Tee / Dark Grey Heather", 6.35],
  ["Premium Soft Tee / Deep Heather", 6.35],
  ["Premium Soft Tee / Heather Aqua", 6.35],
  ["Premium Soft Tee / Heather Autumn", 6.35],
  ["Premium Soft Tee / Heather Baby Blue", 6.35],
  ["Premium Soft Tee / Heather Blue", 6.35],
  ["Premium Soft Tee / Heather Blue Lagoon", 6.35],
  ["Premium Soft Tee / Heather Blue Storm", 6.35],
  ["Premium Soft Tee / Heather Brown", 6.35],
  ["Premium Soft Tee / Heather Bubble Gum", 6.35],
  ["Premium Soft Tee / Heather Canvas Red", 6.35],
  ["Premium Soft Tee / Heather Cardinal", 6.35],
  ["Premium Soft Tee / Heather Carolina Blue", 6.35],
  ["Premium Soft Tee / Heather Cement", 6.35],
  ["Premium Soft Tee / Heather Charity Pink", 6.35],
  ["Premium Soft Tee / Heather Clay", 6.35],
  ["Premium Soft Tee / Heather Columbia Blue", 6.35],
  ["Premium Soft Tee / Heather Cool Grey", 6.35],
  ["Premium Soft Tee / Heather Dark Lavender", 6.35],
  ["Premium Soft Tee / Heather Deep Teal", 6.35],
  ["Premium Soft Tee / Heather Dust", 6.35],
  ["Premium Soft Tee / Heather Dusty Blue", 6.35],
  ["Premium Soft Tee / Heather Emerald", 6.35],
  ["Premium Soft Tee / Heather Forest", 6.35],
  ["Premium Soft Tee / Heather French Vanilla", 6.35],
  ["Premium Soft Tee / Heather Grass Green", 6.35],
  ["Premium Soft Tee / Heather Green", 6.35],
  ["Premium Soft Tee / Heather Ice Blue", 6.35],
  ["Premium Soft Tee / Heather Kelly", 6.35],
  ["Premium Soft Tee / Heather Lapis", 6.35],
  ["Premium Soft Tee / Heather Magenta", 6.35],
  ["Premium Soft Tee / Heather Marmalade", 6.15],
  ["Premium Soft Tee / Heather Maroon", 6.35],
  ["Premium Soft Tee / Heather Mauve", 6.35],
  ["Premium Soft Tee / Heather Midnight Navy", 6.35],
  ["Premium Soft Tee / Heather Military Green", 6.35],
  ["Premium Soft Tee / Heather Mint", 6.35],
  ["Premium Soft Tee / Heather Mustard", 6.35],
  ["Premium Soft Tee / Heather Natural", 6.35],
  ["Premium Soft Tee / Heather Navy", 6.35],
  ["Premium Soft Tee / Heather Oatmeal", 6.35],
  ["Premium Soft Tee / Heather Olive", 6.35],
  ["Premium Soft Tee / Heather Orange", 6.35],
  ["Premium Soft Tee / Heather Orchid", 6.35],
  ["Premium Soft Tee / Heather Peach", 6.35],
  ["Premium Soft Tee / Heather Pink", 6.35],
  ["Premium Soft Tee / Heather Pink Gravel", 6.35],
  ["Premium Soft Tee / Heather Prism Blue", 6.35],
  ["Premium Soft Tee / Heather Prism Dusty Blue", 6.35],
  ["Premium Soft Tee / Heather Prism Ice Blue", 6.35],
  ["Premium Soft Tee / Heather Prism Lilac", 6.35],
  ["Premium Soft Tee / Heather Prism Mint", 6.35],
  ["Premium Soft Tee / Heather Prism Natural", 6.35],
  ["Premium Soft Tee / Heather Prism Peach", 6.35],
  ["Premium Soft Tee / Heather Prism Sunset", 5.90],
  ["Premium Soft Tee / Heather Purple", 6.35],
  ["Premium Soft Tee / Heather Raspberry", 6.35],
  ["Premium Soft Tee / Heather Red", 6.35],
  ["Premium Soft Tee / Heather Sage", 6.35],
  ["Premium Soft Tee / Heather Sand Dune", 6.35],
  ["Premium Soft Tee / Heather Sea Green", 6.35],
  ["Premium Soft Tee / Heather Silver", 6.35],
  ["Premium Soft Tee / Heather Slate", 6.35],
  ["Premium Soft Tee / Heather Soft Cream", 6.35],
  ["Premium Soft Tee / Heather Stone", 6.35],
  ["Premium Soft Tee / Heather Storm", 6.35],
  ["Premium Soft Tee / Heather Sunset", 6.35],
  ["Premium Soft Tee / Heather Tan", 6.35],
  ["Premium Soft Tee / Heather Team Purple", 6.35],
  ["Premium Soft Tee / Heather True Royal", 6.35],
  ["Premium Soft Tee / Heather Yellow", 6.35],
  ["Premium Soft Tee / Heather Yellow Gold", 6.35],
  ["Premium Soft Tee / Neon Blue", 6.35],
  ["Premium Soft Tee / Neon Orange", 6.35],
  ["Premium Soft Tee / Neon Pink", 6.35],
  ["Premium Soft Tee / Neon Yellow", 6.35],
  ["Premium Soft Tee / Solid Asphalt Blend", 6.35],
  ["Premium Soft Tee / Solid Black Blend", 6.35],
  ["Premium Soft Tee / Solid Navy Blend", 6.35],
  ["Premium Soft Tee / Solid Red Blend", 6.35],
  ["Premium Soft Tee / Solid True Royal Blend", 6.35],
  ["Premium Soft Tee / Solid White Blend", 6.35],
  ["Classic Hoodie / Antique Cherry Red", 15.45],
  ["Classic Hoodie / Antique Sapphire", 15.45],
  ["Classic Hoodie / Ash", 15.45],
  ["Classic Hoodie / Azalea", 15.45],
  ["Classic Hoodie / Black", 15.45],
  ["Classic Hoodie / Cardinal Red", 15.45],
  ["Classic Hoodie / Carolina Blue", 15.45],
  ["Classic Hoodie / Charcoal", 15.45],
  ["Classic Hoodie / Cherry Red", 15.45],
  ["Classic Hoodie / Dark Chocolate", 15.45],
  ["Classic Hoodie / Dark Heather", 15.45],
  ["Classic Hoodie / Fan Charcoal Heather", 15.45],
  ["Classic Hoodie / Fan Dark Green", 15.45],
  ["Classic Hoodie / Fan Deep Royal", 15.45],
  ["Classic Hoodie / Forest", 15.45],
  ["Classic Hoodie / Garnet", 15.45],
  ["Classic Hoodie / Gold", 15.45],
  ["Classic Hoodie / Graphite Heather", 15.45],
  ["Classic Hoodie / Heather Dark Green", 15.45],
  ["Classic Hoodie / Heather Dark Maroon", 15.45],
  ["Classic Hoodie / Heather Dark Navy", 15.45],
  ["Classic Hoodie / Heather Deep Royal", 15.45],
  ["Classic Hoodie / Heather Scarlet Red", 14.90],
  ["Classic Hoodie / Heliconia", 15.45],
  ["Classic Hoodie / Indigo Blue", 15.45],
  ["Classic Hoodie / Irish Green", 15.45],
  ["Classic Hoodie / Light Blue", 15.45],
  ["Classic Hoodie / Light Pink", 15.45],
  ["Classic Hoodie / Maroon", 15.45],
  ["Classic Hoodie / Military Green", 15.45],
  ["Classic Hoodie / Mint Green", 15.45],
  ["Classic Hoodie / Navy", 15.45],
  ["Classic Hoodie / Neon Blue", 15.45],
  ["Classic Hoodie / Old Gold", 15.45],
  ["Classic Hoodie / Orange", 15.45],
  ["Classic Hoodie / Orchid", 15.45],
  ["Classic Hoodie / Purple", 15.45],
  ["Classic Hoodie / Red", 15.45],
  ["Classic Hoodie / Royal", 15.45],
  ["Classic Hoodie / Safety Green", 15.45],
  ["Classic Hoodie / Safety Orange", 15.45],
  ["Classic Hoodie / Safety Pink", 15.45],
  ["Classic Hoodie / Sand", 15.45],
  ["Classic Hoodie / Sapphire", 15.45],
  ["Classic Hoodie / Sport Grey", 15.45],
  ["Classic Hoodie / Violet", 15.45],
  ["Classic Hoodie / White", 15.45],
  ["Starter Tee / Antique Cherry Red", 4.55],
  ["Starter Tee / Antique Irish Green", 4.55],
  ["Starter Tee / Antique Royal", 4.55],
  ["Starter Tee / Ash", 4.55],
  ["Starter Tee / Azalea", 4.55],
  ["Starter Tee / Black", 4.55],
  ["Starter Tee / Blue Dusk", 4.55],
  ["Starter Tee / Cardinal Red", 4.55],
  ["Starter Tee / Carolina Blue", 4.55],
  ["Starter Tee / Charcoal", 4.55],
  ["Starter Tee / Cherry Red", 4.55],
  ["Starter Tee / Cornsilk", 4.55],
  ["Starter Tee / Daisy", 4.55],
  ["Starter Tee / Dark Chocolate", 4.55],
  ["Starter Tee / Dark Heather", 4.55],
  ["Starter Tee / Forest", 4.55],
  ["Starter Tee / Galapagos Blue", 4.55],
  ["Starter Tee / Gold", 4.55],
  ["Starter Tee / Heather Cardinal", 4.55],
  ["Starter Tee / Heather Indigo", 4.55],
  ["Starter Tee / Heather Navy", 4.55],
  ["Starter Tee / Heather Sapphire", 4.55],
  ["Starter Tee / Heliconia", 4.55],
  ["Starter Tee / Ice Grey", 4.55],
  ["Starter Tee / Indigo Blue", 4.55],
  ["Starter Tee / Iris", 4.55],
  ["Starter Tee / Irish Green", 4.55],
  ["Starter Tee / Jade Dome", 4.55],
  ["Starter Tee / Kelly", 4.55],
  ["Starter Tee / Light Blue", 4.55],
  ["Starter Tee / Light Pink", 4.55],
  ["Starter Tee / Lime", 4.55],
  ["Starter Tee / Maroon", 4.55],
  ["Starter Tee / Metro Blue", 4.55],
  ["Starter Tee / Military Green", 4.55],
  ["Starter Tee / Mint Green", 4.55],
  ["Starter Tee / Natural", 4.10],
  ["Starter Tee / Navy", 4.55],
  ["Starter Tee / Olive", 4.55],
  ["Starter Tee / Orange", 4.55],
  ["Starter Tee / Orchid", 4.55],
  ["Starter Tee / PFD White", 4.40],
  ["Starter Tee / Pistachio", 4.55],
  ["Starter Tee / Prairie Dust", 4.55],
  ["Starter Tee / Purple", 4.55],
  ["Starter Tee / Red", 4.55],
  ["Starter Tee / Royal", 4.55],
  ["Starter Tee / Safety Green", 4.55],
  ["Starter Tee / Safety Orange", 4.55],
  ["Starter Tee / Safety Pink", 4.55],
  ["Starter Tee / Sand", 4.55],
  ["Starter Tee / Sapphire", 4.55],
  ["Starter Tee / Sky", 4.55],
  ["Starter Tee / Sport Grey", 4.55],
  ["Starter Tee / Stone Blue", 4.55],
  ["Starter Tee / Tan", 4.55],
  ["Starter Tee / Tangerine", 4.55],
  ["Starter Tee / Texas Orange", 4.55],
  ["Starter Tee / Vegas Gold", 4.55],
  ["Starter Tee / White", 4.10],];

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
  ["1 @ 1ink 1loc", 37.10],
  ["1 @ 1ink 1loc +ub", 37.85],
  ["1 @ 1ink 2loc", 64.60],
  ["1 @ 1ink 2loc +ub", 65.35],
  ["1 @ 2ink 1loc", 62.75],
  ["1 @ 2ink 2loc", 115.25],
  ["1 @ 3ink 1loc", 88.40],
  ["1 @ 3ink 2loc", 165.90],
  ["1 @ 5+ink 1loc", 139.70],
  ["1 @ 5+ink 2loc", 267.20],
  ["12 @ 1ink 1loc", 170.20],
  ["12 @ 1ink 1loc +ub", 179.20],
  ["12 @ 1ink 2loc", 225.20],
  ["12 @ 1ink 2loc +ub", 234.20],
  ["12 @ 2ink 1loc", 203.00],
  ["12 @ 2ink 2loc", 283.00],
  ["12 @ 3ink 1loc", 235.80],
  ["12 @ 3ink 2loc", 340.80],
  ["12 @ 5+ink 1loc", 301.40],
  ["12 @ 5+ink 2loc", 456.40],
  ["23 @ 1ink 1loc", 303.30],
  ["23 @ 1ink 1loc +ub", 320.55],
  ["23 @ 1ink 2loc", 385.80],
  ["23 @ 1ink 2loc +ub", 403.05],
  ["23 @ 2ink 1loc", 343.25],
  ["23 @ 2ink 2loc", 450.75],
  ["23 @ 3ink 1loc", 383.20],
  ["23 @ 3ink 2loc", 515.70],
  ["23 @ 5+ink 1loc", 463.10],
  ["23 @ 5+ink 2loc", 645.60],
  ["24 @ 1ink 1loc", 267.40],
  ["24 @ 1ink 1loc +ub", 285.40],
  ["24 @ 1ink 2loc", 352.40],
  ["24 @ 1ink 2loc +ub", 370.40],
  ["24 @ 2ink 1loc", 308.00],
  ["24 @ 2ink 2loc", 418.00],
  ["24 @ 3ink 1loc", 348.60],
  ["24 @ 3ink 2loc", 483.60],
  ["24 @ 5+ink 1loc", 429.80],
  ["24 @ 5+ink 2loc", 614.80],
  ["25 @ 1ink 1loc", 277.50],
  ["25 @ 1ink 1loc +ub", 296.25],
  ["25 @ 1ink 2loc", 365.00],
  ["25 @ 1ink 2loc +ub", 383.75],
  ["25 @ 2ink 1loc", 318.75],
  ["25 @ 2ink 2loc", 431.25],
  ["25 @ 3ink 1loc", 360.00],
  ["25 @ 3ink 2loc", 497.50],
  ["25 @ 5+ink 1loc", 442.50],
  ["25 @ 5+ink 2loc", 630.00],
  ["49 @ 1ink 1loc", 519.90],
  ["49 @ 1ink 1loc +ub", 556.65],
  ["49 @ 1ink 2loc", 667.40],
  ["49 @ 1ink 2loc +ub", 704.15],
  ["49 @ 2ink 1loc", 576.75],
  ["49 @ 2ink 2loc", 749.25],
  ["49 @ 3ink 1loc", 633.60],
  ["49 @ 3ink 2loc", 831.10],
  ["49 @ 5+ink 1loc", 747.30],
  ["49 @ 5+ink 2loc", 994.80],
  ["50 @ 1ink 1loc", 467.50],
  ["50 @ 1ink 1loc +ub", 505.00],
  ["50 @ 1ink 2loc", 617.50],
  ["50 @ 1ink 2loc +ub", 655.00],
  ["50 @ 2ink 1loc", 525.00],
  ["50 @ 2ink 2loc", 700.00],
  ["50 @ 3ink 1loc", 582.50],
  ["50 @ 3ink 2loc", 782.50],
  ["50 @ 5+ink 1loc", 697.50],
  ["50 @ 5+ink 2loc", 947.50],
  ["99 @ 1ink 1loc", 901.15],
  ["99 @ 1ink 1loc +ub", 975.40],
  ["99 @ 1ink 2loc", 1173.65],
  ["99 @ 1ink 2loc +ub", 1247.90],
  ["99 @ 2ink 1loc", 990.50],
  ["99 @ 2ink 2loc", 1288.00],
  ["99 @ 3ink 1loc", 1079.85],
  ["99 @ 3ink 2loc", 1402.35],
  ["99 @ 5+ink 1loc", 1258.55],
  ["99 @ 5+ink 2loc", 1631.05],
  ["100 @ 1ink 1loc", 835.00],
  ["100 @ 1ink 1loc +ub", 910.00],
  ["100 @ 1ink 2loc", 1110.00],
  ["100 @ 1ink 2loc +ub", 1185.00],
  ["100 @ 2ink 1loc", 925.00],
  ["100 @ 2ink 2loc", 1225.00],
  ["100 @ 3ink 1loc", 1015.00],
  ["100 @ 3ink 2loc", 1340.00],
  ["100 @ 5+ink 1loc", 1195.00],
  ["100 @ 5+ink 2loc", 1570.00],
  ["249 @ 1ink 1loc", 2041.90],
  ["249 @ 1ink 1loc +ub", 2228.65],
  ["249 @ 1ink 2loc", 2689.40],
  ["249 @ 1ink 2loc +ub", 2876.15],
  ["249 @ 2ink 1loc", 2228.75],
  ["249 @ 2ink 2loc", 2901.25],
  ["249 @ 3ink 1loc", 2415.60],
  ["249 @ 3ink 2loc", 3113.10],
  ["249 @ 5+ink 1loc", 2789.30],
  ["249 @ 5+ink 2loc", 3536.80],
  ["250 @ 1ink 1loc", 1862.50],
  ["250 @ 1ink 1loc +ub", 2050.00],
  ["250 @ 1ink 2loc", 2512.50],
  ["250 @ 1ink 2loc +ub", 2700.00],
  ["250 @ 2ink 1loc", 2050.00],
  ["250 @ 2ink 2loc", 2725.00],
  ["250 @ 3ink 1loc", 2237.50],
  ["250 @ 3ink 2loc", 2937.50],
  ["250 @ 5+ink 1loc", 2612.50],
  ["250 @ 5+ink 2loc", 3362.50],
  ["500 @ 1ink 1loc", 3700.00],
  ["500 @ 1ink 1loc +ub", 4075.00],
  ["500 @ 1ink 2loc", 4975.00],
  ["500 @ 1ink 2loc +ub", 5350.00],
  ["500 @ 2ink 1loc", 4050.00],
  ["500 @ 2ink 2loc", 5350.00],
  ["500 @ 3ink 1loc", 4400.00],
  ["500 @ 3ink 2loc", 5725.00],
  ["500 @ 5+ink 1loc", 5100.00],
  ["500 @ 5+ink 2loc", 6475.00],];

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
