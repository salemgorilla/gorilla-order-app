/**
 * THE VOLUME BREAK, PUT BACK.
 *
 * Gabe, 2026-09-11, twice: "There was already a volume break with how the
 * pricing went. If you are increasing the pricing across the board, those
 * discounts should still be active."
 *
 * The formula's only discount was the setup fee amortising, and that is
 * spent by about 500 pieces. The v1 site's own table kept discounting all
 * the way to 5,000. This restores that SHAPE, re-anchored so 100 x 3" still
 * comes to the $85 the re-rate was sized to.
 *
 * Two properties matter more than any figure, and the second is the one a
 * quantity table always gets wrong: more stickers must never cost less in
 * total, and a sticker must never get dearer because you bought one more.
 * Both are swept over every quantity from 1 to 6,000 — not sampled — because
 * a cliff lives at exactly one number and a sample walks past it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  STICKER_SETUP_FEE,
  STICKER_VOLUME_TIERS,
  getStickerMaterialPrice,
  getStickerPrice,
  stickerVolumeKeep,
} from "../lib/pricing";

const VINYL = "Gloss White Vinyl";
const THREE = { widthInches: 3, heightInches: 3 };
const total = (q: number, dims = THREE) => getStickerPrice(q, VINYL, "gloss", "", dims);

describe("the shape is the old site's — every size of it", () => {
  /**
   * data/sticker-pricing.js, the v1 site, re-anchored so 3x3 at 100 is $85
   * (a factor of 85/41). Four sizes, six quantities. The rule is "at or
   * above, with the least overshoot" — Gabe, 2026-09-12: margins "where
   * they need to be or higher". A single-curve discount could only hold one
   * size; this holds all four.
   */
  const V1: Record<number, Record<number, number>> = {
    4: { 100: 34, 250: 58, 500: 95, 1000: 168, 2500: 365, 5000: 650 },
    9: { 100: 41, 250: 72, 500: 116, 1000: 198, 2500: 445, 5000: 795 },
    16: { 100: 54, 250: 92, 500: 148, 1000: 255, 2500: 585, 5000: 1040 },
    25: { 100: 69, 250: 118, 500: 190, 1000: 325, 2500: 760, 5000: 1375 },
  };
  const F = 85 / 41;
  const side: Record<number, number> = { 4: 2, 9: 3, 16: 4, 25: 5 };

  test("at every tier from 250 up, every v1 size prices at or above the old table", () => {
    for (const q of [250, 500, 1000, 2500, 5000]) {
      for (const area of [4, 9, 16, 25]) {
        const w = side[area];
        const ours = total(q, { widthInches: w, heightInches: w });
        const theirs = V1[area][q] * F;
        const ratio = ours / theirs;

        assert.ok(ratio >= 0.995, `${w}x${w} x ${q}: $${ours.toFixed(0)} is under the old table's $${theirs.toFixed(0)}`);
        assert.ok(ratio <= 1.06, `${w}x${w} x ${q}: $${ours.toFixed(0)} overshoots the old table's $${theirs.toFixed(0)} by more than 6%`);
      }
    }
  });

  test("100 x 3\" is still exactly $85 — the anchor, and the first tier is (1, 1)", () => {
    assert.equal(total(100), 85);
    assert.deepEqual(stickerVolumeKeep(100), { piece: 1, area: 1 });
  });

  test("at 100 the other sizes are where the hand-quote calibration put them", () => {
    // Fixed by the $85 anchor, not by the old table: 2x2 sits 10% under it
    // and 5x5 5% over, which is the shape Gabe approved when he chose the
    // per-sticker term. The curves start at 250.
    assert.equal(total(100, { widthInches: 2, heightInches: 2 }), 65);
  });

  test("below 100 nothing changes — the setup fee already discounts harder than v1 did there", () => {
    for (const q of [1, 10, 25, 50, 99]) {
      assert.deepEqual(stickerVolumeKeep(q), { piece: 1, area: 1 }, String(q));
    }
  });

  test("both curves only ever go down", () => {
    let prev = stickerVolumeKeep(1);
    for (let q = 2; q <= 6000; q += 1) {
      const now = stickerVolumeKeep(q);
      assert.ok(now.piece <= prev.piece + 1e-12 && now.area <= prev.area + 1e-12, `${q}`);
      prev = now;
    }
  });

  test("above the last tier the discount holds rather than deepening forever", () => {
    const last = STICKER_VOLUME_TIERS[STICKER_VOLUME_TIERS.length - 1];

    assert.deepEqual(stickerVolumeKeep(last.at), { piece: last.piece, area: last.area });
    assert.deepEqual(stickerVolumeKeep(last.at * 4), { piece: last.piece, area: last.area });
  });
});

