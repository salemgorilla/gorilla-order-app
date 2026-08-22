import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  calculateSignsPricing,
  getYardSignUnitPrice,
} from "../lib/signs-pricing";
import { signsPricingConfig } from "../lib/signs-pricing-config";

/**
 * The signs price sheet. Every figure the app will quote for a sign, written
 * down.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * tests/price-sheet.test.ts does this for stickers, and says why: a formula
 * test passes just as happily after someone changes a rate, so long as they
 * change it consistently. A table of literal dollars does not. Any edit that
 * moves a price shows up here as a readable diff, and either the change was
 * intended — in which case the new sheet is reviewed and committed with it —
 * or it was not, and the suite caught a repricing nobody asked for.
 *
 * Signs had no such table. They are formula-tested in money-path.test.ts,
 * quote-totals.test.ts and shop-email-rows.test.ts, but nowhere did the
 * actual dollars appear. Signs were raised 10% on 2026-08-02 — the shop's
 * printed boards still do not match — so this is a live file, which is
 * exactly when a sheet earns its keep.
 *
 * ── WHY IT IS WORTH LESS THAN THE STICKER SHEET, AND STILL WORTH HAVING ───
 * Stickers self-check-out: nothing between a repricing and a customer's card
 * is reviewed. Signs are invoiced by hand, so a wrong figure here is caught
 * by a human before money moves. What it costs instead is a customer quoted
 * one number and invoiced another, which is the shop's credibility rather
 * than its bank balance. Cheaper, not free.
 *
 * ── THE NUMBERS ARE LITERALS, DELIBERATELY ────────────────────────────────
 * Generated once from calculateSignsPricing and pasted. They are NOT
 * recomputed at test time — a table the code fills in agrees with the code no
 * matter what it does.
 *
 * ── WHAT THE GRID COVERS ──────────────────────────────────────────────────
 * Only configurations the builder can actually reach:
 *
 *   yard    every tier boundary and the quantity either side of it, single
 *           and double sided, with and without step stakes. Frozen at
 *           18" x 24" because getSignDimensions freezes it there — the
 *           '24" x 36"' entry in signsPricingConfig is unreachable from the
 *           app and so is not on this sheet.
 *   banner  three materials x four sizes x two quantities, plus both
 *           double-sided constructions (18 oz surcharge, 13 oz sewn), the
 *           no-hem credit, and every finishing add-on.
 *   poster  three sizes x two quantities.
 *   rigid   all eleven materials, plus sizes and double-sided on PVC 1/8".
 *
 * ── WHAT IS NOT COVERED ───────────────────────────────────────────────────
 * Tax — signs quote pre-tax and say so (`taxNote`). Shipping — signs have
 * none; see lib/tax.ts. The $22 custom size fee, because no reachable quote
 * can trigger it: `isCustomSize` is set from `signsQuote.size === CUSTOM_SIZE`
 * and the size selector is gone, so the only product that ever sets it is
 * window graphics, which is hand-quoted and never reaches this engine. That
 * is recorded as an assertion at the bottom rather than left as a gap.
 *
 * TO REGENERATE after an intended price change: run calculateSignsPricing
 * over the same grid, paste the output below, and put the reason in the
 * commit.
 *
 * Columns: method | qty | WxH inches | material | sides | finishing |
 *          banner add-ons | total
 */
