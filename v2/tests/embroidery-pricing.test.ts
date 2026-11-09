/**
 * Looking a price up in the completed embroidery matrix, and the rules around it.
 *
 * The matrix itself (the export, the fills, the one adjusted cell) is pinned in
 * tests/embroidery-matrix.test.ts; this file is about using it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  embroideryPricingConfig,
  type EmbroideryPricingConfig,
} from "../lib/embroidery-pricing-config";
import { embroideryPerPiece, estimateEmbroidery, resolvedRows } from "../lib/embroidery-pricing";

const live: EmbroideryPricingConfig = { ...embroideryPricingConfig, ratesConfirmed: true };

describe("nothing is priced until Gabe confirms", () => {
  test("the shipped config refuses everything", () => {
    assert.equal(embroideryPricingConfig.ratesConfirmed, false);
    assert.equal(embroideryPricingConfig.digitizingFee, null);
    assert.deepEqual(embroideryPerPiece(6500, 24), { ok: false, reason: "embroidery rates are not confirmed" });
  });
});

describe("the completed matrix is sound", () => {
  test("no row has a larger design cheaper than a smaller one", () => {
    for (const row of embroideryPricingConfig.rows) {
      for (let i = 1; i < row.perPiece.length; i += 1) {
        assert.ok(row.perPiece[i] >= row.perPiece[i - 1], `qty ${row.minQuantity} col ${i}`);
      }
    }
  });

  test("a bigger run never costs more per piece, in any column", () => {
    for (let c = 0; c < embroideryPricingConfig.columns.length; c += 1) {
      for (let r = 1; r < embroideryPricingConfig.rows.length; r += 1) {
        assert.ok(
          embroideryPricingConfig.rows[r].perPiece[c] <= embroideryPricingConfig.rows[r - 1].perPiece[c],
          `col ${c} row ${r}`
        );
      }
    }
  });

  test("the never-cheaper clamp is now a no-op, kept as the last wall", () => {
    const clamped = resolvedRows(embroideryPricingConfig);

    embroideryPricingConfig.rows.forEach((row, i) => {
      assert.deepEqual([...clamped[i].perPiece], [...row.perPiece]);
    });
  });

  test("a hand-edited cell that breaks the rule is still caught by the clamp", () => {
    const broken: EmbroideryPricingConfig = {
      ...embroideryPricingConfig,
      rows: embroideryPricingConfig.rows.map((row, i) =>
        i === 0 ? { ...row, perPiece: row.perPiece.map((p, c) => (c === 8 ? 1 : p)) } : row
      ),
    };

    assert.ok(resolvedRows(broken)[0].perPiece[8] >= resolvedRows(broken)[0].perPiece[7]);
  });
});

describe("looking a price up", () => {
  const price = (stitches: number, quantity: number) => embroideryPerPiece(stitches, quantity, live);

  test("an exact band edge prices in that band", () => {
    assert.deepEqual(price(5000, 6), { ok: true, perPiece: 6.25, garmentMarkup: 1.5, column: "0 - 5000 Stitches", minQuantity: 6 });
    const seven = price(7000, 12);
    assert.ok(seven.ok && seven.perPiece === 6.05 && seven.column === "6001 - 7000 Stitches");
  });

  test("a count inside a band takes that band's price", () => {
    const a = price(5400, 12);
    assert.ok(a.ok && a.column === "5001 - 6000 Stitches" && a.perPiece === 5.5);

    const b = price(11500, 12);
    assert.ok(b.ok && b.column === "11001 - 12000 Stitches" && b.perPiece === 8.8);

    const c = price(15000, 12);
    assert.ok(c.ok && c.column === "14001 - 15000 Stitches" && c.perPiece === 11.89);
  });

  test("everything up to 20,000 stitches is priced", () => {
    for (const stitches of [13001, 16500, 19001, 20000]) {
      assert.equal(price(stitches, 24).ok, true, String(stitches));
    }

    const top = price(20000, 12);
    assert.ok(top.ok && top.perPiece === 17.25);
  });

  test("above 20,000 stitches is a hand quote", () => {
    const r = price(20001, 24);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.reason, /more stitches than the table prices/);
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
      assert.match(r.ok ? "" : r.reason, /fewer than 6 pieces/);
    }
  });

  test("the cell the export had backwards now reads $9.38", () => {
    const r = price(10500, 6);
    assert.ok(r.ok && r.perPiece === 9.38 && r.column === "10001 - 11000 Stitches");
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
    // 24 pieces prices at the 12 row: 6001-7000 $6.05, 0-5000 $5.50.
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
        { label: "Back", stitches: 25000 },
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
