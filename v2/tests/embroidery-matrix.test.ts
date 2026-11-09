/**
 * THE COMPLETED EMBROIDERY MATRIX, CELL FOR CELL.
 *
 * Gabe, 2026-11-09: "fix the pricing table for embroidery: make the missing
 * quantities relative to how the rest of the pricing works", then a CSV to print.
 * The export is pinned as literals copied from `Embroidery-Pricing-Matrix-
 * Export-20261109`; the completed table is pinned as literals too, so a change
 * to a fill RULE is a failing test and a visible, reviewed change to a price.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EXPORT_COLUMNS, EXPORT_ROWS } from "../lib/embroidery-export";
import { completeEmbroideryMatrix, embroideryMatrixCsv } from "../lib/embroidery-matrix";

/** Quantity, the eight export columns, then Product Markup %: the file as sent. */
const SENT: number[][] = [
  [6, 6.25, 6.9, 7.49, 8.14, 8.76, 8.5, 10.0, 17.5, 150],
  [12, 5.5, 6.05, 6.6, 7.15, 7.7, 8.25, 9.75, 17.25, 150],
  [48, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 8.25, 16.0, 150],
  [144, 4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.85, 15.6, 140],
  [432, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 7.4, 15.2, 140],
  [731, 3.8, 4.2, 4.6, 5.0, 5.4, 5.8, 7.0, 14.8, 140],
  [1000, 3.5, 3.86, 4.22, 4.58, 4.94, 5.3, 6.5, 14.3, 140],
];

/** The completed table: 0-5000, then every 1,000-stitch band to 20,000. */
const COMPLETED: number[][] = [
  [6, 6.25, 6.25, 6.9, 7.49, 8.14, 8.76, 9.38, 10.0, 10.0, 11.07, 12.14, 13.21, 14.29, 15.36, 16.43, 17.5],
  [12, 5.5, 5.5, 6.05, 6.6, 7.15, 7.7, 8.25, 8.8, 9.75, 10.82, 11.89, 12.96, 14.04, 15.11, 16.18, 17.25],
  [48, 5.0, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 7.4, 8.25, 9.36, 10.46, 11.57, 12.68, 13.79, 14.89, 16.0],
  [144, 4.6, 4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 7.85, 8.96, 10.06, 11.17, 12.28, 13.39, 14.49, 15.6],
  [432, 4.2, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.4, 8.51, 9.63, 10.74, 11.86, 12.97, 14.09, 15.2],
  [731, 3.8, 3.8, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 7.0, 8.11, 9.23, 10.34, 11.46, 12.57, 13.69, 14.8],
  [1000, 3.5, 3.5, 3.86, 4.22, 4.58, 4.94, 5.3, 5.66, 6.5, 7.61, 8.73, 9.84, 10.96, 12.07, 13.19, 14.3],
];

describe("the export is kept exactly as sent", () => {
  test("every cell, quantity and markup", () => {
    assert.equal(EXPORT_ROWS.length, SENT.length);

    EXPORT_ROWS.forEach((row, i) => {
      assert.equal(row.minQuantity, SENT[i][0]);
      assert.deepEqual([...row.perPiece], SENT[i].slice(1, 9), `row ${row.minQuantity}`);
      assert.equal(row.garmentMarkup, SENT[i][9] / 100);
    });
  });

  test("the export's headers and bounds", () => {
    assert.deepEqual(
      EXPORT_COLUMNS.map((c) => c.header),
      ["0 - 5000 Stitches", "6001 - 7000 Stitches", "7001 - 8000 Stitches", "8001 - 9000 Stitches", "9001 - 10000 Stitches", "10-11K Stitches", "12-13K Stitches", "20000"]
    );
    assert.deepEqual(EXPORT_COLUMNS.map((c) => c.upTo), [5000, 7000, 8000, 9000, 10000, 11000, 13000, 20000]);
  });
});