const PRICE_SHEET = `
yard   | 1   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 46.00
yard   | 1   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 59.00
yard   | 2   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 66.00
yard   | 2   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 103.00
yard   | 5   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 108.00
yard   | 5   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 147.00
yard   | 6   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 108.00
yard   | 6   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 147.00
yard   | 9   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 150.00
yard   | 9   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 213.00
yard   | 10  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 150.00
yard   | 10  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 215.00
yard   | 19  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 265.00
yard   | 19  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 395.00
yard   | 20  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 265.00
yard   | 20  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 395.00
yard   | 29  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 345.00
yard   | 29  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 555.00
yard   | 30  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 345.00
yard   | 30  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 555.00
yard   | 50  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 565.00
yard   | 50  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 915.00
yard   | 1   | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 48.50
yard   | 1   | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 61.50
yard   | 10  | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 175.00
yard   | 10  | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 240.00
yard   | 30  | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 420.00
yard   | 30  | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 630.00
banner | 1   | 48x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 87.00
banner | 5   | 48x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 375.00
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 177.00
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 825.00
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 303.00
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 1455.00
banner | 1   | 96x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 159.00
banner | 5   | 96x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 735.00
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 115.00
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 515.00
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 240.00
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 1140.00
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 415.00
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 2015.00
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 215.00
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 1015.00
banner | 1   | 48x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 87.00
banner | 5   | 48x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 375.00
banner | 1   | 72x36   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 177.00
banner | 5   | 72x36   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 825.00
banner | 1   | 96x48   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 303.00
banner | 5   | 96x48   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 1455.00
banner | 1   | 96x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 159.00
banner | 5   | 96x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 735.00
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 179.00
banner | 1   | 48x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 291.00
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 835.00
banner | 5   | 48x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 1395.00
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 384.00
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 537.00
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 1860.00
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 2625.00
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 671.00
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 855.00
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 3295.00
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 4215.00
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 343.00
banner | 1   | 96x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 523.00
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 1655.00
banner | 5   | 96x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 2555.00
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 85.00
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 365.00
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 195.00
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 915.00
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 355.00
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 1715.00
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 165.00
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 765.00
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets               | 192.00
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | windSlits                 | 183.00
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets+windSlits     | 198.00
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | reinforcedWebbing         | 999.00
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | reinforcedWebbing         | 671.00
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets               | 900.00
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | windSlits                 | 855.00
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets+windSlits     | 930.00
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | reinforcedWebbing         | 4935.00
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | reinforcedWebbing         | 3295.00
poster | 1   | 24x18   | Indoor Poster Paper       | single | Standard           | -                         | 31.50
poster | 5   | 24x18   | Indoor Poster Paper       | single | Standard           | -                         | 97.50
poster | 1   | 36x24   | Indoor Poster Paper       | single | Standard           | -                         | 48.00
poster | 5   | 36x24   | Indoor Poster Paper       | single | Standard           | -                         | 180.00
poster | 1   | 48x36   | Indoor Poster Paper       | single | Standard           | -                         | 81.00
poster | 5   | 48x36   | Indoor Poster Paper       | single | Standard           | -                         | 345.00
rigid  | 1   | 24x18   | PVC 1/8"                  | single | Drilled Holes      | -                         | 42.00
rigid  | 5   | 24x18   | PVC 1/8"                  | single | Drilled Holes      | -                         | 150.00
rigid  | 1   | 24x18   | PVC 1/4"                  | single | Drilled Holes      | -                         | 48.00
rigid  | 5   | 24x18   | PVC 1/4"                  | single | Drilled Holes      | -                         | 180.00
rigid  | 1   | 24x18   | PVC 1/2"                  | single | Drilled Holes      | -                         | 55.50
rigid  | 5   | 24x18   | PVC 1/2"                  | single | Drilled Holes      | -                         | 217.50
rigid  | 1   | 24x18   | Dibond 1/8"               | single | Drilled Holes      | -                         | 48.00
rigid  | 5   | 24x18   | Dibond 1/8"               | single | Drilled Holes      | -                         | 180.00
rigid  | 1   | 24x18   | Dibond 1/4"               | single | Drilled Holes      | -                         | 55.50
rigid  | 5   | 24x18   | Dibond 1/4"               | single | Drilled Holes      | -                         | 217.50
rigid  | 1   | 24x18   | AlumaCorr 0.2"            | single | Drilled Holes      | -                         | 48.00
rigid  | 5   | 24x18   | AlumaCorr 0.2"            | single | Drilled Holes      | -                         | 180.00
rigid  | 1   | 24x18   | AlumaCorr 0.4"            | single | Drilled Holes      | -                         | 55.50
rigid  | 5   | 24x18   | AlumaCorr 0.4"            | single | Drilled Holes      | -                         | 217.50
rigid  | 1   | 24x18   | Aluminum 040              | single | Drilled Holes      | -                         | 48.00
rigid  | 5   | 24x18   | Aluminum 040              | single | Drilled Holes      | -                         | 180.00
rigid  | 1   | 24x18   | Aluminum 080              | single | Drilled Holes      | -                         | 55.50
rigid  | 5   | 24x18   | Aluminum 080              | single | Drilled Holes      | -                         | 217.50
rigid  | 1   | 24x18   | Corrugated 1/4"           | single | Drilled Holes      | -                         | 42.00
rigid  | 5   | 24x18   | Corrugated 1/4"           | single | Drilled Holes      | -                         | 150.00
rigid  | 1   | 24x18   | Corrugated 1/2"           | single | Drilled Holes      | -                         | 48.00
rigid  | 5   | 24x18   | Corrugated 1/2"           | single | Drilled Holes      | -                         | 180.00
rigid  | 2   | 18x12   | PVC 1/8"                  | single | Drilled Holes      | -                         | 42.00
rigid  | 2   | 18x12   | PVC 1/8"                  | double | Drilled Holes      | -                         | 66.00
rigid  | 2   | 36x24   | PVC 1/8"                  | single | Drilled Holes      | -                         | 123.00
rigid  | 2   | 36x24   | PVC 1/8"                  | double | Drilled Holes      | -                         | 219.00
rigid  | 2   | 96x48   | PVC 1/8"                  | single | Drilled Holes      | -                         | 591.00
rigid  | 2   | 96x48   | PVC 1/8"                  | double | Drilled Holes      | -                         | 1103.00
`;

