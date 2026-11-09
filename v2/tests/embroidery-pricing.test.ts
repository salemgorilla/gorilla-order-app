/**
 * The embroidery matrix, as Gabe sent it, and the rules around it.
 *
 * Gabe, 2026-11-09: `Embroidery-Pricing-Matrix-Export-20261109`. Every cell is
 * pinned below as a literal copied from that export, separately from the
 * config, so a transcription slip in the config is a failing test and not a
 * silent price.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  embroideryPricingConfig,
  type EmbroideryPricingConfig,
} from "../lib/embroidery-pricing-config";
import { embroideryPerPiece, estimateEmbroidery, resolvedRows } from "../lib/embroidery-pricing";

/** Quantity, then the eight stitch columns, then Product Markup %: the export's rows. */
const EXPORT: number[][] = [
  [6, 6.25, 6.9, 7.49, 8.14, 8.76, 8.5, 10.0, 17.5, 150],
  [12, 5.5, 6.05, 6.6, 7.15, 7.7, 8.25, 9.75, 17.25, 150],
  [48, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 8.25, 16.0, 150],
  [144, 4.6, 5.0, 5.4, 5.8, 6.2, 6.6, 7.85, 15.6, 140],
  [432, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2, 7.4, 15.2, 140],
  [731, 3.8, 4.2, 4.6, 5.0, 5.4, 5.8, 7.0, 14.8, 140],
  [1000, 3.5, 3.86, 4.22, 4.58, 4.94, 5.3, 6.5, 14.3, 140],
];

const live: EmbroideryPricingConfig = { ...embroideryPricingConfig, ratesConfirmed: true };

describe("the config is the export, cell for cell", () => {
  test("seven quantity rows, eight stitch columns", () => {
    assert.equal(embroideryPricingConfig.rows.length, EXPORT.length);
    assert.equal(embroideryPricingConfig.columns.length, 8);
  });

  test("every cell, every minimum and every markup", () => {
    embroideryPricingConfig.rows.forEach((row, i) => {
      const expected = EXPORT[i];
      assert.equal(row.minQuantity, expected[0], `row ${i} quantity`);
      assert.deepEqual([...row.perPiece], expected.slice(1, 9), `row ${expected[0]} cells`);
      assert.equal(row.garmentMarkup, expected[9] / 100, `row ${expected[0]} markup`);
    });
  });

  test("the headers are the export's", () => {
    assert.deepEqual(
      embroideryPricingConfig.columns.map((c) => c.header),
      [
        "0 - 5000 Stitches",
        "6001 - 7000 Stitches",
        "7001 - 8000 Stitches",
        "8001 - 9000 Stitches",
        "9001 - 10000 Stitches",
        "10-11K Stitches",
        "12-13K Stitches",
        "20000",
      ]
    );
  });
});

describe("what the export gets wrong, documented", () => {
  test("exactly one backwards cell: quantity 6, 10-11K cheaper than 9001-10000 (D6)", () => {
    const backwards: string[] = [];

    for (const row of embroideryPricingConfig.rows) {
      for (let i = 1; i < row.perPiece.length; i += 1) {
        if (row.perPiece[i] < row.perPiece[i - 1]) {
          backwards.push(`${row.minQuantity}@${embroideryPricingConfig.columns[i].header}`);
        }
      }
    }

    assert.deepEqual(backwards, ["6@10-11K Stitches"]);
  });

  test("resolving it leaves no row where more stitches cost less", () => {
    for (const row of resolvedRows(embroideryPricingConfig)) {
      for (let i = 1; i < row.perPiece.length; i += 1) {
        assert.ok(row.perPiece[i] >= row.perPiece[i - 1], `${row.minQuantity} col ${i}`);
      }
    }

    assert.equal(resolvedRows(embroideryPricingConfig)[0].perPiece[5], 8.76);
  });

  test("a bigger run never costs more per piece, in any column", () => {
    const columns = embroideryPricingConfig.columns.length;

    for (let c = 0; c < columns; c += 1) {
      for (let r = 1; r < embroideryPricingConfig.rows.length; r += 1) {
        assert.ok(
          embroideryPricingConfig.rows[r].perPiece[c] <= embroideryPricingConfig.rows[r - 1].perPiece[c],
          `col ${c} row ${r}`
        );
      }
    }
  });

  test("the last column is recorded and NOT used", () => {
    const last = embroideryPricingConfig.columns[7];
    assert.equal(last.confirmed, false);
    assert.equal(embroideryPricingConfig.columns.slice(0, 7).every((c) => c.confirmed), true);
  });
});

