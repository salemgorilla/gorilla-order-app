/**
 * THE EMBROIDERY MATRIX, COMPLETED THE WAY THE REST OF IT WORKS.
 *
 * Gabe, 2026-11-09: "fix the pricing table for embroidery: make the missing
 * quantities relative to how the rest of the pricing works." The export
 * (lib/embroidery-export.ts) has holes and one backwards cell. This fills them
 * with RULES read off the table itself, never with typed-in numbers, so the
 * result can be regenerated, checked and explained.
 *
 * ── WHAT THE TABLE'S OWN PATTERN IS ───────────────────────────────────────
 * Within a row, from 6,001 stitches up to 11,000, every 1,000-stitch band costs
 * the SAME step more than the one before. The step belongs to the row and shrinks
 * as the run grows: $0.65 at 6 pieces, $0.55 at 12, $0.40 from 48 to 731, $0.36
 * at 1,000. (Quantity 6 wobbles: $0.59, $0.65, $0.62.) The first column, "0 -
 * 5000", is one step below the 6001-7000 column, which is how a price list reads
 * when its first column covers everything up to 6,000.
 *
 * ── THE FOUR FILLS ────────────────────────────────────────────────────────
 *  1. 5,001 - 6,000   Same price as 0 - 5,000. The 6001 - 7000 column is exactly
 *                     one step above 0 - 5000, so the band between them cannot
 *                     cost anything extra and still follow the pattern. If the
 *                     shop meant it to step up, this is the cell to change.
 *  2. The 10-11K cell at quantity 6 ($8.50, cheaper than the column before it).
 *                     Replaced by the previous column plus that row's step
 *                     ($8.76 + $0.62 = $9.38). It is the only cell changed.
 *  3. 11,001 - 12,000 The 10-11K price plus that row's step: the same one-band
 *                     step every other band follows.
 *  4. 13,001 - 19,000 Six bands on a straight line from the 12-13K price to the
 *                     20000 column. The export jumps from 13,000 to 20,000 with
 *                     nothing between; the line is the plainest way to bridge it,
 *                     and it needs the export's "20000" column to mean the band
 *                     19,001 - 20,000, which is how it is read here.
 *
 * Every cell records where it came from (`export`, `adjusted` or `filled`), so
 * the shop can print the table with the changes marked and check them against
 * Printavo. Prices are rounded to the cent.
 */

import { EXPORT_COLUMNS, EXPORT_ROWS } from "./embroidery-export";

export type CellSource = "export" | "adjusted" | "filled";

export type MatrixColumn = {
  /** "5001 - 6000 Stitches": the export's own style, one band per column. */
  header: string;
  /** The highest stitch count the column prices (inclusive). */
  upTo: number;
  source: "export" | "filled";
};

export type MatrixCell = { price: number; source: CellSource };

export type MatrixRow = {
  minQuantity: number;
  garmentMarkup: number;
  cells: MatrixCell[];
};

export type CompleteMatrix = { columns: MatrixColumn[]; rows: MatrixRow[] };

/** One band per column, every 1,000 stitches from 6,000 to 20,000, plus the first. */
const BANDS = [5000, ...Array.from({ length: 15 }, (_, i) => 6000 + i * 1000)];

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const headerFor = (upTo: number) => `${upTo === 5000 ? 0 : upTo - 999} - ${upTo} Stitches`;

/** The export's price at a band's upper bound, when the export has that column. */
function exportIndex(upTo: number): number {
  return EXPORT_COLUMNS.findIndex((column) => column.upTo === upTo);
}

export function completeEmbroideryMatrix(): CompleteMatrix {
  const columns: MatrixColumn[] = BANDS.map((upTo) => ({
    header: headerFor(upTo),
    upTo,
    source: exportIndex(upTo) === -1 ? "filled" : "export",
  }));

  const rows: MatrixRow[] = EXPORT_ROWS.map((row) => {
    const at = (upTo: number) => row.perPiece[exportIndex(upTo)];

    // The row's step: the mean of the three 1,000-stitch steps the export gives
    // between 6,001 and 10,000. Exactly constant in every row but quantity 6.
    const step = cents((at(10000) - at(7000)) / 3);

    const price: Record<number, MatrixCell> = {};

    for (const upTo of BANDS) {
      const known = exportIndex(upTo);
      if (known !== -1) price[upTo] = { price: row.perPiece[known], source: "export" };
    }

    // Fill 1: 5,001 - 6,000 is the same band of price as 0 - 5,000.
    price[6000] = { price: at(5000), source: "filled" };

    // Fill 2: the backwards cell. Only when it really is cheaper than its
    // neighbour, so a corrected export would pass through untouched.
    if (at(11000) < at(10000)) {
      price[11000] = { price: cents(at(10000) + step), source: "adjusted" };
    }

    // Fill 3: 11,001 - 12,000 is one more step above 10-11K.
    price[12000] = { price: cents(price[11000].price + step), source: "filled" };

    // Fill 4: 13,001 - 19,000 on a straight line from 13,000 to 20,000.
    const low = at(13000);
    const high = at(20000);
    for (let upTo = 14000; upTo <= 19000; upTo += 1000) {
      price[upTo] = {
        price: cents(low + ((high - low) * (upTo - 13000)) / 7000),
        source: "filled",
      };
    }

    return {
      minQuantity: row.minQuantity,
      garmentMarkup: row.garmentMarkup,
      cells: BANDS.map((upTo) => price[upTo]),
    };
  });

  return { columns, rows };
}

/**
 * The completed table as CSV, in the export's own layout (Quantity, one column
 * per band, Product Markup %). With `marked`, a filled cell carries a trailing
 * "*" and the adjusted one a "+", and a legend follows: that is the copy to
 * print and check. Without it, the file is plain numbers a spreadsheet or
 * Printavo can read.
 */
export function embroideryMatrixCsv(options: { marked?: boolean } = {}): string {
  const { columns, rows } = completeEmbroideryMatrix();

  const mark = (cell: MatrixCell) =>
    cell.price.toFixed(2) +
    (options.marked ? (cell.source === "filled" ? "*" : cell.source === "adjusted" ? "+" : "") : "");

  const lines = [
    ["Quantity", ...columns.map((c) => c.header), "Product Markup %"].join(","),
    ...rows.map((row) =>
      [row.minQuantity, ...row.cells.map(mark), (row.garmentMarkup * 100).toFixed(1)].join(",")
    ),
  ];

  if (options.marked) {
    lines.push(
      "",
      "* = filled in to match how the rest of the table works (no price in the Printavo export)",
      "+ = changed: the Printavo export had a cheaper price for a bigger design (qty 6, 10-11K was 8.50)",
      "Unmarked = exactly as exported from Printavo",
      "Per piece, one placement. A logo over 20000 stitches or an order under 6 pieces is quoted by hand."
    );
  }

  return lines.join("\n") + "\n";
}
