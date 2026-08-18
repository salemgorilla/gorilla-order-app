import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { repriceStickers } from "../app/api/quote/route";

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
 * ── ANCHORED TO FIGURES VERIFIED OUTSIDE THIS REPO ────────────────────────
 * Four rows here are known-good independently, which is what makes the rest
 * of the sheet trustworthy rather than merely self-consistent:
 *
 *   3 x 100 x 3" shipped .......... $148.40   the price agreed with the shop
 *                                             in CART-PLAN.md, and the whole
 *                                             reason the cart exists
 *   3 x 100 x 3" pickup ........... $136.40   reconciled against a real
 *                                             Printavo invoice on 15 Aug —
 *                                             $144.93 due with MA 6.25% tax,
 *                                             to the cent (see HANDOFF.md)
 *   5,000 x 1" .................... $185.00   both quoted in the header of
 *   5,000 x 0.5" ................... $65.00   lib/pricing.ts as what the
 *                                             missing price floor allows
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
1     1x1           Gloss White Vinyl  pickup   25.03
25    1x1           Gloss White Vinyl  pickup   25.80
100   1x1           Gloss White Vinyl  pickup   28.20
500   1x1           Gloss White Vinyl  pickup   41.00
1000  1x1           Gloss White Vinyl  pickup   57.00
5000  1x1           Gloss White Vinyl  pickup   185.00
1     2x2           Gloss White Vinyl  pickup   25.13
25    2x2           Gloss White Vinyl  pickup   28.20
100   2x2           Gloss White Vinyl  pickup   37.80
500   2x2           Gloss White Vinyl  pickup   89.00
1000  2x2           Gloss White Vinyl  pickup   153.00
5000  2x2           Gloss White Vinyl  pickup   665.00
1     3x3           Gloss White Vinyl  pickup   25.29
25    3x3           Gloss White Vinyl  pickup   32.20
100   3x3           Gloss White Vinyl  pickup   53.80
500   3x3           Gloss White Vinyl  pickup   169.00
1000  3x3           Gloss White Vinyl  pickup   313.00
5000  3x3           Gloss White Vinyl  pickup   1465.00
1     4x4           Gloss White Vinyl  pickup   25.51
25    4x4           Gloss White Vinyl  pickup   37.80
100   4x4           Gloss White Vinyl  pickup   76.20
500   4x4           Gloss White Vinyl  pickup   281.00
1000  4x4           Gloss White Vinyl  pickup   537.00
5000  4x4           Gloss White Vinyl  pickup   2585.00
1     2x6           Gloss White Vinyl  pickup   25.38
25    2x6           Gloss White Vinyl  pickup   34.60
100   2x6           Gloss White Vinyl  pickup   63.40
500   2x6           Gloss White Vinyl  pickup   217.00
1000  2x6           Gloss White Vinyl  pickup   409.00
5000  2x6           Gloss White Vinyl  pickup   1945.00
1     6x2           Gloss White Vinyl  pickup   25.38
25    6x2           Gloss White Vinyl  pickup   34.60
100   6x2           Gloss White Vinyl  pickup   63.40
500   6x2           Gloss White Vinyl  pickup   217.00
1000  6x2           Gloss White Vinyl  pickup   409.00
5000  6x2           Gloss White Vinyl  pickup   1945.00
1     3.375x3.375   Gloss White Vinyl  pickup   25.36
25    3.375x3.375   Gloss White Vinyl  pickup   34.11
100   3.375x3.375   Gloss White Vinyl  pickup   61.45
500   3.375x3.375   Gloss White Vinyl  pickup   207.25
1000  3.375x3.375   Gloss White Vinyl  pickup   389.50
5000  3.375x3.375   Gloss White Vinyl  pickup   1847.50
1     0.5x0.5       Gloss White Vinyl  pickup   25.01
25    0.5x0.5       Gloss White Vinyl  pickup   25.20
100   0.5x0.5       Gloss White Vinyl  pickup   25.80
500   0.5x0.5       Gloss White Vinyl  pickup   29.00
1000  0.5x0.5       Gloss White Vinyl  pickup   33.00
5000  0.5x0.5       Gloss White Vinyl  pickup   65.00
1     1x1           Matte White Vinyl  pickup   25.03
25    1x1           Matte White Vinyl  pickup   25.80
100   1x1           Matte White Vinyl  pickup   28.20
500   1x1           Matte White Vinyl  pickup   41.00
1000  1x1           Matte White Vinyl  pickup   57.00
5000  1x1           Matte White Vinyl  pickup   185.00
1     2x2           Matte White Vinyl  pickup   25.13
25    2x2           Matte White Vinyl  pickup   28.20
100   2x2           Matte White Vinyl  pickup   37.80
500   2x2           Matte White Vinyl  pickup   89.00
1000  2x2           Matte White Vinyl  pickup   153.00
5000  2x2           Matte White Vinyl  pickup   665.00
1     3x3           Matte White Vinyl  pickup   25.29
25    3x3           Matte White Vinyl  pickup   32.20
100   3x3           Matte White Vinyl  pickup   53.80
500   3x3           Matte White Vinyl  pickup   169.00
1000  3x3           Matte White Vinyl  pickup   313.00
5000  3x3           Matte White Vinyl  pickup   1465.00
1     4x4           Matte White Vinyl  pickup   25.51
25    4x4           Matte White Vinyl  pickup   37.80
100   4x4           Matte White Vinyl  pickup   76.20
500   4x4           Matte White Vinyl  pickup   281.00
1000  4x4           Matte White Vinyl  pickup   537.00
5000  4x4           Matte White Vinyl  pickup   2585.00
1     2x6           Matte White Vinyl  pickup   25.38
25    2x6           Matte White Vinyl  pickup   34.60
100   2x6           Matte White Vinyl  pickup   63.40
500   2x6           Matte White Vinyl  pickup   217.00
1000  2x6           Matte White Vinyl  pickup   409.00
5000  2x6           Matte White Vinyl  pickup   1945.00
1     6x2           Matte White Vinyl  pickup   25.38
25    6x2           Matte White Vinyl  pickup   34.60
100   6x2           Matte White Vinyl  pickup   63.40
500   6x2           Matte White Vinyl  pickup   217.00
1000  6x2           Matte White Vinyl  pickup   409.00
5000  6x2           Matte White Vinyl  pickup   1945.00
1     3.375x3.375   Matte White Vinyl  pickup   25.36
25    3.375x3.375   Matte White Vinyl  pickup   34.11
100   3.375x3.375   Matte White Vinyl  pickup   61.45
500   3.375x3.375   Matte White Vinyl  pickup   207.25
1000  3.375x3.375   Matte White Vinyl  pickup   389.50
5000  3.375x3.375   Matte White Vinyl  pickup   1847.50
1     0.5x0.5       Matte White Vinyl  pickup   25.01
25    0.5x0.5       Matte White Vinyl  pickup   25.20
100   0.5x0.5       Matte White Vinyl  pickup   25.80
500   0.5x0.5       Matte White Vinyl  pickup   29.00
1000  0.5x0.5       Matte White Vinyl  pickup   33.00
5000  0.5x0.5       Matte White Vinyl  pickup   65.00
1     1x1           Chrome             pickup   25.05
25    1x1           Chrome             pickup   26.28
100   1x1           Chrome             pickup   30.12
500   1x1           Chrome             pickup   50.60
1000  1x1           Chrome             pickup   76.20
5000  1x1           Chrome             pickup   281.00
1     2x2           Chrome             pickup   25.20
25    2x2           Chrome             pickup   30.12
100   2x2           Chrome             pickup   45.48
500   2x2           Chrome             pickup   127.40
1000  2x2           Chrome             pickup   229.80
5000  2x2           Chrome             pickup   1049.00
1     3x3           Chrome             pickup   25.46
25    3x3           Chrome             pickup   36.52
100   3x3           Chrome             pickup   71.08
500   3x3           Chrome             pickup   255.40
1000  3x3           Chrome             pickup   485.80
5000  3x3           Chrome             pickup   2329.00
1     4x4           Chrome             pickup   25.82
25    4x4           Chrome             pickup   45.48
100   4x4           Chrome             pickup   106.92
500   4x4           Chrome             pickup   434.60
1000  4x4           Chrome             pickup   844.20
5000  4x4           Chrome             pickup   4121.00
1     2x6           Chrome             pickup   25.61
25    2x6           Chrome             pickup   40.36
100   2x6           Chrome             pickup   86.44
500   2x6           Chrome             pickup   332.20
1000  2x6           Chrome             pickup   639.40
5000  2x6           Chrome             pickup   3097.00
1     6x2           Chrome             pickup   25.61
25    6x2           Chrome             pickup   40.36
100   6x2           Chrome             pickup   86.44
500   6x2           Chrome             pickup   332.20
1000  6x2           Chrome             pickup   639.40
5000  6x2           Chrome             pickup   3097.00
1     3.375x3.375   Chrome             pickup   25.58
25    3.375x3.375   Chrome             pickup   39.58
100   3.375x3.375   Chrome             pickup   83.32
500   3.375x3.375   Chrome             pickup   316.60
1000  3.375x3.375   Chrome             pickup   608.20
5000  3.375x3.375   Chrome             pickup   2941.00
1     0.5x0.5       Chrome             pickup   25.01
25    0.5x0.5       Chrome             pickup   25.32
100   0.5x0.5       Chrome             pickup   26.28
500   0.5x0.5       Chrome             pickup   31.40
1000  0.5x0.5       Chrome             pickup   37.80
5000  0.5x0.5       Chrome             pickup   89.00
1     1x1           Holographic        pickup   25.05
25    1x1           Holographic        pickup   26.28
100   1x1           Holographic        pickup   30.12
500   1x1           Holographic        pickup   50.60
1000  1x1           Holographic        pickup   76.20
5000  1x1           Holographic        pickup   281.00
1     2x2           Holographic        pickup   25.20
25    2x2           Holographic        pickup   30.12
100   2x2           Holographic        pickup   45.48
500   2x2           Holographic        pickup   127.40
1000  2x2           Holographic        pickup   229.80
5000  2x2           Holographic        pickup   1049.00
1     3x3           Holographic        pickup   25.46
25    3x3           Holographic        pickup   36.52
100   3x3           Holographic        pickup   71.08
500   3x3           Holographic        pickup   255.40
1000  3x3           Holographic        pickup   485.80
5000  3x3           Holographic        pickup   2329.00
1     4x4           Holographic        pickup   25.82
25    4x4           Holographic        pickup   45.48
100   4x4           Holographic        pickup   106.92
500   4x4           Holographic        pickup   434.60
1000  4x4           Holographic        pickup   844.20
5000  4x4           Holographic        pickup   4121.00
1     2x6           Holographic        pickup   25.61
25    2x6           Holographic        pickup   40.36
100   2x6           Holographic        pickup   86.44
500   2x6           Holographic        pickup   332.20
1000  2x6           Holographic        pickup   639.40
5000  2x6           Holographic        pickup   3097.00
1     6x2           Holographic        pickup   25.61
25    6x2           Holographic        pickup   40.36
100   6x2           Holographic        pickup   86.44
500   6x2           Holographic        pickup   332.20
1000  6x2           Holographic        pickup   639.40
5000  6x2           Holographic        pickup   3097.00
1     3.375x3.375   Holographic        pickup   25.58
25    3.375x3.375   Holographic        pickup   39.58
100   3.375x3.375   Holographic        pickup   83.32
500   3.375x3.375   Holographic        pickup   316.60
1000  3.375x3.375   Holographic        pickup   608.20
5000  3.375x3.375   Holographic        pickup   2941.00
1     0.5x0.5       Holographic        pickup   25.01
25    0.5x0.5       Holographic        pickup   25.32
100   0.5x0.5       Holographic        pickup   26.28
500   0.5x0.5       Holographic        pickup   31.40
1000  0.5x0.5       Holographic        pickup   37.80
5000  0.5x0.5       Holographic        pickup   89.00
100   3x3           Gloss White Vinyl  pickup   95.10   x2 designs
100   3x3           Gloss White Vinyl  ship     107.10   x2 designs
100   3x3           Gloss White Vinyl  pickup   136.40   x3 designs
100   3x3           Gloss White Vinyl  ship     148.40   x3 designs
100   3x3           Gloss White Vinyl  pickup   219.00   x5 designs
100   3x3           Gloss White Vinyl  ship     231.00   x5 designs
100   3x3           Gloss White Vinyl  ship     65.80
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
   * Verified outside this repo, so they check the sheet rather than each
   * other. If one of these moves, the sheet is wrong, not the anchor.
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

  test("the three-design cart price agreed with the shop", () => {
    // CART-PLAN.md: $197.40 as three separate orders, $173.40 at $25 per
    // design, $148.40 as agreed. The cart is a deliberate price cut.
    assert.equal(find(100, 3, 3, "ship", 3)?.total, 148.4);
  });

  test("the order reconciled against a real Printavo invoice", () => {
    // 15 Aug, three designs, local pickup. $144.93 was actually charged,
    // which is this figure plus MA 6.25% on goods and setup.
    const goods = find(100, 3, 3, "pickup", 3)?.total;

    assert.equal(goods, 136.4);
    assert.equal(Math.round((goods as number) * 1.0625 * 100) / 100, 144.93);
  });

  test("the prices the missing floor allows, as documented", () => {
    // lib/pricing.ts says these out loud: with no minimum price, small sizes
    // at high quantities go very low, and self-checkout would charge them.
    // Kept visible rather than buried so the day the shop wants a floor,
    // the cost of not having one is already written down.
    assert.equal(find(5000, 1, 1, "pickup")?.total, 185);
    assert.equal(find(5000, 0.5, 0.5, "pickup")?.total, 65);
  });
});
