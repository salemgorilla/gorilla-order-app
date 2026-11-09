/**
 * Writes the completed embroidery matrix as two CSVs: one marked for printing
 * and checking, one plain numbers a spreadsheet or Printavo can read.
 *
 *   npx tsx scripts/embroidery-matrix-csv.ts [output-directory]
 *
 * The numbers come from lib/embroidery-matrix.ts, the same code the app prices
 * from, so a printed copy can never drift from what the app uses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { embroideryMatrixCsv } from "../lib/embroidery-matrix";

const dir = resolve(process.argv[2] ?? ".");
mkdirSync(dir, { recursive: true });

const marked = join(dir, "embroidery-pricing-matrix-MARKED-for-printing.csv");
const plain = join(dir, "embroidery-pricing-matrix-completed.csv");

writeFileSync(marked, embroideryMatrixCsv({ marked: true }));
writeFileSync(plain, embroideryMatrixCsv());

console.log(`Wrote ${marked}\nWrote ${plain}`);
