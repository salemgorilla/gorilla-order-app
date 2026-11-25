/**
 * The app's apparel price IS the shop's Printavo screen-print matrix —
 * Gabe, 2026-09-06 — and this file is what makes that a fact rather than
 * a claim: the export Gabe handed over is committed beside the tests, and
 * lib/apparel-pricing-config.ts must agree with it cell for cell.
 *
 * Two directions of drift, both caught:
 *   - someone edits the config (a cell, a markup, a row) without a new
 *     export from Printavo — the shop and the website would quote
 *     differently for the same job;
 *   - the shop changes a cell in Printavo and hands over a new export —
 *     drop the CSV in, this fails, and the config is updated deliberately
 *     (with the price sheet's diff to review) rather than noticed later.
 *
 * The CSV is Printavo's own export format: Quantity, 1..7 color, Product
 * Markup %. Compared as numbers, so "4.5" and "4.50" are the same cell.
 *
 * RETAIL, 2026-11-11: the committed export is the shop's OLD price book and is
 * left exactly as Printavo handed it over. Gabe's decision is that every
 * price the app shows or bills is the old price + 3% ("retail"), so the config
 * must now equal each cell of the export plus 3%, rounded to the cent (round
 * half up) — written out below as `retail`, independent of lib/retail.ts so
 * this file still checks the config against the export rather than against
 * itself. The markup column is a multiplier of cost, not a price, and is
 * compared unchanged. A NEW export dropped in is still an old-book export.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { apparelPricingConfig } from "../lib/apparel-pricing-config";

const CSV_PATH = new URL(
  "./fixtures/printavo-screen-print-matrix-2026-09-06.csv",
  import.meta.url
);

/** The export's old-book dollar cell as its retail price: +3%, to the cent, half up. */
const retail = (oldCell: number) => Math.round(oldCell * 1.03 * 100 + 1e-7) / 100;

type CsvRow = { quantity: number; perPieceByColors: number[]; garmentMarkup: number };

function readMatrix(): CsvRow[] {
  const lines = readFileSync(CSV_PATH, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split(",").map((cell) => cell.trim());

  assert.deepEqual(
    header,
    ["Quantity", "1 color", "2 color", "3 color", "4 color", "5 color", "6 color", "7 color", "Product Markup %"],
    "the export's columns are not the shape this test reads"
  );

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map(Number);
    assert.equal(cells.length, 9, `unreadable row: ${line}`);
    assert.ok(cells.every((n) => Number.isFinite(n)), `non-numeric cell in: ${line}`);

    return {
      quantity: cells[0],
      perPieceByColors: cells.slice(1, 8),
      garmentMarkup: cells[8] / 100,
    };
  });
}

describe("the config is the Printavo export, cell for cell", () => {
  const csv = readMatrix();

  test("the export has the eleven rows the shop quotes from", () => {
    assert.deepEqual(
      csv.map((row) => row.quantity),
      [1, 12, 24, 48, 72, 144, 288, 360, 840, 2496, 5001]
    );
  });

  test("the retail helper is the +3% rule, to the cent, half up", () => {
    // Two cells whose hand arithmetic is the whole point: 4.50 x 1.03 = 4.635
    // (a half cent) goes UP to 4.64, and 5.35 x 1.03 = 5.5105 goes to 5.51.
    assert.equal(retail(4.5), 4.64);
    assert.equal(retail(5.35), 5.51);
    assert.equal(retail(25), 25.75);
  });

  test("every row in the export is in the config, and nothing else is", () => {
    assert.deepEqual(
      [...apparelPricingConfig.tiers].map((t) => t.minQuantity).sort((a, b) => a - b),
      csv.map((row) => row.quantity).sort((a, b) => a - b)
    );
  });

  for (const row of csv) {
    test(`qty ${row.quantity}: seven cells and the markup agree`, () => {
      const tier = apparelPricingConfig.tiers.find((t) => t.minQuantity === row.quantity);

      assert.ok(tier, `no config tier at ${row.quantity}`);
      row.perPieceByColors.forEach((cell, index) => {
        assert.equal(
          tier.perPieceByColors[index],
          retail(cell),
          `qty ${row.quantity}, ${index + 1} colour: config ${tier.perPieceByColors[index]} vs export ${cell} + 3% = ${retail(cell)}`
        );
      });
      assert.equal(
        tier.garmentMarkup,
        row.garmentMarkup,
        `qty ${row.quantity} markup: config ${tier.garmentMarkup} vs export ${row.garmentMarkup}`
      );
    });
  }

  test("the width the app reads is the width the export has", () => {
    assert.equal(apparelPricingConfig.maxColorsPerLocation, 7);
  });
});
