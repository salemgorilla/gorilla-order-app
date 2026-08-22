import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { calculateSignsPricing } from "../lib/signs-pricing";
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
yard   | 1   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 47.50
yard   | 1   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 60.50
yard   | 2   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 67.50
yard   | 2   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 104.50
yard   | 5   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 144.00
yard   | 5   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 236.50
yard   | 6   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 109.50
yard   | 6   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 148.50
yard   | 9   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 156.00
yard   | 9   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 214.50
yard   | 10  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 151.50
yard   | 10  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 216.50
yard   | 19  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 273.00
yard   | 19  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 396.50
yard   | 20  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 266.50
yard   | 20  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 396.50
yard   | 29  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 379.00
yard   | 29  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 567.50
yard   | 30  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 346.50
yard   | 30  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 556.50
yard   | 50  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 566.50
yard   | 50  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 916.50
yard   | 1   | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 50.00
yard   | 1   | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 63.00
yard   | 10  | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 176.50
yard   | 10  | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 241.50
yard   | 30  | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 421.50
yard   | 30  | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 631.50
banner | 1   | 48x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 88.50
banner | 5   | 48x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 376.50
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 178.50
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 826.50
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 304.50
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 1456.50
banner | 1   | 96x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 160.50
banner | 5   | 96x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 736.50
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 116.50
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 516.50
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 241.50
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 1141.50
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 416.50
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 2016.50
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 216.50
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 1016.50
banner | 1   | 48x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 88.50
banner | 5   | 48x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 376.50
banner | 1   | 72x36   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 178.50
banner | 5   | 72x36   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 826.50
banner | 1   | 96x48   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 304.50
banner | 5   | 96x48   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 1456.50
banner | 1   | 96x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 160.50
banner | 5   | 96x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 736.50
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 180.50
banner | 1   | 48x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 292.50
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 836.50
banner | 5   | 48x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 1396.50
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 385.50
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 538.50
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 1861.50
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 2626.50
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 672.50
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 856.50
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 3296.50
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 4216.50
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 344.50
banner | 1   | 96x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 524.50
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 1656.50
banner | 5   | 96x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 2556.50
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 86.50
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 366.50
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 196.50
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 916.50
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 356.50
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 1716.50
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 166.50
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 766.50
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets               | 193.50
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | windSlits                 | 184.50
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets+windSlits     | 199.50
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | reinforcedWebbing         | 1000.50
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | reinforcedWebbing         | 672.50
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets               | 901.50
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | windSlits                 | 856.50
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets+windSlits     | 931.50
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | reinforcedWebbing         | 4936.50
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | reinforcedWebbing         | 3296.50
poster | 1   | 24x18   | Indoor Poster Paper       | single | Standard           | -                         | 33.00
poster | 5   | 24x18   | Indoor Poster Paper       | single | Standard           | -                         | 99.00
poster | 1   | 36x24   | Indoor Poster Paper       | single | Standard           | -                         | 49.50
poster | 5   | 36x24   | Indoor Poster Paper       | single | Standard           | -                         | 181.50
poster | 1   | 48x36   | Indoor Poster Paper       | single | Standard           | -                         | 82.50
poster | 5   | 48x36   | Indoor Poster Paper       | single | Standard           | -                         | 346.50
rigid  | 1   | 24x18   | PVC 1/8"                  | single | Drilled Holes      | -                         | 43.50
rigid  | 5   | 24x18   | PVC 1/8"                  | single | Drilled Holes      | -                         | 151.50
rigid  | 1   | 24x18   | PVC 1/4"                  | single | Drilled Holes      | -                         | 49.50
rigid  | 5   | 24x18   | PVC 1/4"                  | single | Drilled Holes      | -                         | 181.50
rigid  | 1   | 24x18   | PVC 1/2"                  | single | Drilled Holes      | -                         | 57.00
rigid  | 5   | 24x18   | PVC 1/2"                  | single | Drilled Holes      | -                         | 219.00
rigid  | 1   | 24x18   | Dibond 1/8"               | single | Drilled Holes      | -                         | 49.50
rigid  | 5   | 24x18   | Dibond 1/8"               | single | Drilled Holes      | -                         | 181.50
rigid  | 1   | 24x18   | Dibond 1/4"               | single | Drilled Holes      | -                         | 57.00
rigid  | 5   | 24x18   | Dibond 1/4"               | single | Drilled Holes      | -                         | 219.00
rigid  | 1   | 24x18   | AlumaCorr 0.2"            | single | Drilled Holes      | -                         | 49.50
rigid  | 5   | 24x18   | AlumaCorr 0.2"            | single | Drilled Holes      | -                         | 181.50
rigid  | 1   | 24x18   | AlumaCorr 0.4"            | single | Drilled Holes      | -                         | 57.00
rigid  | 5   | 24x18   | AlumaCorr 0.4"            | single | Drilled Holes      | -                         | 219.00
rigid  | 1   | 24x18   | Aluminum 040              | single | Drilled Holes      | -                         | 49.50
rigid  | 5   | 24x18   | Aluminum 040              | single | Drilled Holes      | -                         | 181.50
rigid  | 1   | 24x18   | Aluminum 080              | single | Drilled Holes      | -                         | 57.00
rigid  | 5   | 24x18   | Aluminum 080              | single | Drilled Holes      | -                         | 219.00
rigid  | 1   | 24x18   | Corrugated 1/4"           | single | Drilled Holes      | -                         | 43.50
rigid  | 5   | 24x18   | Corrugated 1/4"           | single | Drilled Holes      | -                         | 151.50
rigid  | 1   | 24x18   | Corrugated 1/2"           | single | Drilled Holes      | -                         | 49.50
rigid  | 5   | 24x18   | Corrugated 1/2"           | single | Drilled Holes      | -                         | 181.50
rigid  | 2   | 18x12   | PVC 1/8"                  | single | Drilled Holes      | -                         | 43.50
rigid  | 2   | 18x12   | PVC 1/8"                  | double | Drilled Holes      | -                         | 67.50
rigid  | 2   | 36x24   | PVC 1/8"                  | single | Drilled Holes      | -                         | 124.50
rigid  | 2   | 36x24   | PVC 1/8"                  | double | Drilled Holes      | -                         | 220.50
rigid  | 2   | 96x48   | PVC 1/8"                  | single | Drilled Holes      | -                         | 592.50
rigid  | 2   | 96x48   | PVC 1/8"                  | double | Drilled Holes      | -                         | 1104.50
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
    isCustomSize: false,
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
      const setup = priced.lines.filter((line) => line.label === "Setup fee");

      assert.equal(setup.length, 1, `${row.method} ${row.quantity}`);
      assert.equal(setup[0].amount, signsPricingConfig.setupFee);
    }
  });

  test("a single double-sided yard sign falls back to the 2-5 rate", () => {
    // The boards only print a single-sided "each" price for one sign, so
    // getYardSignUnitPrice deliberately borrows the smallest double tier
    // rather than inventing a number. $44 + $16.50 setup.
    assert.equal(find({ method: "yard", quantity: 1, doubleSided: true })?.total, 60.5);
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

    assert.equal(sewn?.total, 856.5);
    assert.equal(surcharge?.total, 672.5);
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

    assert.equal(hemmed?.total, 241.5);
    assert.equal(bare?.total, 196.5);
    assert.equal((hemmed as Row).total - (bare as Row).total, 45);

    // 13 oz never earns it, even if a stale finishing value reaches the
    // engine — the option is not offered for that material.
    const scrimNoHem = priceOf({
      ...(hemmed as Row),
      material: "13 oz Scrim Vinyl",
      finishing: "No Hem or Grommets",
    });

    assert.equal(scrimNoHem.total, 178.5);
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

    assert.equal(withWebbing?.total, 1000.5);
    assert.equal((withWebbing as Row).total - 856.5, 144);

    // The 18 oz row costs exactly what it costs without the add-on: the key
    // was carried and ignored.
    assert.equal(refused?.total, plain18?.total);
  });

  test("ordering ONE MORE sign can cost less, at four quantities", () => {
    /**
     * Not a defect — it is what a per-unit tier table does at a boundary, and
     * these are the shop's own board rates. Written down because it is the
     * kind of thing that reads as a bug when a customer finds it:
     *
     *   5 signs  $144.00   ->  6 signs  $109.50
     *   9 signs  $156.00   -> 10 signs  $151.50
     *   19 signs $273.00   -> 20 signs  $266.50
     *   29 signs $379.00   -> 30 signs  $346.50
     *
     * If the shop ever wants the total to be monotonic, this test is the
     * inventory of where it is not.
     */
    const single = (quantity: number) =>
      find({
        method: "yard",
        quantity,
        doubleSided: false,
        finishing: "Signs Only",
      })?.total;

    for (const [fewer, more] of [
      [5, 6],
      [9, 10],
      [19, 20],
      [29, 30],
    ]) {
      assert.ok(
        (single(fewer) as number) > (single(more) as number),
        `${fewer} signs no longer costs more than ${more}`
      );
    }
  });
});