describe("the completed table", () => {
  const matrix = completeEmbroideryMatrix();

  test("is one band per column, 0-5,000 then every 1,000 stitches to 20,000", () => {
    assert.equal(matrix.columns.length, 16);
    assert.deepEqual(matrix.columns.map((c) => c.upTo), [5000, ...Array.from({ length: 15 }, (_, i) => 6000 + i * 1000)]);
    assert.equal(matrix.columns[0].header, "0 - 5000 Stitches");
    assert.equal(matrix.columns[1].header, "5001 - 6000 Stitches");
    assert.equal(matrix.columns[15].header, "19001 - 20000 Stitches");
  });

  test("every price, to the cent", () => {
    matrix.rows.forEach((row, i) => {
      assert.equal(row.minQuantity, COMPLETED[i][0]);
      assert.deepEqual(row.cells.map((c) => c.price), COMPLETED[i].slice(1), `row ${row.minQuantity}`);
    });
  });

  test("every cell the export has is carried through untouched, except one", () => {
    const changed: string[] = [];

    matrix.rows.forEach((row, r) => {
      EXPORT_COLUMNS.forEach((column, c) => {
        const target = matrix.columns.findIndex((m) => m.upTo === column.upTo);
        if (row.cells[target].price !== EXPORT_ROWS[r].perPiece[c]) changed.push(`${row.minQuantity}@${column.header}`);
      });
    });

    assert.deepEqual(changed, ["6@10-11K Stitches"]);
  });

  test("provenance: the changed cell is 'adjusted', the new bands are 'filled', the rest 'export'", () => {
    const sources = matrix.rows[0].cells.map((c) => c.source);

    assert.equal(sources[6], "adjusted");
    assert.deepEqual(
      sources.map((s, i) => [matrix.columns[i].upTo, s]).filter(([, s]) => s === "filled").map(([u]) => u),
      [6000, 12000, 14000, 15000, 16000, 17000, 18000, 19000]
    );
    assert.equal(matrix.rows[1].cells.filter((c) => c.source === "adjusted").length, 0);
    assert.equal(matrix.rows[1].cells.filter((c) => c.source === "export").length, 8);
  });

  test("5,001-6,000 costs what 0-5,000 does: the pattern's own reading", () => {
    for (const row of matrix.rows) assert.equal(row.cells[1].price, row.cells[0].price);
  });

  test("from 6,001 to 11,000 every band adds the row's one step", () => {
    for (const row of matrix.rows) {
      const steps = [2, 3, 4, 5].map((i) => Math.round((row.cells[i + 1].price - row.cells[i].price) * 100) / 100);
      const spread = Math.max(...steps) - Math.min(...steps);
      // Exactly constant in every row except quantity 6, which the export wobbles.
      assert.ok(spread <= (row.minQuantity === 6 ? 0.061 : 0.005), `qty ${row.minQuantity}: ${steps}`);
    }
  });

  test("13,001-19,000 is a straight line from 12-13K to the 20000 column", () => {
    for (const row of matrix.rows) {
      const low = row.cells[8].price; // 12001 - 13000
      const high = row.cells[15].price; // 19001 - 20000
      for (let k = 1; k <= 6; k += 1) {
        const expected = Math.round((low + ((high - low) * k) / 7) * 100) / 100;
        assert.equal(row.cells[8 + k].price, expected, `qty ${row.minQuantity} +${k}`);
      }
    }
  });

  test("no larger design is cheaper, and no bigger run costs more per piece", () => {
    for (const row of matrix.rows) {
      for (let i = 1; i < row.cells.length; i += 1) assert.ok(row.cells[i].price >= row.cells[i - 1].price);
    }

    for (let c = 0; c < matrix.columns.length; c += 1) {
      for (let r = 1; r < matrix.rows.length; r += 1) {
        assert.ok(matrix.rows[r].cells[c].price <= matrix.rows[r - 1].cells[c].price, `col ${c} row ${r}`);
      }
    }
  });
});

describe("the CSV", () => {
  test("plain: numbers only, the export's layout, one decimal on the markup", () => {
    const lines = embroideryMatrixCsv().trim().split("\n");

    assert.equal(lines.length, 8);
    assert.match(lines[0], /^Quantity,0 - 5000 Stitches,5001 - 6000 Stitches,6001 - 7000 Stitches,/);
    assert.match(lines[0], /,19001 - 20000 Stitches,Product Markup %$/);
    assert.equal(lines[1], "6,6.25,6.25,6.90,7.49,8.14,8.76,9.38,10.00,10.00,11.07,12.14,13.21,14.29,15.36,16.43,17.50,150.0");
    assert.doesNotMatch(embroideryMatrixCsv(), /[*+]/);
  });

  test("marked: filled cells carry *, the changed one +, and a legend follows", () => {
    const csv = embroideryMatrixCsv({ marked: true });
    const row6 = csv.split("\n")[1];

    assert.equal(row6, "6,6.25,6.25*,6.90,7.49,8.14,8.76,9.38+,10.00*,10.00,11.07*,12.14*,13.21*,14.29*,15.36*,16.43*,17.50,150.0");
    assert.match(csv, /\* = filled in/);
    assert.match(csv, /\+ = changed: .* was 8\.50/);
    assert.match(csv, /quoted by hand/);
  });

  test("both are the same numbers", () => {
    const strip = (csv: string) => csv.split("\n").slice(0, 8).join("\n").replace(/[*+]/g, "");

    assert.equal(strip(embroideryMatrixCsv({ marked: true })), embroideryMatrixCsv().trim());
  });
});
