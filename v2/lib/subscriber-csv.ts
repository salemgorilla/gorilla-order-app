/**
 * THE LIST AS A FILE — OUT AND BACK IN, WITHOUT LOSING ANYBODY.
 *
 * ── WHY BOTH DIRECTIONS LIVE IN ONE FILE ──────────────────────────────────
 * The export is what the shop opens in a spreadsheet; the import is how a
 * list that already exists somewhere else gets in. If the two disagree about
 * a column, the shop discovers it by exporting a list, re-importing it, and
 * finding the names in the company column. Written together, the round trip
 * is a test rather than a hope.
 *
 * ── A NAME IS SOMETHING A CUSTOMER TYPED ─────────────────────────────────
 * A CSV field beginning with =, +, - or @ is a FORMULA to Excel, Numbers and
 * Sheets, and this list's `name` and `company` come straight off the quote
 * form. "=HYPERLINK(...)" in a name field is a real path from a stranger's
 * keyboard to a spreadsheet on the shop's machine.
 *
 * So risky fields go out prefixed with an apostrophe — the convention every
 * spreadsheet understands as "this is text" — and the import strips one
 * leading apostrophe back off. The round trip survives; the formula does
 * not run.
 *
 * ── THE BOM ───────────────────────────────────────────────────────────────
 * Excel on Windows reads a UTF-8 CSV as Latin-1 unless the file opens with a
 * byte-order mark, which turns "Beyoncé" into "BeyoncÃ©" in a list somebody
 * is about to email. It is written on export and stripped on import.
 */

import type { SubscriberRecord } from "./subscribers";

export const CSV_COLUMNS = [
  "email",
  "name",
  "company",
  "optedInAt",
  "source",
  "preChecked",
  "quoteNumber",
  "unsubscribedAt",
] as const;

const BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  let text = String(value ?? "");

  // See the header: a name is something a customer typed.
  if (FORMULA_START.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records: SubscriberRecord[]): string {
  const rows = records.map((record) =>
    [
      record.email,
      record.name,
      record.company,
      record.optedInAt,
      record.source,
      record.unsubscribedAt ? "" : String(record.preChecked),
      record.quoteNumber,
      record.unsubscribedAt ?? "",
    ]
      .map(cell)
      .join(",")
  );

  return `${BOM}${CSV_COLUMNS.join(",")}\n${rows.join("\n")}\n`;
}

/**
 * One line at a time, honouring quotes.
 *
 * Hand-written rather than a dependency because the shape is fixed and small,
 * and because the failure this has to avoid — a quoted field containing a
 * comma silently becoming two columns — is exactly what a split(",") does.
 */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];

    if (quoted) {
      if (character === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current);

  // One leading apostrophe comes back off — see the header.
  return cells.map((value) => value.replace(/^'/, "").trim());
}

export type ImportedRow = {
  email: string;
  name: string;
  company: string;
  /** Empty when the file did not say. NEVER invented — see the route. */
  optedInAt: string;
  source: string;
};

/**
 * Read a file the shop exported, or one somebody else's system produced.
 *
 * Column ORDER is not assumed: the header row is read and the columns are
 * found by name, so a file that has been opened, sorted and re-saved still
 * imports. A file with no recognisable email column imports nothing, which
 * is the correct outcome for a file that is not a subscriber list.
 */
export function parseCsv(text: string): {
  rows: ImportedRow[];
  skipped: number;
  error?: string;
} {
  const clean = String(text || "").replace(/^﻿/, "").trim();
  if (!clean) return { rows: [], skipped: 0, error: "The file is empty." };

  const lines = clean.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  const header = parseLine(lines[0]).map((name) => name.toLowerCase());

  const at = (name: string) => header.indexOf(name.toLowerCase());
  const emailAt = at("email");

  if (emailAt < 0) {
    return {
      rows: [],
      skipped: 0,
      error: `No "email" column. Found: ${header.join(", ") || "nothing"}.`,
    };
  }

  const nameAt = at("name");
  const companyAt = at("company");
  const optedAt = at("optedInAt");
  const sourceAt = at("source");
  const unsubAt = at("unsubscribedAt");

  const rows: ImportedRow[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const email = (cells[emailAt] || "").trim();

    // A row with no address is not a subscriber, and a row that says the
    // person unsubscribed is one this import must not put back on the list.
    if (!email || !email.includes("@") || (unsubAt >= 0 && cells[unsubAt])) {
      skipped += 1;
      continue;
    }

    rows.push({
      email,
      name: nameAt >= 0 ? cells[nameAt] || "" : "",
      company: companyAt >= 0 ? cells[companyAt] || "" : "",
      optedInAt: optedAt >= 0 ? cells[optedAt] || "" : "",
      source: sourceAt >= 0 ? cells[sourceAt] || "" : "",
    });
  }

  return { rows, skipped };
}
