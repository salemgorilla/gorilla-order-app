/**
 * THE EMBROIDERY MATRIX AS GABE SENT IT — verbatim, never edited.
 *
 * `Embroidery-Pricing-Matrix-Export-20261109`, from Printavo. This file holds
 * the export and nothing else, so the original is always on hand to compare
 * against. The completed table the app prices from is derived from it by
 * lib/embroidery-matrix.ts; do not "fix" a cell here, fix the rule there.
 *
 * Every cell is the embroidery charge PER PIECE FOR ONE PLACEMENT. The column
 * headers are the export's own; `upTo` is the highest stitch count the column
 * prices. The last column is headed just "20000".
 */

export type ExportColumn = { header: string; upTo: number };

export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { header: "0 - 5000 Stitches", upTo: 5000 },
  { header: "6001 - 7000 Stitches", upTo: 7000 },
  { header: "7001 - 8000 Stitches", upTo: 8000 },
  { header: "8001 - 9000 Stitches", upTo: 9000 },
  { header: "9001 - 10000 Stitches", upTo: 10000 },
  { header: "10-11K Stitches", upTo: 11000 },
  { header: "12-13K Stitches", upTo: 13000 },
  { header: "20000", upTo: 20000 },
];

export type ExportRow = {
  /** The run size this row starts at. Rows are ranges: 48 means 48 to 143. */
  minQuantity: number;
  /** One price per column above, in order. */
  perPiece: readonly number[];
  /** The blank's markup at this run size, as the matrix writes it divided by 100. */
  garmentMarkup: number;
};

export const EXPORT_ROWS: readonly ExportRow[] = [
  { minQuantity: 6, perPiece: [6.25, 6.9, 7.49, 8.14, 8.76, 8.5, 10.0, 17.5], garmentMarkup: 1.5 },
  { minQuantity: 12, perPiece: [5.5, 6.05, 6.6, 7.15, 7.7, 8.25, 9.75, 17.25], garmentMarkup: 1.5 },
  { minQuantity: 48, perPiece: [5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 8.25, 16.0], garmentMarkup: 1.5 },
  { minQuantity: 144, perPiece: [4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.85, 15.6], garmentMarkup: 1.4 },
  { minQuantity: 432, perPiece: [4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 7.4, 15.2], garmentMarkup: 1.4 },
  { minQuantity: 731, perPiece: [3.8, 4.2, 4.6, 5.0, 5.4, 5.8, 7.0, 14.8], garmentMarkup: 1.4 },
  { minQuantity: 1000, perPiece: [3.5, 3.86, 4.22, 4.58, 4.94, 5.3, 6.5, 14.3], garmentMarkup: 1.4 },
];
