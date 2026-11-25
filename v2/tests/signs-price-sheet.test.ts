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
 *   services  rounded corners and holes per sign (yard, rigid), velcro by
 *           placement (banner) — Gabe's 5 Sep ruling on the website's adders.
 *
 * ── REGENERATED 2026-11-11 FOR THE 3% RETAIL UPLIFT ───────────────────────
 * Gabe: "we will increase our retail price by 3% and discount those who pay
 * via ACH." Every rate, fee and add-on in lib/signs-pricing-config.ts is now
 * its old figure plus 3%, rounded to the cent (the rates are rounded BEFORE
 * they are multiplied by area, so a big banner can sit a few cents off
 * old x 1.03). The regeneration refused any row further off than that
 * rounding allows — one row, banner 5 x 72x36 with velcro on all edges, sat
 * 60c off on a $1,000 job, which is the $1.50/ft velcro rate rounding up to
 * $1.55 over 75 ft of edge. Everything else was within a few cents.
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
yard   | 1   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 47.38
yard   | 1   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 60.77
yard   | 2   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 67.99
yard   | 2   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 106.09
yard   | 5   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 111.27
yard   | 5   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 151.41
yard   | 6   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 111.27
yard   | 6   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 151.41
yard   | 9   | 18x24   | Coroplast                 | single | Signs Only         | -                         | 154.55
yard   | 9   | 18x24   | Coroplast                 | double | Signs Only         | -                         | 219.39
yard   | 10  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 154.55
yard   | 10  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 221.45
yard   | 19  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 273.05
yard   | 19  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 406.85
yard   | 20  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 273.05
yard   | 20  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 406.85
yard   | 29  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 355.35
yard   | 29  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 571.65
yard   | 30  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 355.35
yard   | 30  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 571.65
yard   | 50  | 18x24   | Coroplast                 | single | Signs Only         | -                         | 581.95
yard   | 50  | 18x24   | Coroplast                 | double | Signs Only         | -                         | 942.45
yard   | 1   | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 49.96
yard   | 1   | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 63.35
yard   | 10  | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 180.35
yard   | 10  | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 247.25
yard   | 30  | 18x24   | Coroplast                 | single | With Step Stakes   | -                         | 432.75
yard   | 30  | 18x24   | Coroplast                 | double | With Step Stakes   | -                         | 649.05
banner | 1   | 48x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 89.61
banner | 5   | 48x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 386.25
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 182.31
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 849.75
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 312.09
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 1498.65
banner | 1   | 96x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 163.77
banner | 5   | 96x24   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | -                         | 757.05
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 118.49
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 530.65
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 247.29
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 1174.65
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 427.61
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 2076.25
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 221.53
yard   | 10  | 18x24   | Coroplast                 | single | Signs Only         | roundedCorners            | 206.05
yard   | 10  | 18x24   | Coroplast                 | single | Signs Only         | roundedCorners+holes      | 257.55
yard   | 1   | 18x24   | Coroplast                 | single | With Step Stakes   | holes                     | 55.11
rigid  | 4   | 24x18   | PVC 1/8"                  | single | Standard           | holes                     | 196.73
rigid  | 4   | 24x18   | PVC 1/8"                  | double | Standard           | roundedCorners+holes      | 324.49
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | velcro:top                | 191.61
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | velcro:sides              | 191.61
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | velcro:all                | 219.51
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | velcro:all                | 1035.75
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | polePockets+velcro:bottom | 455.46
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | single | Hemmed + Grommets  | -                         | 1045.85
banner | 1   | 48x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 89.61
banner | 5   | 48x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 386.25
banner | 1   | 72x36   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 182.31
banner | 5   | 72x36   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 849.75
banner | 1   | 96x48   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 312.09
banner | 5   | 96x48   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 1498.65
banner | 1   | 96x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 163.77
banner | 5   | 96x24   | Mesh Vinyl (windy areas)  | single | Hemmed + Grommets  | -                         | 757.05
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 184.41
banner | 1   | 48x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 299.73
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 860.25
banner | 5   | 48x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 1436.85
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 395.61
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 553.11
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 1916.25
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 2703.75
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 691.29
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 880.65
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 3394.65
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 4341.45
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 353.37
banner | 1   | 96x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 538.69
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | -                         | 1705.05
banner | 5   | 96x24   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | -                         | 2631.65
banner | 1   | 48x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 87.53
banner | 5   | 48x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 375.85
banner | 1   | 72x36   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 200.85
banner | 5   | 72x36   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 942.45
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 365.69
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 1766.65
banner | 1   | 96x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 169.93
banner | 5   | 96x24   | 18 oz Heavy Duty Vinyl    | single | No Hem or Grommets | -                         | 787.85
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets               | 197.76
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | windSlits                 | 188.49
banner | 1   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets+windSlits     | 203.94
banner | 1   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | reinforcedWebbing         | 1028.97
banner | 1   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | reinforcedWebbing         | 691.29
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets               | 927.00
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Hemmed + Grommets  | windSlits                 | 880.65
banner | 5   | 72x36   | 13 oz Scrim Vinyl         | single | Pole Pockets       | polePockets+windSlits     | 957.90
banner | 5   | 96x48   | 13 oz Scrim Vinyl         | double | Hemmed + Grommets  | reinforcedWebbing         | 5083.05
banner | 5   | 96x48   | 18 oz Heavy Duty Vinyl    | double | Hemmed + Grommets  | reinforcedWebbing         | 3394.65
poster | 1   | 24x18   | Indoor Poster Paper       | single | Standard           | -                         | 32.46
poster | 5   | 24x18   | Indoor Poster Paper       | single | Standard           | -                         | 100.50
poster | 1   | 36x24   | Indoor Poster Paper       | single | Standard           | -                         | 49.47
poster | 5   | 36x24   | Indoor Poster Paper       | single | Standard           | -                         | 185.55
poster | 1   | 48x36   | Indoor Poster Paper       | single | Standard           | -                         | 83.49
poster | 5   | 48x36   | Indoor Poster Paper       | single | Standard           | -                         | 355.65
rigid  | 1   | 24x18   | PVC 1/8"                  | single | Drilled Holes      | -                         | 55.62
rigid  | 5   | 24x18   | PVC 1/8"                  | single | Drilled Holes      | -                         | 216.30
rigid  | 1   | 24x18   | PVC 1/4"                  | single | Drilled Holes      | -                         | 61.80
rigid  | 5   | 24x18   | PVC 1/4"                  | single | Drilled Holes      | -                         | 247.20
rigid  | 1   | 24x18   | PVC 1/2"                  | single | Drilled Holes      | -                         | 69.54
rigid  | 5   | 24x18   | PVC 1/2"                  | single | Drilled Holes      | -                         | 285.90
rigid  | 1   | 24x18   | Dibond 1/8"               | single | Drilled Holes      | -                         | 61.80
rigid  | 5   | 24x18   | Dibond 1/8"               | single | Drilled Holes      | -                         | 247.20
rigid  | 1   | 24x18   | Dibond 1/4"               | single | Drilled Holes      | -                         | 69.54
rigid  | 5   | 24x18   | Dibond 1/4"               | single | Drilled Holes      | -                         | 285.90
rigid  | 1   | 24x18   | AlumaCorr 0.2"            | single | Drilled Holes      | -                         | 61.80
rigid  | 5   | 24x18   | AlumaCorr 0.2"            | single | Drilled Holes      | -                         | 247.20
rigid  | 1   | 24x18   | AlumaCorr 0.4"            | single | Drilled Holes      | -                         | 69.54
rigid  | 5   | 24x18   | AlumaCorr 0.4"            | single | Drilled Holes      | -                         | 285.90
rigid  | 1   | 24x18   | Aluminum 040              | single | Drilled Holes      | -                         | 61.80
rigid  | 5   | 24x18   | Aluminum 040              | single | Drilled Holes      | -                         | 247.20
rigid  | 1   | 24x18   | Aluminum 080              | single | Drilled Holes      | -                         | 69.54
rigid  | 5   | 24x18   | Aluminum 080              | single | Drilled Holes      | -                         | 285.90
rigid  | 1   | 24x18   | Corrugated 1/4"           | single | Drilled Holes      | -                         | 55.62
rigid  | 5   | 24x18   | Corrugated 1/4"           | single | Drilled Holes      | -                         | 216.30
rigid  | 1   | 24x18   | Corrugated 1/2"           | single | Drilled Holes      | -                         | 61.80
rigid  | 5   | 24x18   | Corrugated 1/2"           | single | Drilled Holes      | -                         | 247.20
rigid  | 2   | 18x12   | PVC 1/8"                  | single | Drilled Holes      | -                         | 55.62
rigid  | 2   | 18x12   | PVC 1/8"                  | double | Drilled Holes      | -                         | 82.41
rigid  | 2   | 36x24   | PVC 1/8"                  | single | Drilled Holes      | -                         | 176.13
rigid  | 2   | 36x24   | PVC 1/8"                  | double | Drilled Holes      | -                         | 283.29
rigid  | 2   | 96x48   | PVC 1/8"                  | single | Drilled Holes      | -                         | 872.41
rigid  | 2   | 96x48   | PVC 1/8"                  | double | Drilled Holes      | -                         | 1443.93
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
    // The add-ons column carries three kinds of token since 5 Sep: banner
    // finishing keys (polePockets…), per-sign services on yard and rigid
    // (roundedCorners, holes) and a velcro placement (velcro:top).
    bannerAddOns: row.addOns.filter(
      (key) => !key.startsWith("velcro:") && !SIGN_SERVICE_KEYS.includes(key)
    ),
    signAddOns: row.addOns.filter((key) => SIGN_SERVICE_KEYS.includes(key)),
    velcro: row.addOns.find((key) => key.startsWith("velcro:"))?.slice("velcro:".length) ?? "",
  });
}