describe("the fee that no quote can reach", () => {
  test("the custom size fee is charged when asked for", () => {
    // The engine is correct: hard stock at a custom size takes the fee, roll
    // material does not.
    const base = {
      quantity: 1,
      widthInches: 25,
      heightInches: 37,
      material: 'PVC 1/8"',
      doubleSided: false,
      finishing: "Drilled Holes",
      isCustomSize: true,
      bannerAddOns: [] as string[],
    };

    const rigid = calculateSignsPricing({ ...base, method: "rigid" });
    const banner = calculateSignsPricing({
      ...base,
      method: "banner",
      material: "13 oz Scrim Vinyl",
      finishing: "Hemmed + Grommets",
    });

    assert.ok(rigid.lines.some((line) => line.label === "Custom size fee"));
    assert.ok(!banner.lines.some((line) => line.label === "Custom size fee"));
  });

  test("but nothing the builder produces sets isCustomSize on a priced sign", () => {
    /**
     * app/page.tsx passes `isCustomSize: signsQuote.size === CUSTOM_SIZE`, and
     * `size` is set from getSizeOptions(product)[0] — the first real label.
     * The size SELECTOR is gone; dimensions are typed. So the only product
     * that ever sets CUSTOM_SIZE is the one with no sizes at all, window
     * graphics, and that one is quoted by hand and never reaches this engine.
     *
     * The consequence is a copy/price disagreement, not a lost fee at random:
     * SignsBuilder tells a rigid-sign customer that hard stock adds a
     * ${customSizeFee} fee for odd sizes, and the estimate beside it never
     * includes one. Left as an assertion rather than "fixed" in either
     * direction, because which way it should go — charge the fee on any
     * non-nesting size, or drop the promise — is the shop's call and it moves
     * money.
     */
    assert.equal(signsPricingConfig.customSizeFee, 22);

    for (const row of ROWS) {
      assert.ok(
        !priceOf(row).lines.some((line) => line.label === "Custom size fee"),
        `${row.method} ${row.widthInches}x${row.heightInches} charged it`
      );
    }
  });
});
