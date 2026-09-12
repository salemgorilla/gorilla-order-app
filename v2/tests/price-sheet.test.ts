import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { repriceStickers } from "../lib/sticker-repricing";

/**
 * The price sheet. Every figure the server will quote, written down.
 *
 * ── WHY A TABLE AND NOT MORE ASSERTIONS ───────────────────────────────────
 * tests/sticker-pricing.test.ts checks that the FORMULA behaves — area times
 * rate, setup per design, the premium markup on material only. This checks
 * something different and duller: that the actual dollars do not move.
 *
 * A formula test passes just as happily after someone changes the rate, so
 * long as they change it consistently. This does not. Any edit that moves a
 * price shows up here as a diff of readable numbers, and either the change
 * was intended — in which case the new sheet is reviewed and committed with
 * it — or it was not, and the suite caught a repricing nobody asked for.
 *
 * That matters because stickers self-check-out. Nothing between a repricing
 * and a customer's card is reviewed by a human.
 *
 * ── THE NUMBERS ARE LITERALS, DELIBERATELY ────────────────────────────────
 * Generated once from repriceStickers and pasted. They are NOT recomputed at
 * test time — a table the code fills in would agree with the code no matter
 * what it did, which is the shape of a test that reads as coverage and
 * protects nothing.
 *
 * ── REGENERATED 2026-09-11 FOR THE RE-RATE ────────────────────────────────
 * Every one of the 199 rows moved. Gabe, that morning: "The sticker quote
 * system is not accurate. The cost of Lexi order is $55 approximately.
 * Should be closer to $85." Both constants in lib/pricing.ts were scaled by
 * the same ~58% — the rate to $0.05/sq in and setup to $40 — so that the
 * volume break the setup fee provides survives the rise. That file's header
 * carries the reasoning; this sheet is the readable diff of what it did.
 *
 * REGENERATED AGAIN the same day for STICKER_VOLUME_TIERS — the old site's
 * quantity curve put back on top of the re-rate, so 96 of these rows (every
 * one at 500 and above) came DOWN from where the morning's rise had put
 * them. Gabe: "if you are increasing the pricing across the board, those
 * discounts should still be active." 100 x 3" is unchanged at $85.00.
 *
 * THE REFERENCE ROW: 100 x 3" pickup, single design, is now $85.00 exactly.
 * That is Lexi Sprague's order (GS-20260910-U38N3), the one that started it.
 *
 * ── WHAT THE OLD ANCHORS DID AND DID NOT PROVE ────────────────────────────
 * This sheet used to cite four figures verified outside the repo, including
 * 3 x 100 x 3" pickup at $136.40, reconciled against a real Printavo invoice
 * on 15 Aug to the cent. A re-rate retires those dollar figures — they were
 * correct for the old constants and are simply not what the shop charges any
 * more.
 *
 * Be precise about what is lost. That reconciliation proved the APP AND
 * PRINTAVO AGREE: the payload, the tax flags and the invoice arithmetic line
 * up. Nothing about that pipeline changed here, and Lexi's own order re-proved
 * it four weeks later — $53.80 quoted, $55.60 collected, which is exactly
 * $28.80 of stickers plus 6.25% MA tax plus untaxed $25 setup.
 *
 * What is NOT proved is the new rate against a real invoice, because no order
 * has been placed at it yet. HANDOFF.md's Reconciled table carries that as
 * owed, and the first sticker order after this ships is the one to check.
 *
 * ── WHAT IS NOT COVERED HERE ──────────────────────────────────────────────
 * Tax. The payload deliberately stays PRE-TAX so Printavo computes what is
 * actually charged from the per-line `taxed` flags — see lib/tax.ts. These
 * are the goods-and-setup figures the payment link is generated from.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * TO REGENERATE after an intended price change: run repriceStickers over the
 * same grid, paste the output below, and put the reason in the commit.
 * Columns: quantity, size, material, delivery, total, [designs in the cart].
 */