const SIGN_SERVICE_KEYS = Object.keys(signsPricingConfig.signAddOns);

describe("the signs price sheet has not moved", () => {
  test("the sheet parsed, and covers the grid it claims to", () => {
    // A parser that silently matched nothing would make every test below pass
    // by iterating an empty list.
    // 120 on 2026-08-24, plus ten rows for the selectable services (rounded
    // corners, holes, velcro) Gabe ruled on 2026-09-05.
    assert.equal(ROWS.length, 130);

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
    // The services: every key, and every velcro placement that prices
    // differently (top/middle/bottom are the same footage).
    for (const key of SIGN_SERVICE_KEYS) {
      assert.ok(ROWS.some((r) => r.addOns.includes(key)), `no row for ${key}`);
    }
    for (const placement of ["top", "sides", "all", "bottom"]) {
      assert.ok(ROWS.some((r) => r.addOns.includes(`velcro:${placement}`)), `no velcro:${placement} row`);
    }
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
    assert.equal(find({ method: "yard", quantity: 1, doubleSided: true })?.total, 60.77);
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

    assert.equal(sewn?.total, 880.65);
    assert.equal(surcharge?.total, 691.29);
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

    assert.equal(hemmed?.total, 247.29);
    assert.equal(bare?.total, 200.85);
    assert.equal((hemmed as Row).total - (bare as Row).total, 46.44);

    // 13 oz never earns it, even if a stale finishing value reaches the
    // engine — the option is not offered for that material.
    const scrimNoHem = priceOf({
      ...(hemmed as Row),
      material: "13 oz Scrim Vinyl",
      finishing: "No Hem or Grommets",
    });

    assert.equal(scrimNoHem.total, 182.31);
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

    assert.equal(withWebbing?.total, 1028.97);
    assert.equal(Math.round(((withWebbing as Row).total - 880.65) * 100) / 100, 148.32);

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
      [5, false, 144, 111.27],
      [5, true, 236.5, 151.41],
      [9, false, 156, 154.55],
      [19, false, 273, 273.05],
      [29, false, 379, 355.35],
      [29, true, 567.5, 571.65],
    ];

    for (const [quantity, doubleSided, before, after] of WAS) {
      const row = find({
        method: "yard",
        quantity,
        doubleSided,
        finishing: "Signs Only",
      });

      assert.equal(row?.total, after, `${quantity} ${doubleSided ? "double" : "single"}`);
      // `before` is the pre-cut price in the OLD price book; `after` is retail
      // now (old x 1.03 to within rate rounding), so compare like with like:
      // the cut has to survive the 3%, which is why `before` is scaled up.
      assert.ok(
        after < before * 1.03 + 0.1,
        "every one of these was a cut, never a rise"
      );
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
    assert.equal(plain.lines[0].label, '6 × 18" x 24" single-sided @ $15.97');
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
        assert.equal(setup[0].amount, 15.45);
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
    assert.equal(signsPricingConfig.setupFee, 15.45);
    assert.ok(
      !("customSizeFee" in signsPricingConfig),
      "customSizeFee is still in the config"
    );
  });
});