type Row = {
  method: "yard" | "banner" | "poster" | "rigid";
  quantity: number;
  widthInches: number;
  heightInches: number;
  material: string;
  doubleSided: boolean;
  finishing: string;
  addOns: string[];
  total: number;
};

function parseSheet(sheet: string): Row[] {
  return sheet
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());

      assert.equal(cells.length, 8, `unreadable price sheet row: ${line}`);

      const [method, quantity, size, material, sides, finishing, addOns, total] =
        cells;
      const [widthInches, heightInches] = size.split("x").map(Number);

      assert.match(method, /^(yard|banner|poster|rigid)$/);
      assert.match(sides, /^(single|double)$/);
      assert.ok(widthInches > 0 && heightInches > 0, `bad size: ${size}`);

      return {
        method: method as Row["method"],
        quantity: Number(quantity),
        widthInches,
        heightInches,
        material,
        doubleSided: sides === "double",
        finishing,
        addOns: addOns === "-" ? [] : addOns.split("+"),
        total: Number(total),
      };
    });
}

const ROWS = parseSheet(PRICE_SHEET);

/** Driven exactly the way app/page.tsx drives it. */
function priceOf(row: Row) {
  return calculateSignsPricing({
    method: row.method,
    quantity: row.quantity,
    // getYardSignSizeKey builds this from the real dimensions, so the sheet
    // does too rather than hardcoding a table key.
    sizeKey: `${row.widthInches}" x ${row.heightInches}"`,
    widthInches: row.widthInches,
    heightInches: row.heightInches,
    material: row.material,
    doubleSided: row.doubleSided,
    stepStakes: row.finishing === "With Step Stakes",
    finishing: row.finishing,
    bannerAddOns: row.addOns,
  });
}

describe("the signs price sheet has not moved", () => {
  test("the sheet parsed, and covers the grid it claims to", () => {
    // A parser that silently matched nothing would make every test below pass
    // by iterating an empty list.
    assert.equal(ROWS.length, 120);

    assert.deepEqual(
      [...new Set(ROWS.map((r) => r.method))].sort(),
      ["banner", "poster", "rigid", "yard"]
    );

    // Every material the catalog offers on a priced product is on the sheet.
    for (const material of Object.keys(
      signsPricingConfig.rigid.perSqftByMaterial
    )) {
      assert.ok(
        ROWS.some((r) => r.method === "rigid" && r.material === material),
        `no rigid row for ${material}`
      );
    }

    for (const material of Object.keys(
      signsPricingConfig.banner.perSqftByMaterial
    )) {
      assert.ok(
        ROWS.some((r) => r.method === "banner" && r.material === material),
        `no banner row for ${material}`
      );
    }

    assert.ok(ROWS.some((r) => r.doubleSided));
    assert.ok(ROWS.some((r) => r.addOns.length > 0));
    assert.ok(ROWS.some((r) => r.finishing === "With Step Stakes"));
    assert.ok(ROWS.some((r) => r.finishing === "No Hem or Grommets"));
  });

  for (const row of ROWS) {
    const label =
      `${row.method} ${row.quantity} x ${row.widthInches}"x${row.heightInches}" ` +
      `${row.material}, ${row.doubleSided ? "double" : "single"}, ${row.finishing}` +
      (row.addOns.length ? `, ${row.addOns.join("+")}` : "");

    test(`${label} = $${row.total.toFixed(2)}`, () => {
      const priced = priceOf(row);

      // Every row on this sheet is a configuration the builder can reach, so
      // every one of them must still price. A guard that started over-firing
      // would drop live products into "quoted by hand" silently.
      assert.equal(priced.priceable, true, priced.reason);
      assert.equal(priced.total, row.total);
    });
  }
});