const PRICE_SHEET = `
1     1x1           Gloss White Vinyl  pickup   15.08
25    1x1           Gloss White Vinyl  pickup   16.95
100   1x1           Gloss White Vinyl  pickup   22.78
500   1x1           Gloss White Vinyl  pickup   39.90
1000  1x1           Gloss White Vinyl  pickup   58.60
5000  1x1           Gloss White Vinyl  pickup   198.00
1     2x2           Gloss White Vinyl  pickup   15.31
25    2x2           Gloss White Vinyl  pickup   22.78
100   2x2           Gloss White Vinyl  pickup   46.11
500   2x2           Gloss White Vinyl  pickup   114.55
1000  2x2           Gloss White Vinyl  pickup   189.20
5000  2x2           Gloss White Vinyl  pickup   746.00
1     3x3           Gloss White Vinyl  pickup   15.70
25    3x3           Gloss White Vinyl  pickup   32.50
100   3x3           Gloss White Vinyl  pickup   85.00
500   3x3           Gloss White Vinyl  pickup   239.00
1000  3x3           Gloss White Vinyl  pickup   407.00
5000  3x3           Gloss White Vinyl  pickup   1660.00
1     4x4           Gloss White Vinyl  pickup   16.24
25    4x4           Gloss White Vinyl  pickup   46.11
100   4x4           Gloss White Vinyl  pickup   139.44
500   4x4           Gloss White Vinyl  pickup   413.20
1000  4x4           Gloss White Vinyl  pickup   711.90
5000  4x4           Gloss White Vinyl  pickup   2939.50
1     2x6           Gloss White Vinyl  pickup   15.93
25    2x6           Gloss White Vinyl  pickup   38.33
100   2x6           Gloss White Vinyl  pickup   108.33
500   2x6           Gloss White Vinyl  pickup   313.65
1000  2x6           Gloss White Vinyl  pickup   537.70
5000  2x6           Gloss White Vinyl  pickup   2208.50
1     6x2           Gloss White Vinyl  pickup   15.93
25    6x2           Gloss White Vinyl  pickup   38.33
100   6x2           Gloss White Vinyl  pickup   108.33
500   6x2           Gloss White Vinyl  pickup   313.65
1000  6x2           Gloss White Vinyl  pickup   537.70
5000  6x2           Gloss White Vinyl  pickup   2208.50
1     3.375x3.375   Gloss White Vinyl  pickup   15.89
25    3.375x3.375   Gloss White Vinyl  pickup   37.15
100   3.375x3.375   Gloss White Vinyl  pickup   103.59
500   3.375x3.375   Gloss White Vinyl  pickup   298.50
1000  3.375x3.375   Gloss White Vinyl  pickup   511.10
5000  3.375x3.375   Gloss White Vinyl  pickup   2097.00
1     0.5x0.5       Gloss White Vinyl  pickup   15.02
25    0.5x0.5       Gloss White Vinyl  pickup   15.49
100   0.5x0.5       Gloss White Vinyl  pickup   16.94
500   0.5x0.5       Gloss White Vinyl  pickup   21.20
1000  0.5x0.5       Gloss White Vinyl  pickup   25.90
5000  0.5x0.5       Gloss White Vinyl  pickup   60.50
1     1x1           Matte White Vinyl  pickup   15.08
25    1x1           Matte White Vinyl  pickup   16.95
100   1x1           Matte White Vinyl  pickup   22.78
500   1x1           Matte White Vinyl  pickup   39.90
1000  1x1           Matte White Vinyl  pickup   58.60
5000  1x1           Matte White Vinyl  pickup   198.00
1     2x2           Matte White Vinyl  pickup   15.31
25    2x2           Matte White Vinyl  pickup   22.78
100   2x2           Matte White Vinyl  pickup   46.11
500   2x2           Matte White Vinyl  pickup   114.55
1000  2x2           Matte White Vinyl  pickup   189.20
5000  2x2           Matte White Vinyl  pickup   746.00
1     3x3           Matte White Vinyl  pickup   15.70
25    3x3           Matte White Vinyl  pickup   32.50
100   3x3           Matte White Vinyl  pickup   85.00
500   3x3           Matte White Vinyl  pickup   239.00
1000  3x3           Matte White Vinyl  pickup   407.00
5000  3x3           Matte White Vinyl  pickup   1660.00
1     4x4           Matte White Vinyl  pickup   16.24
25    4x4           Matte White Vinyl  pickup   46.11
100   4x4           Matte White Vinyl  pickup   139.44
500   4x4           Matte White Vinyl  pickup   413.20
1000  4x4           Matte White Vinyl  pickup   711.90
5000  4x4           Matte White Vinyl  pickup   2939.50
1     2x6           Matte White Vinyl  pickup   15.93
25    2x6           Matte White Vinyl  pickup   38.33
100   2x6           Matte White Vinyl  pickup   108.33
500   2x6           Matte White Vinyl  pickup   313.65
1000  2x6           Matte White Vinyl  pickup   537.70
5000  2x6           Matte White Vinyl  pickup   2208.50
1     6x2           Matte White Vinyl  pickup   15.93
25    6x2           Matte White Vinyl  pickup   38.33
100   6x2           Matte White Vinyl  pickup   108.33
500   6x2           Matte White Vinyl  pickup   313.65
1000  6x2           Matte White Vinyl  pickup   537.70
5000  6x2           Matte White Vinyl  pickup   2208.50
1     3.375x3.375   Matte White Vinyl  pickup   15.89
25    3.375x3.375   Matte White Vinyl  pickup   37.15
100   3.375x3.375   Matte White Vinyl  pickup   103.59
500   3.375x3.375   Matte White Vinyl  pickup   298.50
1000  3.375x3.375   Matte White Vinyl  pickup   511.10
5000  3.375x3.375   Matte White Vinyl  pickup   2097.00
1     0.5x0.5       Matte White Vinyl  pickup   15.02
25    0.5x0.5       Matte White Vinyl  pickup   15.49
100   0.5x0.5       Matte White Vinyl  pickup   16.94
500   0.5x0.5       Matte White Vinyl  pickup   21.20
1000  0.5x0.5       Matte White Vinyl  pickup   25.90
5000  0.5x0.5       Matte White Vinyl  pickup   60.50
1     1x1           Chrome             pickup   15.12
25    1x1           Chrome             pickup   18.11
100   1x1           Chrome             pickup   27.44
500   1x1           Chrome             pickup   54.80
1000  1x1           Chrome             pickup   84.70
5000  1x1           Chrome             pickup   307.50
1     2x2           Chrome             pickup   15.50
25    2x2           Chrome             pickup   27.45
100   2x2           Chrome             pickup   64.78
500   2x2           Chrome             pickup   174.30
1000  2x2           Chrome             pickup   293.80
5000  2x2           Chrome             pickup   1185.00
1     3x3           Chrome             pickup   16.12
25    3x3           Chrome             pickup   43.00
100   3x3           Chrome             pickup   127.00
500   3x3           Chrome             pickup   373.40
1000  3x3           Chrome             pickup   642.20
5000  3x3           Chrome             pickup   2647.00
1     4x4           Chrome             pickup   16.99
25    4x4           Chrome             pickup   64.78
100   4x4           Chrome             pickup   214.11
500   4x4           Chrome             pickup   652.15
1000  4x4           Chrome             pickup   1130.00
5000  4x4           Chrome             pickup   4694.00
1     2x6           Chrome             pickup   16.49
25    2x6           Chrome             pickup   52.33
100   2x6           Chrome             pickup   164.33
500   2x6           Chrome             pickup   492.85
1000  2x6           Chrome             pickup   851.30
5000  2x6           Chrome             pickup   3524.50
1     6x2           Chrome             pickup   16.49
25    6x2           Chrome             pickup   52.33
100   6x2           Chrome             pickup   164.33
500   6x2           Chrome             pickup   492.85
1000  6x2           Chrome             pickup   851.30
5000  6x2           Chrome             pickup   3524.50
1     3.375x3.375   Chrome             pickup   16.42
25    3.375x3.375   Chrome             pickup   50.44
100   3.375x3.375   Chrome             pickup   156.75
500   3.375x3.375   Chrome             pickup   468.60
1000  3.375x3.375   Chrome             pickup   808.80
5000  3.375x3.375   Chrome             pickup   3346.00
1     0.5x0.5       Chrome             pickup   15.03
25    0.5x0.5       Chrome             pickup   15.78
100   0.5x0.5       Chrome             pickup   18.11
500   0.5x0.5       Chrome             pickup   24.95
1000  0.5x0.5       Chrome             pickup   32.40
5000  0.5x0.5       Chrome             pickup   88.00
1     1x1           Holographic        pickup   15.12
25    1x1           Holographic        pickup   18.11
100   1x1           Holographic        pickup   27.44
500   1x1           Holographic        pickup   54.80
1000  1x1           Holographic        pickup   84.70
5000  1x1           Holographic        pickup   307.50
1     2x2           Holographic        pickup   15.50
25    2x2           Holographic        pickup   27.45
100   2x2           Holographic        pickup   64.78
500   2x2           Holographic        pickup   174.30
1000  2x2           Holographic        pickup   293.80
5000  2x2           Holographic        pickup   1185.00
1     3x3           Holographic        pickup   16.12
25    3x3           Holographic        pickup   43.00
100   3x3           Holographic        pickup   127.00
500   3x3           Holographic        pickup   373.40
1000  3x3           Holographic        pickup   642.20
5000  3x3           Holographic        pickup   2647.00
1     4x4           Holographic        pickup   16.99
25    4x4           Holographic        pickup   64.78
100   4x4           Holographic        pickup   214.11
500   4x4           Holographic        pickup   652.15
1000  4x4           Holographic        pickup   1130.00
5000  4x4           Holographic        pickup   4694.00
1     2x6           Holographic        pickup   16.49
25    2x6           Holographic        pickup   52.33
100   2x6           Holographic        pickup   164.33
500   2x6           Holographic        pickup   492.85
1000  2x6           Holographic        pickup   851.30
5000  2x6           Holographic        pickup   3524.50
1     6x2           Holographic        pickup   16.49
25    6x2           Holographic        pickup   52.33
100   6x2           Holographic        pickup   164.33
500   6x2           Holographic        pickup   492.85
1000  6x2           Holographic        pickup   851.30
5000  6x2           Holographic        pickup   3524.50
1     3.375x3.375   Holographic        pickup   16.42
25    3.375x3.375   Holographic        pickup   50.44
100   3.375x3.375   Holographic        pickup   156.75
500   3.375x3.375   Holographic        pickup   468.60
1000  3.375x3.375   Holographic        pickup   808.80
5000  3.375x3.375   Holographic        pickup   3346.00
1     0.5x0.5       Holographic        pickup   15.03
25    0.5x0.5       Holographic        pickup   15.78
100   0.5x0.5       Holographic        pickup   18.11
500   0.5x0.5       Holographic        pickup   24.95
1000  0.5x0.5       Holographic        pickup   32.40
5000  0.5x0.5       Holographic        pickup   88.00
100   3x3           Gloss White Vinyl  pickup   162.50   x2 designs
100   3x3           Gloss White Vinyl  ship     174.50   x2 designs
100   3x3           Gloss White Vinyl  pickup   240.00   x3 designs
100   3x3           Gloss White Vinyl  ship     252.00   x3 designs
100   3x3           Gloss White Vinyl  pickup   395.00   x5 designs
100   3x3           Gloss White Vinyl  ship     407.00   x5 designs
100   3x3           Gloss White Vinyl  ship     97.00
`;

