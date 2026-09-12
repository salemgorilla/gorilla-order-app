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
1     1x1           Gloss White Vinyl  pickup   15.38
25    1x1           Gloss White Vinyl  pickup   24.50
100   1x1           Gloss White Vinyl  pickup   53.00
500   1x1           Gloss White Vinyl  pickup   168.90
1000  1x1           Gloss White Vinyl  pickup   302.60
5000  1x1           Gloss White Vinyl  pickup   1141.00
1     2x2           Gloss White Vinyl  pickup   15.50
25    2x2           Gloss White Vinyl  pickup   27.50
100   2x2           Gloss White Vinyl  pickup   65.00
500   2x2           Gloss White Vinyl  pickup   197.10
1000  2x2           Gloss White Vinyl  pickup   349.40
5000  2x2           Gloss White Vinyl  pickup   1357.00
1     3x3           Gloss White Vinyl  pickup   15.70
25    3x3           Gloss White Vinyl  pickup   32.50
100   3x3           Gloss White Vinyl  pickup   85.00
500   3x3           Gloss White Vinyl  pickup   244.10
1000  3x3           Gloss White Vinyl  pickup   427.40
5000  3x3           Gloss White Vinyl  pickup   1717.00
1     4x4           Gloss White Vinyl  pickup   15.98
25    4x4           Gloss White Vinyl  pickup   39.50
100   4x4           Gloss White Vinyl  pickup   113.00
500   4x4           Gloss White Vinyl  pickup   309.90
1000  4x4           Gloss White Vinyl  pickup   536.60
5000  4x4           Gloss White Vinyl  pickup   2221.00
1     2x6           Gloss White Vinyl  pickup   15.82
25    2x6           Gloss White Vinyl  pickup   35.50
100   2x6           Gloss White Vinyl  pickup   97.00
500   2x6           Gloss White Vinyl  pickup   272.30
1000  2x6           Gloss White Vinyl  pickup   474.20
5000  2x6           Gloss White Vinyl  pickup   1933.00
1     6x2           Gloss White Vinyl  pickup   15.82
25    6x2           Gloss White Vinyl  pickup   35.50
100   6x2           Gloss White Vinyl  pickup   97.00
500   6x2           Gloss White Vinyl  pickup   272.30
1000  6x2           Gloss White Vinyl  pickup   474.20
5000  6x2           Gloss White Vinyl  pickup   1933.00
1     3.375x3.375   Gloss White Vinyl  pickup   15.80
25    3.375x3.375   Gloss White Vinyl  pickup   34.89
100   3.375x3.375   Gloss White Vinyl  pickup   94.56
500   3.375x3.375   Gloss White Vinyl  pickup   266.55
1000  3.375x3.375   Gloss White Vinyl  pickup   464.70
5000  3.375x3.375   Gloss White Vinyl  pickup   1889.00
1     0.5x0.5       Gloss White Vinyl  pickup   15.35
25    0.5x0.5       Gloss White Vinyl  pickup   23.75
100   0.5x0.5       Gloss White Vinyl  pickup   50.00
500   0.5x0.5       Gloss White Vinyl  pickup   161.85
1000  0.5x0.5       Gloss White Vinyl  pickup   290.90
5000  0.5x0.5       Gloss White Vinyl  pickup   1087.00
1     1x1           Matte White Vinyl  pickup   15.40
25    1x1           Matte White Vinyl  pickup   24.98
100   1x1           Matte White Vinyl  pickup   54.90
500   1x1           Matte White Vinyl  pickup   176.60
1000  1x1           Matte White Vinyl  pickup   317.00
5000  1x1           Matte White Vinyl  pickup   1197.50
1     2x2           Matte White Vinyl  pickup   15.53
25    2x2           Matte White Vinyl  pickup   28.13
100   2x2           Matte White Vinyl  pickup   67.50
500   2x2           Matte White Vinyl  pickup   206.20
1000  2x2           Matte White Vinyl  pickup   366.10
5000  2x2           Matte White Vinyl  pickup   1424.00
1     3x3           Matte White Vinyl  pickup   15.74
25    3x3           Matte White Vinyl  pickup   33.38
100   3x3           Matte White Vinyl  pickup   88.50
500   3x3           Matte White Vinyl  pickup   255.55
1000  3x3           Matte White Vinyl  pickup   448.00
5000  3x3           Matte White Vinyl  pickup   1802.00
1     4x4           Matte White Vinyl  pickup   16.03
25    4x4           Matte White Vinyl  pickup   40.73
100   4x4           Matte White Vinyl  pickup   117.90
500   4x4           Matte White Vinyl  pickup   324.65
1000  4x4           Matte White Vinyl  pickup   562.70
5000  4x4           Matte White Vinyl  pickup   2331.50
1     2x6           Matte White Vinyl  pickup   15.86
25    2x6           Matte White Vinyl  pickup   36.53
100   2x6           Matte White Vinyl  pickup   101.10
500   2x6           Matte White Vinyl  pickup   285.15
1000  2x6           Matte White Vinyl  pickup   497.20
5000  2x6           Matte White Vinyl  pickup   2029.00
1     6x2           Matte White Vinyl  pickup   15.86
25    6x2           Matte White Vinyl  pickup   36.53
100   6x2           Matte White Vinyl  pickup   101.10
500   6x2           Matte White Vinyl  pickup   285.15
1000  6x2           Matte White Vinyl  pickup   497.20
5000  6x2           Matte White Vinyl  pickup   2029.00
1     3.375x3.375   Matte White Vinyl  pickup   15.84
25    3.375x3.375   Matte White Vinyl  pickup   35.89
100   3.375x3.375   Matte White Vinyl  pickup   98.54
500   3.375x3.375   Matte White Vinyl  pickup   279.15
1000  3.375x3.375   Matte White Vinyl  pickup   487.20
5000  3.375x3.375   Matte White Vinyl  pickup   1983.00
1     0.5x0.5       Matte White Vinyl  pickup   15.37
25    0.5x0.5       Matte White Vinyl  pickup   24.19
100   0.5x0.5       Matte White Vinyl  pickup   51.75
500   0.5x0.5       Matte White Vinyl  pickup   169.20
1000  0.5x0.5       Matte White Vinyl  pickup   304.70
5000  0.5x0.5       Matte White Vinyl  pickup   1140.50
1     1x1           Chrome             pickup   15.49
25    1x1           Chrome             pickup   27.35
100   1x1           Chrome             pickup   64.40
500   1x1           Chrome             pickup   215.05
1000  1x1           Chrome             pickup   388.90
5000  1x1           Chrome             pickup   1479.00
1     2x2           Chrome             pickup   15.65
25    2x2           Chrome             pickup   31.25
100   2x2           Chrome             pickup   80.00
500   2x2           Chrome             pickup   251.75
1000  2x2           Chrome             pickup   449.70
5000  2x2           Chrome             pickup   1759.50
1     3x3           Chrome             pickup   15.91
25    3x3           Chrome             pickup   37.75
100   3x3           Chrome             pickup   106.00
500   3x3           Chrome             pickup   312.85
1000  3x3           Chrome             pickup   551.10
5000  3x3           Chrome             pickup   2227.50
1     4x4           Chrome             pickup   16.27
25    4x4           Chrome             pickup   46.85
100   4x4           Chrome             pickup   142.40
500   4x4           Chrome             pickup   398.35
1000  4x4           Chrome             pickup   693.10
5000  4x4           Chrome             pickup   2883.00
1     2x6           Chrome             pickup   16.07
25    2x6           Chrome             pickup   41.65
100   2x6           Chrome             pickup   121.60
500   2x6           Chrome             pickup   349.50
1000  2x6           Chrome             pickup   612.00
5000  2x6           Chrome             pickup   2508.50
1     6x2           Chrome             pickup   16.07
25    6x2           Chrome             pickup   41.65
100   6x2           Chrome             pickup   121.60
500   6x2           Chrome             pickup   349.50
1000  6x2           Chrome             pickup   612.00
5000  6x2           Chrome             pickup   2508.50
1     3.375x3.375   Chrome             pickup   16.03
25    3.375x3.375   Chrome             pickup   40.86
100   3.375x3.375   Chrome             pickup   118.43
500   3.375x3.375   Chrome             pickup   342.05
1000  3.375x3.375   Chrome             pickup   599.60
5000  3.375x3.375   Chrome             pickup   2451.50
1     0.5x0.5       Chrome             pickup   15.46
25    0.5x0.5       Chrome             pickup   26.38
100   0.5x0.5       Chrome             pickup   60.50
500   0.5x0.5       Chrome             pickup   205.90
1000  0.5x0.5       Chrome             pickup   373.70
5000  0.5x0.5       Chrome             pickup   1408.50
1     1x1           Holographic        pickup   15.51
25    1x1           Holographic        pickup   27.83
100   1x1           Holographic        pickup   66.30
500   1x1           Holographic        pickup   222.75
1000  1x1           Holographic        pickup   403.30
5000  1x1           Holographic        pickup   1535.00
1     2x2           Holographic        pickup   15.68
25    2x2           Holographic        pickup   31.88
100   2x2           Holographic        pickup   82.50
500   2x2           Holographic        pickup   260.85
1000  2x2           Holographic        pickup   466.40
5000  2x2           Holographic        pickup   1826.50
1     3x3           Holographic        pickup   15.95
25    3x3           Holographic        pickup   38.63
100   3x3           Holographic        pickup   109.50
500   3x3           Holographic        pickup   324.30
1000  3x3           Holographic        pickup   571.70
5000  3x3           Holographic        pickup   2312.50
1     4x4           Holographic        pickup   16.32
25    4x4           Holographic        pickup   48.08
100   4x4           Holographic        pickup   147.30
500   4x4           Holographic        pickup   413.10
1000  4x4           Holographic        pickup   719.20
5000  4x4           Holographic        pickup   2993.00
1     2x6           Holographic        pickup   16.11
25    2x6           Holographic        pickup   42.68
100   2x6           Holographic        pickup   125.70
500   2x6           Holographic        pickup   362.35
1000  2x6           Holographic        pickup   634.90
5000  2x6           Holographic        pickup   2604.50
1     6x2           Holographic        pickup   16.11
25    6x2           Holographic        pickup   42.68
100   6x2           Holographic        pickup   125.70
500   6x2           Holographic        pickup   362.35
1000  6x2           Holographic        pickup   634.90
5000  6x2           Holographic        pickup   2604.50
1     3.375x3.375   Holographic        pickup   16.07
25    3.375x3.375   Holographic        pickup   41.85
100   3.375x3.375   Holographic        pickup   122.41
500   3.375x3.375   Holographic        pickup   354.60
1000  3.375x3.375   Holographic        pickup   622.10
5000  3.375x3.375   Holographic        pickup   2545.00
1     0.5x0.5       Holographic        pickup   15.47
25    0.5x0.5       Holographic        pickup   26.81
100   0.5x0.5       Holographic        pickup   62.25
500   0.5x0.5       Holographic        pickup   213.25
1000  0.5x0.5       Holographic        pickup   387.50
5000  0.5x0.5       Holographic        pickup   1462.00
100   3x3           Gloss White Vinyl  pickup   162.50   x2 designs
100   3x3           Gloss White Vinyl  ship     174.50   x2 designs
100   3x3           Gloss White Vinyl  pickup   240.00   x3 designs
100   3x3           Gloss White Vinyl  ship     258.00   x3 designs
100   3x3           Gloss White Vinyl  pickup   395.00   x5 designs
100   3x3           Gloss White Vinyl  ship     413.00   x5 designs
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

    // $258: $210 of stickers + $30 of setup is $240 of goods, which is the
    // $18 shipping tier (SHIPPING_TIERS, the old site's) — not the flat $12.
    assert.equal(cart, 258);
    assert.ok(cart < separately, `${cart} is not less than ${separately}`);
    // Proportional, not a dollar figure: the cut is two extra setup fees
    // and two shipping charges, and it shrank in dollars when setup did.
    assert.ok(cart / separately < 0.9, "the cut stopped being worth taking");
  });

  test("the floor the per-sticker term puts under tiny stickers, as documented", () => {
    // For a month lib/pricing.ts said out loud that the shop's price floor
    // was missing: 5,000 x 0.5" priced at $65 and auto-billed, then $102.50,
    // then $60.50 as the rate and setup moved around it. The per-sticker
    // term (STICKER_PER_PIECE, 2026-09-12) is the floor in effect — $0.34 of
    // handling before the volume curve, whatever the size. These rows are
    // what that costs a customer ordering thousands of tiny stickers, kept
    // visible so the figure is a decision and not a surprise.
    // Up again once the per-piece term got its own, gentler volume curve
    // (STICKER_VOLUME_TIERS, two curves): at 5,000 a sticker keeps 62% of
    // its handling and 36% of its area rate, and on a tiny sticker the
    // handling is most of the price.
    assert.equal(find(5000, 1, 1, "pickup")?.total, 1141.00);
    assert.equal(find(5000, 0.5, 0.5, "pickup")?.total, 1087.00);
  });
});