describe("nothing is priced until Gabe confirms", () => {
  test("the shipped config refuses everything", () => {
    assert.equal(embroideryPricingConfig.ratesConfirmed, false);
    assert.equal(embroideryPricingConfig.digitizingFee, null);
    assert.deepEqual(embroideryPerPiece(6500, 24), { ok: false, reason: "embroidery rates are not confirmed" });
  });
});

describe("looking a price up", () => {
  const price = (stitches: number, quantity: number) => embroideryPerPiece(stitches, quantity, live);

  test("an exact column edge prices in that column", () => {
    assert.deepEqual(price(5000, 6), { ok: true, perPiece: 6.25, garmentMarkup: 1.5, column: "0 - 5000 Stitches", minQuantity: 6 });
    const seven = price(7000, 12);
    assert.ok(seven.ok && seven.perPiece === 6.05);
  });

  test("a gap rides the NEXT column up: the shop is never undercharged", () => {
    // 5,001-6,000 has no column; 11,001-11,999 has none either.
    const a = price(5400, 12);
    assert.ok(a.ok && a.column === "6001 - 7000 Stitches" && a.perPiece === 6.05);

    const b = price(11500, 12);
    assert.ok(b.ok && b.column === "12-13K Stitches" && b.perPiece === 9.75);
  });

  test("above 13,000 is a hand quote while the last column is unconfirmed", () => {
    for (const stitches of [13001, 15000, 20000]) {
      const result = price(stitches, 24);
      assert.equal(result.ok, false, String(stitches));
      assert.match(result.ok ? "" : result.reason, /not confirmed/);
    }

    assert.match((price(20001, 24) as { reason: string }).reason, /more stitches than the table prices/);
  });

  test("step-down quantity: a run prices at the row it has reached", () => {
    const at = (q: number) => {
      const r = price(4000, q);
      return r.ok ? r.minQuantity : null;
    };

    assert.equal(at(6), 6);
    assert.equal(at(11), 6);
    assert.equal(at(12), 12);
    assert.equal(at(47), 12);
    assert.equal(at(200), 144);
    assert.equal(at(5000), 1000);
  });

  test("fewer than six pieces is a hand quote", () => {
    for (const q of [1, 5]) {
      const r = price(4000, q);
      assert.equal(r.ok, false);
      assert.match((r as { reason: string }).reason, /fewer than 6 pieces/);
    }
  });

  test("the backwards cell reads $8.76, not $8.50", () => {
    const r = price(10500, 6);
    assert.ok(r.ok && r.perPiece === 8.76 && r.column === "10-11K Stitches");
  });

  test("nonsense is refused, not priced", () => {
    for (const [s, q] of [[0, 12], [-5, 12], [Number.NaN, 12], [5000, 0], [5000, Number.NaN]] as const) {
      assert.equal(price(s, q).ok, false, `${s}/${q}`);
    }
  });
});

describe("an estimate over several placements", () => {
  test("each placement is its own pass at its own stitch count, summed to the cent", () => {
    const e = estimateEmbroidery(
      [
        { label: "Left chest", stitches: 6500 },
        { label: "Sleeve", stitches: 3000 },
      ],
      24,
      live
    );

    assert.ok(e.ok);
    if (!e.ok) return;
    // 24 pieces prices at the 12 row: 7,000 col $6.05, 5,000 col $5.50.
    assert.equal(e.placements[0].total, 145.2);
    assert.equal(e.placements[1].total, 132);
    assert.equal(e.embroideryTotal, 277.2);
    assert.equal(e.garmentMarkup, 1.5);
  });

  test("the digitizing fee is per design and stays null until Gabe gives it", () => {
    const designs = [
      { label: "Left chest", stitches: 6500 },
      { label: "Cap front", stitches: 5000 },
    ];

    const unset = estimateEmbroidery(designs, 24, live);
    assert.ok(unset.ok && unset.digitizingTotal === null);

    const set = estimateEmbroidery(designs, 24, { ...live, digitizingFee: 40 });
    assert.ok(set.ok && set.digitizingTotal === 80);
  });

  test("one unpriceable placement makes the whole estimate a hand quote, and says which", () => {
    const e = estimateEmbroidery(
      [
        { label: "Left chest", stitches: 6500 },
        { label: "Back", stitches: 15000 },
      ],
      24,
      live
    );

    assert.equal(e.ok, false);
    assert.match(e.ok ? "" : e.reason, /^Back: /);
  });

  test("no placement is a hand quote", () => {
    assert.equal(estimateEmbroidery([], 24, live).ok, false);
  });
});