type Row = {
  quantity: number;
  widthInches: number;
  heightInches: number;
  material: string;
  delivery: string;
  total: number;
  designs: number;
};

function parseSheet(sheet: string): Row[] {
  return sheet
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "1000  3x3  Gloss White Vinyl  pickup  313.00   x3 designs"
      const match = line.match(
        /^(\d+)\s+([\d.]+)x([\d.]+)\s+(.+?)\s+(pickup|ship)\s+([\d.]+)(?:\s+x(\d+) designs)?$/
      );

      assert.ok(match, `unreadable price sheet row: ${line}`);

      return {
        quantity: Number(match[1]),
        widthInches: Number(match[2]),
        heightInches: Number(match[3]),
        material: match[4].trim(),
        delivery: match[5],
        total: Number(match[6]),
        designs: match[7] ? Number(match[7]) : 1,
      };
    });
}

const ROWS = parseSheet(PRICE_SHEET);

function priceOf(row: Row) {
  const design = {
    quantity: row.quantity,
    material: row.material,
    size: `${row.widthInches}" x ${row.heightInches}"`,
    widthInches: row.widthInches,
    heightInches: row.heightInches,
  };

  const priced = repriceStickers({
    customer: { customerName: "T", email: "t@example.com" },
    production: { deliveryMethod: row.delivery === "ship" ? "Ship" : "Pickup" },
    product: { type: "Custom Stickers", quantity: row.quantity },
    items: Array.from({ length: row.designs }, () => ({ ...design })),
    pricing: { total: 0 },
  });

  return priced;
}