describe("the rules the sheet exists to hold still", () => {
  const find = (match: Partial<Row>) =>
    ROWS.find((row) =>
      Object.entries(match).every(([key, value]) =>
        key === "addOns"
          ? row.addOns.join("+") === (value as string[]).join("+")
          : row[key as keyof Row] === value
      )
    );

  test("every total carries the setup fee, once", () => {
    // The fee is per ORDER, not per sign. A refactor that moved it inside the
    // per-unit loop would multiply it by the quantity and nothing else here
    // would notice.
    for (const row of ROWS) {
      const priced = priceOf(row);
      const setup = priced.lines.filter((line) =>
        line.label.startsWith("Setup fee")
      );

      assert.equal(setup.length, 1, `${row.method} ${row.quantity}`);
      assert.equal(setup[0].amount, signsPricingConfig.setupFee);
    }
  });

  test("a single double-sided yard sign falls back to the 2-5 rate", () => {
    // The boards only print a single-sided "each" price for one sign, so
    // getYardSignUnitPrice deliberately borrows the smallest double tier
    // rather than inventing a number. $44 + $16.50 setup.
    assert.equal(find({ method: "yard", quantity: 1, doubleSided: true })?.total, 59);
  });

  test("13 oz double-sided costs materially more than 18 oz double-sided", () => {
    // 13 oz shows through, so it is two banners sewn back to back: double the
    // material plus $11 per linear foot of sewn edge. 18 oz is one panel with
    // a per-sqft surcharge. If those two ever converge, one of the two
    // constructions has stopped being applied.
    const sewn = find({
      method: "banner",
      quantity: 1,
      widthInches: 96,
      heightInches: 48,
      material: "13 oz Scrim Vinyl",
      doubleSided: true,
      addOns: [],
    });
    const surcharge = find({
      method: "banner",
      quantity: 1,
      widthInches: 96,
      heightInches: 48,
      material: "18 oz Heavy Duty Vinyl",
      doubleSided: true,
      addOns: [],
    });

    assert.equal(sewn?.total, 855);
    assert.equal(surcharge?.total, 671);
  });

  test("the no-hem credit is real money, and only on 18 oz", () => {
    // A 3' x 6' banner has an 18 ft perimeter, so at $2.50/ft the credit is
    // $45 — the figure written into signs-pricing-config.ts.
    const hemmed = find({
      method: "banner",
      quantity: 1,
      widthInches: 72,
      heightInches: 36,
      material: "18 oz Heavy Duty Vinyl",
      finishing: "Hemmed + Grommets",
      doubleSided: false,
    });
    const bare = find({
      method: "banner",
      quantity: 1,
      widthInches: 72,
      heightInches: 36,
      material: "18 oz Heavy Duty Vinyl",
      finishing: "No Hem or Grommets",
    });

    assert.equal(hemmed?.total, 240);
    assert.equal(bare?.total, 195);
    assert.equal((hemmed as Row).total - (bare as Row).total, 45);

    // 13 oz never earns it, even if a stale finishing value reaches the
    // engine — the option is not offered for that material.
    const scrimNoHem = priceOf({
      ...(hemmed as Row),
      material: "13 oz Scrim Vinyl",
      finishing: "No Hem or Grommets",
    });

    assert.equal(scrimNoHem.total, 177);
    assert.ok(
      !scrimNoHem.lines.some((line) => line.label.startsWith("No hem credit"))
    );
  });

  test("webbing is charged on 13 oz double-sided and refused everywhere else", () => {
    // The rule lives in allowsReinforcement() and is checked in the engine as
    // well as the UI, so a stale key in the payload cannot bill for work that
    // was never offered. A 4' x 8' banner is 24 linear ft, so $144 at $6/ft.
    const withWebbing = find({
      method: "banner",
      quantity: 1,
      material: "13 oz Scrim Vinyl",
      doubleSided: true,
      addOns: ["reinforcedWebbing"],
    });
    const refused = find({
      method: "banner",
      quantity: 1,
      material: "18 oz Heavy Duty Vinyl",
      doubleSided: true,
      addOns: ["reinforcedWebbing"],
    });
    const plain18 = find({
      method: "banner",
      quantity: 1,
      widthInches: 96,
      heightInches: 48,
      material: "18 oz Heavy Duty Vinyl",
      doubleSided: true,
      addOns: [],
    });

    assert.equal(withWebbing?.total, 999);
    assert.equal((withWebbing as Row).total - 855, 144);

    // The 18 oz row costs exactly what it costs without the add-on: the key
    // was carried and ignored.
    assert.equal(refused?.total, plain18?.total);
  });

  test("the total never goes backwards as quantity rises", () => {
    /**
     * It used to. The board is a per-unit tier table, so at every boundary the
     * total fell as the order grew:
     *
     *   5 signs  $144.00   ->  6 signs  $109.50
     *   9 signs  $156.00   -> 10 signs  $151.50
     *   19 signs $273.00   -> 20 signs  $266.50
     *   29 signs $379.00   -> 30 signs  $346.50
     *
     * Someone ordering 29 signs paid $32.50 more than someone ordering 30.
     * getYardSignPrice now charges the better of the two, so the curve is
     * non-decreasing. Driven against the ENGINE across a full range rather
     * than read off the sheet above — the sheet samples quantities, and an
     * inversion can hide between two samples.
     */
    for (const sizeKey of Object.keys(signsPricingConfig.yardSigns.sizes)) {
      for (const doubleSided of [false, true]) {
        for (const stepStakes of [false, true]) {
          let previous = 0;

          for (let quantity = 1; quantity <= 60; quantity += 1) {
            const total = calculateSignsPricing({
              method: "yard",
              quantity,
              sizeKey,
              widthInches: 18,
              heightInches: 24,
              material: "Coroplast",
              doubleSided,
              stepStakes,
              finishing: stepStakes ? "With Step Stakes" : "Signs Only",
              bannerAddOns: [],
            }).total;

            assert.ok(
              total >= previous,
              `${sizeKey} ${doubleSided ? "double" : "single"}${
                stepStakes ? " + stakes" : ""
              }: ${quantity} signs cost $${total.toFixed(2)}, less than ${
                quantity - 1
              } at $${previous.toFixed(2)}`
            );

            previous = total;
          }
        }
      }
    }
  });

  test("and no quantity pays more than the board's own rate", () => {
    /**
     * The other half of the guarantee, and the one that matters to the shop:
     * fixing the inversions must not have raised anybody's price. Checked
     * against getYardSignUnitPrice — the untouched board lookup — so this is
     * the rate card talking, not the new code agreeing with itself.
     */
    const { setupFee, yardSigns } = signsPricingConfig;

    for (const sizeKey of Object.keys(yardSigns.sizes)) {
      for (const doubleSided of [false, true]) {
        for (let quantity = 1; quantity <= 60; quantity += 1) {
          const boardRate = getYardSignUnitPrice(sizeKey, quantity, doubleSided);
          assert.ok(boardRate !== null);

          const board = (boardRate as number) * quantity + setupFee;
          const charged = calculateSignsPricing({
            method: "yard",
            quantity,
            sizeKey,
            widthInches: 18,
            heightInches: 24,
            material: "Coroplast",
            doubleSided,
            stepStakes: false,
            finishing: "Signs Only",
            bannerAddOns: [],
          }).total;

          assert.ok(
            charged <= board + 1e-9,
            `${sizeKey} ${quantity} ${
              doubleSided ? "double" : "single"
            }: charged $${charged.toFixed(2)}, board says $${board.toFixed(2)}`
          );
        }
      }
    }
  });

  test("the six figures that moved, and only those six", () => {
    /**
     * The price cut itself, as literals. Every other row on the sheet above is
     * byte-identical to what it was before the rule existed, which is how a
     * repricing this narrow is supposed to look.
     */
    // The "after" column carries TWO changes, not one: the tier bump, and the
    // $1.50 the setup fee dropped later the same day when it went from $16.50
    // per order to $15 per design. Every other row on the sheet fell by that
    // $1.50 and by nothing else.
    const WAS: Array<[number, boolean, number, number]> = [
      // quantity, doubleSided, before, after
      [5, false, 144, 108],
      [5, true, 236.5, 147],
      [9, false, 156, 150],
      [19, false, 273, 265],
      [29, false, 379, 345],
      [29, true, 567.5, 555],
    ];

    for (const [quantity, doubleSided, before, after] of WAS) {
      const row = find({
        method: "yard",
        quantity,
        doubleSided,
        finishing: "Signs Only",
      });

      assert.equal(row?.total, after, `${quantity} ${doubleSided ? "double" : "single"}`);
      assert.ok(after < before, "every one of these was a cut, never a rise");
    }
  });

  test("a bumped order says so, in a label short enough to render", () => {
    /**
     * The line item has to explain a total that does not divide by the board
     * rate, and it has to do it in a label that lib/email.ts renders inside a
     * `white-space: nowrap` cell. A long one squeezes the value column until
     * dollar amounts break mid-number — "$122.00" over three lines — for every
     * row in the table, not just this one. That defect has shipped here once
     * already, so the length is asserted rather than eyeballed.
     */
    const bumped = calculateSignsPricing({
      method: "yard",
      quantity: 5,
      sizeKey: '18" x 24"',
      widthInches: 18,
      heightInches: 24,
      material: "Coroplast",
      doubleSided: false,
      stepStakes: false,
      finishing: "Signs Only",
      bannerAddOns: [],
    });

    assert.equal(bumped.pricedAtQuantity, 6);
    assert.equal(bumped.lines[0].label, '5 × 18" x 24", 6-sign price');
    assert.ok(bumped.lines[0].label.length <= 35);

    // An ordinary order carries no flag, so the summary card stays quiet.
    const plain = calculateSignsPricing({
      method: "yard",
      quantity: 6,
      sizeKey: '18" x 24"',
      widthInches: 18,
      heightInches: 24,
      material: "Coroplast",
      doubleSided: false,
      stepStakes: false,
      finishing: "Signs Only",
      bannerAddOns: [],
    });

    assert.equal(plain.pricedAtQuantity, undefined);
    assert.equal(plain.lines[0].label, '6 × 18" x 24" single-sided @ $15.50');
  });
});

