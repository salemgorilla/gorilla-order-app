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
  stickerVolumeMultiplier,
} from "../lib/pricing";

const VINYL = "Gloss White Vinyl";
const THREE = { widthInches: 3, heightInches: 3 };
const total = (q: number, dims = THREE) => getStickerPrice(q, VINYL, "gloss", "", dims);

describe("the shape is the old site's", () => {
  test("the tiers are the v1 3x3 column, re-anchored to $85 at 100", () => {
    /**
     * data/sticker-pricing.js, the v1 site: 3x3 each at 50/100/250/500/
     * 1000/2500/5000 = $0.58/$0.41/$0.288/$0.232/$0.198/$0.178/$0.159.
     * Scaled so 100 pays $0.85 each, the all-in totals are the targets
     * below. Within 1% — the tiers are rounded to two places on purpose,
     * because a rate of 0.8177 is a number nobody set.
     */
    const v1Each: Record<number, number> = {
      100: 0.41,
      250: 0.288,
      500: 0.232,
      1000: 0.198,
      2500: 0.178,
      5000: 0.159,
    };

    for (const [qty, each] of Object.entries(v1Each).map(([k, v]) => [Number(k), v])) {
      const target = qty * 0.85 * (each / v1Each[100]);
      const ours = total(qty);
      const drift = Math.abs(ours - target) / target;

      assert.ok(drift < 0.01, `${qty}: $${ours.toFixed(2)} vs v1-anchored $${target.toFixed(2)} (${(drift * 100).toFixed(1)}% off)`);
    }
  });

  test("100 x 3\" is still exactly $85 — the curve starts here, it does not move here", () => {
    assert.equal(total(100), 85);
    assert.equal(stickerVolumeMultiplier(100), 1);
  });

  test("below 100 nothing changes — the setup fee already discounts harder than v1 did there", () => {
    for (const q of [1, 10, 25, 50, 99]) {
      assert.equal(stickerVolumeMultiplier(q), 1, String(q));
    }
  });

  test("above the last tier the discount holds rather than deepening forever", () => {
    const last = STICKER_VOLUME_TIERS[STICKER_VOLUME_TIERS.length - 1];

    assert.equal(stickerVolumeMultiplier(last.at), last.keep);
    assert.equal(stickerVolumeMultiplier(last.at * 4), last.keep);
    assert.equal(stickerVolumeMultiplier(1_000_000), last.keep);
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
    // 1,000 x 3": material 1000 x 9 x (70/900) x 0.56 = $392, setup untouched.
    assert.equal(getStickerMaterialPrice(1000, VINYL, "", THREE), 392);
    assert.equal(total(1000), 392 + STICKER_SETUP_FEE);
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