describe("the price sheet has not moved", () => {
  test("the sheet parsed, and covers the grid it claims to", () => {
    // A parser that silently matched nothing would make every test below
    // pass by iterating an empty list.
    assert.equal(ROWS.length, 199);

    assert.equal(new Set(ROWS.map((r) => r.material)).size, 4);
    assert.equal(new Set(ROWS.map((r) => `${r.widthInches}x${r.heightInches}`)).size, 8);
    assert.equal(new Set(ROWS.map((r) => r.quantity)).size, 6);
    assert.ok(ROWS.some((r) => r.delivery === "ship"));
    assert.ok(ROWS.some((r) => r.designs > 1));
  });

  for (const row of ROWS) {
    const label =
      `${row.quantity} x ${row.widthInches}"x${row.heightInches}" ` +
      `${row.material}, ${row.delivery}` +
      (row.designs > 1 ? `, ${row.designs} designs` : "");

    test(`${label} = $${row.total.toFixed(2)}`, () => {
      const priced = priceOf(row);

      assert.equal(priced.serverTotal, row.total);

      // Every row on this sheet is a priceable order, so every one of them
      // must still be allowed to issue a payment link. A guard that started
      // over-firing would take checkout down silently.
      assert.equal(priced.unpriceable, false);
    });
  }
});