describe("no cliffs, at any quantity", () => {
  // Every quantity, not a sample. A cliff lives at exactly one number.
  const sweep = Array.from({ length: 6000 }, (_, i) => i + 1);

  test("one more sticker never lowers the total by more than a fourth-decimal step is worth", () => {
    /**
     * Not strictly increasing, and it cannot be — and the bound is bigger
     * than "a cent or two", which is what this comment said before the
     * sweep was run.
     *
     * Printavo stores the unit price to FOUR decimals and multiplies, so
     * the app quantises the unit the same way before it prices
     * (getStickerUnitMaterialPrice). The volume curve slides the unit down
     * continuously, so every so often it crosses a fourth-decimal boundary
     * and drops by 0.0001. That drop is paid on EVERY sticker in the run:
     * one more piece adds one unit price and subtracts 0.0001 x quantity.
     * Above quantity = 10,000 x unit the subtraction wins. For a 1" sticker
     * at $0.036 that is 360 pieces; measured, the worst case is 4,940
     * one-inch stickers costing 46 cents MORE than 4,941.
     *
     * There is no fix that is not worse. A unit that never slides is a
     * stepped table, and a step at 250 moves dollars, not cents — the
     * cliff tests/pricing-invariants exists to stop. Printavo has no fifth
     * decimal to give. So the bound held here is the true one, 0.0001 x
     * quantity, and a real cliff still fails it by an order of magnitude.
     */
    for (const dims of [THREE, { widthInches: 1, heightInches: 1 }, { widthInches: 4, heightInches: 6 }]) {
      let previous = total(1, dims);

      for (const q of sweep.slice(1)) {
        const now = total(q, dims);
        assert.ok(
          now >= previous - (0.0001 * q + 0.01),
          `${dims.widthInches}x${dims.heightInches}: ${q} stickers ($${now}) cost less than ${q - 1} ($${previous})`
        );
        previous = now;
      }
    }
  });

  test("and over any hundred-sticker stretch it rises, always", () => {
    // The wobble above is a one-piece artefact. A hundred more stickers is
    // real money at every size — at least $3.60 even for a 1" — and no run
    // of fourth-decimal steps inside a hundred pieces can add up to that.
    for (const dims of [THREE, { widthInches: 1, heightInches: 1 }]) {
      for (const q of sweep.slice(0, -100)) {
        assert.ok(total(q + 100, dims) > total(q, dims), `${dims.widthInches}": ${q} -> ${q + 100} did not rise`);
      }
    }
  });

  test("the per-sticker price never rises when one more sticker is added", () => {
    // Rounding to the cent on the material line can nudge the each by a
    // hair at the boundary; a tolerance of a tenth of a cent lets that
    // through and still catches a real step.
    let previous = total(1) / 1;

    for (const q of sweep.slice(1)) {
      const each = total(q) / q;
      assert.ok(each <= previous + 0.001, `${q}: $${each.toFixed(4)} each, up from $${previous.toFixed(4)}`);
      previous = each;
    }
  });

  test("the tier boundaries themselves are smooth, not steps", () => {
    for (const { at } of STICKER_VOLUME_TIERS) {
      const below = total(at - 1);
      const on = total(at);
      const above = total(at + 1);

      assert.ok(below < on && on < above, `step at ${at}: ${below} / ${on} / ${above}`);
    }
  });
});

describe("what it applies to, and what it leaves alone", () => {
  test("material only — setup is labour and does not get cheaper by the roll", () => {
    // 1,000 x 3": (0.34 x 0.80 + 9 x 0.04 x 0.39) x 1000 = $412.40, setup untouched.
    assert.equal(getStickerMaterialPrice(1000, VINYL, "", THREE), 412.4);
    assert.equal(total(1000), 412.4 + STICKER_SETUP_FEE);
  });

  test("premium material is discounted on the same curve, then marked up", () => {
    const plain = getStickerMaterialPrice(1000, VINYL, "", THREE);
    const chrome = getStickerMaterialPrice(1000, "Chrome", "", THREE);

    // +30%, the old site's own chrome rate, restored 2026-09-12.
    assert.equal(Math.round((chrome / plain) * 100) / 100, 1.3);
  });

  test("each design in a cart discounts on its own count", () => {
    // 100 of one design and 900 of another is not 1,000 of either. The
    // material function is per design and takes that design's quantity —
    // which is also what actually comes off the roll.
    const small = getStickerMaterialPrice(100, VINYL, "", THREE);
    const large = getStickerMaterialPrice(900, VINYL, "", THREE);

    assert.equal(small, 70);
    assert.ok(large < 9 * small, "the 900-piece design got no discount");
    assert.ok(large > getStickerMaterialPrice(1000, VINYL, "", THREE) * 0.9);
  });
});