describe("one setup fee, per design, and nothing else", () => {
  /**
   * ── WHAT CHANGED, 2026-08-22 ──────────────────────────────────────────────
   * Gabe replaced a $16.50 order-level setup fee plus a $22 custom size fee
   * with a single $15 setup fee per design, on every sign and banner order.
   *
   * The custom size fee could never be charged anyway — `isCustomSize` was set
   * from a size SELECTOR that no longer exists, so the only product that ever
   * set it was window graphics, which is hand-quoted and never reaches this
   * engine. Meanwhile the builder was telling rigid-sign customers that hard
   * stock adds $22. Removing it settles that disagreement in the direction
   * the customer was already being charged.
   *
   * "Per design" and "per order" are the same figure today: the signs builder
   * takes one artwork or one template per quote. Stickers are the flow with
   * several designs, and they have their own fee in lib/pricing.ts.
   */
  test("every sign type charges $15, once, whatever the size", () => {
    const SIZES: Array<[number, number]> = [
      [24, 18], // a standard size
      [25, 37], // an odd one that leaves drop from a 48" x 96" sheet
    ];

    const CONFIGS: Array<{ method: "yard" | "banner" | "poster" | "rigid"; material: string; finishing: string }> = [
      { method: "yard", material: "Coroplast", finishing: "Signs Only" },
      { method: "banner", material: "13 oz Scrim Vinyl", finishing: "Hemmed + Grommets" },
      { method: "poster", material: "Indoor Poster Paper", finishing: "Standard" },
      { method: "rigid", material: 'PVC 1/8"', finishing: "Drilled Holes" },
    ];

    for (const config of CONFIGS) {
      for (const [widthInches, heightInches] of SIZES) {
        const priced = calculateSignsPricing({
          ...config,
          quantity: 3,
          sizeKey: '18" x 24"',
          widthInches,
          heightInches,
          doubleSided: false,
          stepStakes: false,
          bannerAddOns: [],
        });

        const setup = priced.lines.filter((line) =>
          line.label.startsWith("Setup fee")
        );

        assert.equal(setup.length, 1, `${config.method} ${widthInches}x${heightInches}`);
        assert.equal(setup[0].amount, 15);
      }
    }
  });

  test("the size-dependent fee is gone from every row on the sheet", () => {
    // Named explicitly rather than checked by absence of a number: a fee that
    // came back under a different label would be a price rise nobody asked
    // for, and this is the file that is supposed to notice.
    for (const row of ROWS) {
      const labels = priceOf(row).lines.map((line) => line.label);

      assert.ok(
        !labels.some((label) => /custom size/i.test(label)),
        `${row.method} ${row.widthInches}x${row.heightInches} charged a size fee`
      );
      assert.equal(
        labels.filter((label) => /setup/i.test(label)).length,
        1,
        `${row.method} has ${labels.filter((l) => /setup/i.test(l)).length} setup lines`
      );
    }
  });

  test("the fee is the config's, not a number typed in here twice", () => {
    assert.equal(signsPricingConfig.setupFee, 15);
    assert.ok(
      !("customSizeFee" in signsPricingConfig),
      "customSizeFee is still in the config"
    );
  });
});