describe("the anchors", () => {
  /**
   * Figures verified OUTSIDE this repo, so they check the sheet rather than
   * each other. If one of these moves, the sheet is wrong, not the anchor.
   *
   * All four were replaced on 2026-09-11. The old ones — $148.40 for the
   * three-design cart, $136.40 reconciled against a real Printavo invoice —
   * were correct for the old constants and are simply not what the shop
   * charges any more. See the header for what that reconciliation did and
   * did not prove.
   */
  const find = (q: number, w: number, h: number, delivery: string, designs = 1) =>
    ROWS.find(
      (r) =>
        r.quantity === q &&
        r.widthInches === w &&
        r.heightInches === h &&
        r.delivery === delivery &&
        r.designs === designs &&
        r.material === "Gloss White Vinyl"
    );

  test("the order that started the re-rate", () => {
    // Lexi Sprague, GS-20260910-U38N3: 100 x 3" circles, local pickup,
    // quoted $53.80 and paid $55.60 with tax. Gabe the next morning: "should
    // be closer to $85." This row IS that number, and the whole re-rate was
    // sized to land on it.
    assert.equal(find(100, 3, 3, "pickup")?.total, 85);
  });

  test("the sheet sits in the band of Gabe's own hand quotes", () => {
    /**
     * The only outside check on the RATE itself, and the reason it is worth
     * having: a sheet can be internally perfect and still charge half what
     * the shop charges, which is exactly the state this replaced.
     *
     * His words to Boston Children's Hospital, 2025-05-15, verbatim: "here
     * are prices no matter which art is used, based on size: 2x2 = $0.75
     * each, 3x3 = $1.00 each, 5x6 = $1.75 each". The old formula charged
     * $0.38, $0.54 and $1.21 for those.
     *
     * A BAND, not an equality. Those were hand-quoted to one customer on one
     * day and the web price is deliberately a little under a negotiated one.
     * The band is wide enough to allow that and narrow enough to fail the
     * "half price" bug it exists to catch.
     */
    const handQuoted: [number, number, number][] = [
      [2, 2, 0.75],
      [3, 3, 1.0],
      [5, 6, 1.75],
    ];

    for (const [w, h, his] of handQuoted) {
      const priced = priceOf({
        quantity: 100,
        widthInches: w,
        heightInches: h,
        material: "Gloss White Vinyl",
        delivery: "pickup",
        total: 0,
        designs: 1,
      });

      const ours = priced.serverTotal / 100;
      const ratio = ours / his;

      assert.ok(
        // 0.7-1.2 until 2026-09-12. Moving $25 of setup into the rate put
        // a 2x2 at 61% of the hand quote and a 5x6 at 142% — Gabe's call,
        // made with those numbers in front of him. The band is now wide
        // enough to hold that decision and still catches the "half price
        // everywhere" bug it exists for, which would sit near 0.3.
        ratio > 0.55 && ratio < 1.5,
        `${w}x${h}: shop quotes $${his.toFixed(2)} each by hand, the app says $${ours.toFixed(
          2
        )} — ${(ratio * 100).toFixed(0)}% of it`
      );
    }
  });

  test("the cart is still a deliberate price cut", () => {
    // CART-PLAN.md's reason for existing: three designs in one cart must
    // cost less than three separate orders. The figures moved with the
    // re-rate; the property did not.
    const cart = find(100, 3, 3, "ship", 3)?.total as number;
    const separately = 3 * (find(100, 3, 3, "ship")?.total as number);

    assert.equal(cart, 252);
    assert.ok(cart < separately, `${cart} is not less than ${separately}`);
    // Proportional, not a dollar figure: the cut is two extra setup fees
    // and two shipping charges, and it shrank in dollars when setup did.
    assert.ok(cart / separately < 0.9, "the cut stopped being worth taking");
  });

  test("the prices the missing floor allows, as documented", () => {
    // lib/pricing.ts says these out loud: with no minimum price, small sizes
    // at high quantities still go low, and self-checkout charges them with
    // nobody in the loop. Kept visible rather than buried so the day the shop
    // wants a floor, the cost of not having one is already written down.
    // After the volume curve (STICKER_VOLUME_TIERS): 5,000 pays 72% of the
    // material rate, so these came down from $290 and $102.50 the same day.
    // And down again on 2026-09-12 when $25 of setup moved into the rate —
    // a flat fee is most of the price on a tiny sticker.
    // $198.00 and $60.50, not $197.78 and $60.69: the per-sticker price is
    // quantised to the four decimals Printavo stores BEFORE it is multiplied
    // (getStickerUnitMaterialPrice), and on 5,000 pieces that fourth decimal
    // is worth up to 25 cents. This is the figure Printavo bills, which is
    // the only figure worth writing down.
    assert.equal(find(5000, 1, 1, "pickup")?.total, 198);
    assert.equal(find(5000, 0.5, 0.5, "pickup")?.total, 60.5);
  });
});
