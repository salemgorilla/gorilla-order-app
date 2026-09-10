/**
 * THE LIST AS A FILE.
 *
 * Two things are being protected here, and only one of them is obvious.
 *
 * The obvious one is the ROUND TRIP: what the shop exports has to import
 * back as the same people. If the two sides disagree about a column, nobody
 * finds out until a list is opened in a spreadsheet with the names in the
 * company column.
 *
 * The other is that `name` and `company` are typed by CUSTOMERS, on a public
 * quote form, and a CSV field beginning with "=", "+", "-" or "@" is a
 * FORMULA to Excel, Numbers and Sheets. That is a real path from a
 * stranger's keyboard to code running on the shop's machine.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CSV_COLUMNS, parseCsv, toCsv } from "../lib/subscriber-csv";
import type { SubscriberRecord } from "../lib/subscribers";

function record(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    email: "stacey@example.com",
    name: "Stacey",
    company: "Salem Rowing",
    heardAbout: ["Google"],
    optedInAt: "2026-09-10T12:00:00.000Z",
    source: "labs.gorillasalem.com quote builder",
    preChecked: true,
    quoteNumber: "GS-20260910-AB12C",
    updatedAt: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("out and back in", () => {
  it("the same people come back", () => {
    const { rows, skipped } = parseCsv(
      toCsv([
        record(),
        record({ email: "dana@example.com", name: "Dana", company: "" }),
      ])
    );

    assert.equal(skipped, 0);
    assert.deepEqual(
      rows.map((row) => row.email),
      ["stacey@example.com", "dana@example.com"]
    );
    assert.equal(rows[0].name, "Stacey");
    assert.equal(rows[0].company, "Salem Rowing");
    assert.equal(rows[0].optedInAt, "2026-09-10T12:00:00.000Z");
  });

  it("a comma in a company name does not become a column", () => {
    // What split(",") gets wrong, every time, on the first real list.
    const csv = toCsv([record({ company: "Hale, Barnard & Co" })]);
    const { rows } = parseCsv(csv);

    assert.equal(rows[0].company, "Hale, Barnard & Co");
    assert.equal(rows[0].email, "stacey@example.com");
  });

  it("so does a quote mark, and a newline", () => {
    const { rows } = parseCsv(
      toCsv([record({ name: 'The "Real" Deal', company: "Line one\nLine two" })])
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'The "Real" Deal');
  });

  it("columns are found by name, not by position", () => {
    // A file that has been opened, sorted and re-saved still imports.
    const { rows } = parseCsv("name,email\nStacey,stacey@example.com");

    assert.equal(rows[0].email, "stacey@example.com");
    assert.equal(rows[0].name, "Stacey");
  });

  it("the header is the shape the export writes", () => {
    assert.equal(toCsv([]).replace(/^﻿/, "").trim(), CSV_COLUMNS.join(","));
  });
});

describe("a name is something a customer typed", () => {
  it("a formula is neutralised on the way out", () => {
    const csv = toCsv([record({ name: "=HYPERLINK(\"http://evil\",\"click\")" })]);

    // The apostrophe is what every spreadsheet reads as "this is text".
    assert.match(csv, /'=HYPERLINK/);
    assert.doesNotMatch(csv, /(^|,)=HYPERLINK/m);
  });

  it("and every character a spreadsheet treats as one", () => {
    for (const dangerous of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) {
      const csv = toCsv([record({ company: dangerous })]);
      assert.ok(csv.includes(`'${dangerous}`), dangerous);
    }
  });

  it("but the value survives the round trip", () => {
    // Neutralising it must not corrupt it — the shop's own list should read
    // back exactly as it went out.
    const { rows } = parseCsv(toCsv([record({ name: "=Weird Name" })]));

    assert.equal(rows[0].name, "=Weird Name");
  });

  it("an ordinary apostrophe is not eaten", () => {
    const { rows } = parseCsv(toCsv([record({ company: "O'Brien Signs" })]));

    assert.equal(rows[0].company, "O'Brien Signs");
  });
});

describe("what an import refuses to bring in", () => {
  it("somebody the file says has unsubscribed", () => {
    // The classic way a shop re-mails everyone who ever left: export, edit,
    // re-import. The column is honoured on the way back in.
    const csv = toCsv([
      record(),
      record({ email: "gone@example.com", unsubscribedAt: "2026-10-01T00:00:00.000Z" }),
    ]);

    const { rows, skipped } = parseCsv(csv);

    assert.deepEqual(rows.map((row) => row.email), ["stacey@example.com"]);
    assert.equal(skipped, 1);
  });

  it("a row that is not an address", () => {
    const { rows, skipped } = parseCsv(
      "email,name\nstacey@example.com,Stacey\n,Nobody\nnot-an-email,Also Nobody"
    );

    assert.equal(rows.length, 1);
    assert.equal(skipped, 2);
  });

  it("a file that is not a subscriber list at all", () => {
    const result = parseCsv("style,colour,quantity\n3001,White,24");

    assert.equal(result.rows.length, 0);
    assert.match(result.error ?? "", /No "email" column/);
  });

  it("an empty file", () => {
    assert.match(parseCsv("").error ?? "", /empty/i);
    assert.match(parseCsv("   \n ").error ?? "", /empty/i);
  });
});

describe("the spreadsheet opens it correctly", () => {
  it("a byte-order mark, so Excel does not mangle an accent", () => {
    // Without it Excel on Windows reads UTF-8 as Latin-1 and "Beyoncé"
    // becomes "BeyoncÃ©" in a list somebody is about to email.
    assert.ok(toCsv([record()]).startsWith("﻿"));
  });

  it("and the import strips it back off", () => {
    const { rows } = parseCsv(toCsv([record({ name: "Beyoncé" })]));

    assert.equal(rows[0].email, "stacey@example.com");
    assert.equal(rows[0].name, "Beyoncé");
  });
});
