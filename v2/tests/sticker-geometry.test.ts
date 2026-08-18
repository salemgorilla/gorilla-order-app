import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ART_SCALE_CEILING,
  clampArtScaleToShape,
  getArtDrawSize,
  getBleedThreshold,
  getSafeAreaFactor,
  getStickerCard,
} from "../lib/sticker-geometry";

/**
 * Where the blade is, per shape.
 *
 * The slider ran 40–150 on every shape while the point where art reaches the
 * cut is shape-dependent — and the preview clipped the overflow, so a customer
 * on square corners could sit 46 points past the blade looking at a proof that
 * showed a sticker that fit. "Square corners picking out of a round sticker"
 * was this.
 *
 * These numbers ARE the feature, which is why they are derived from the safe
 * area rather than typed in, and why they are tested.
 */

const SHAPES = ["Circle", "Oval", "Rounded Corners", "Square Corners"];

describe("the threshold is the scale where art reaches the cut", () => {
  test("each shape gets its real number", () => {
    assert.equal(getBleedThreshold("Circle"), 141);
    assert.equal(getBleedThreshold("Oval"), 141);
    assert.equal(getBleedThreshold("Rounded Corners"), 113);
    assert.equal(getBleedThreshold("Square Corners"), 104);
  });

  test("the threshold is derived from the safe area, not typed in", () => {
    // The property that makes the two incapable of disagreeing. If someone
    // ever does tune a safe-area factor, the cap follows it automatically.
    for (const shape of SHAPES) {
      assert.equal(
        getBleedThreshold(shape),
        Math.floor(100 / getSafeAreaFactor(shape)),
        `${shape} threshold drifted from its safe-area factor`
      );
    }
  });

  test("it never rounds UP past the blade", () => {
    /**
     * Floor, not round. 100/0.88 is 113.6 — rounding gives 114, which is a
     * scale where art is already over the edge. The error has a safe
     * direction and this is it.
     */
    for (const shape of SHAPES) {
      const factor = getSafeAreaFactor(shape);
      assert.ok(
        getBleedThreshold(shape) / 100 <= 1 / factor,
        `${shape} allows art past its own cut edge`
      );
    }
  });

  test("an unknown shape falls back to the tightest safe area", () => {
    // Square is the least forgiving, so an unrecognised shape is capped
    // hardest rather than let through at 150.
    assert.equal(getBleedThreshold("Something New"), 104);
  });

  test("Die Cut has no edge to cross, so it is not capped", () => {
    // The contour is generated FROM the art — there is no fixed outline to
    // overflow, which is why getStickerGeometry reports border width for it
    // and no art dimension at all.
    assert.equal(getBleedThreshold("Die Cut"), ART_SCALE_CEILING);
  });
});

describe("switching shape cannot strand art past the blade", () => {
  test("a circle at 141 is pulled back when the shape becomes square", () => {
    /**
     * The bug this feature would otherwise have shipped with. 141 is legal on
     * a circle and 37 points over the edge on square corners — and the slider
     * could not even represent it, so the customer would see a control pinned
     * at its maximum while the art sat past the cut.
     */
    assert.equal(clampArtScaleToShape("Square Corners", 141, false), 104);
  });

  test("every shape-to-shape move lands inside the new shape's range", () => {
    for (const from of SHAPES) {
      for (const to of SHAPES) {
        const atMax = getBleedThreshold(from);
        const clamped = clampArtScaleToShape(to, atMax, false);

        assert.ok(
          clamped <= getBleedThreshold(to),
          `${from} at ${atMax}% survived the move to ${to} as ${clamped}%`
        );
      }
    }
  });

  test("a scale already inside range is left alone", () => {
    // Clamping must not quietly shrink art the customer had set legally.
    assert.equal(clampArtScaleToShape("Circle", 80, false), 80);
    assert.equal(clampArtScaleToShape("Square Corners", 100, false), 100);
  });

  test("with bleed on, the full ceiling is reachable again", () => {
    // Bleed is a real thing people want. The problem was never that it was
    // possible — it was that it was invisible.
    assert.equal(clampArtScaleToShape("Square Corners", 150, true), 150);
    assert.equal(clampArtScaleToShape("Circle", 150, true), 150);
  });

  test("turning bleed OFF pulls an out-of-range scale back down", () => {
    // Otherwise the slider sits past its own max holding a value it cannot
    // display, and the art is over the cut with nothing showing it.
    assert.equal(clampArtScaleToShape("Circle", 150, false), 141);
    assert.equal(clampArtScaleToShape("Rounded Corners", 150, false), 113);
  });
});

describe("the safe-area factors themselves are untouched", () => {
  test("they are exactly what the preview and the proof have always used", () => {
    // This spec reads them; it does not tune them. They are what keeps square
    // art off the corners at ordinary sizes, and the canvas proof the shop
    // cuts from now reads this same function.
    assert.equal(getSafeAreaFactor("Circle"), 0.707);
    assert.equal(getSafeAreaFactor("Oval"), 0.707);
    assert.equal(getSafeAreaFactor("Rounded Corners"), 0.88);
    assert.equal(getSafeAreaFactor("Square Corners"), 0.96);
  });
});

/**
 * The card, and the art inside it.
 *
 * ── WHAT WENT WRONG ───────────────────────────────────────────────────────
 * The rule "the card takes the sticker's real proportions" had two copies —
 * the shaped branch of StickerShape, and lib/sticker-proof.ts — and the
 * die-cut preview had NEITHER. It was handed a flat 256px square and drew
 * every die cut as though it were square.
 *
 * Measured in Chromium through the real compositor, with a square logo:
 *
 *   sticker    preview art / proof art   (1.00 = the two agree)
 *   3" x 3"    1.00                      <- square, so it looked fine
 *   4" x 2"    2.00
 *   1" x 3"    2.84
 *   4" x 1"    3.79
 *
 * A customer ordering a 4" x 1" die cut approved a picture showing their art
 * nearly four times larger, relative to the sticker, than the proof the shop
 * cuts from. Square stickers agreed exactly, which is why it survived.
 *
 * The border was never wrong: it scales against the LONGEST side, which is
 * what getStickerGeometry is passed (`longestInches`) to produce the inch
 * figure printed beside the slider. Changing that would have broken the
 * agreement between the border drawn and the border quoted.
 * ──────────────────────────────────────────────────────────────────────────
 */
describe("the card carries the sticker's real proportions", () => {
  test("a square sticker is a square card", () => {
    assert.deepEqual(getStickerCard(3, 3, 256), { cardW: 256, cardH: 256 });
  });

  test("the long side always fills the box", () => {
    assert.deepEqual(getStickerCard(4, 2, 256), { cardW: 256, cardH: 128 });
    assert.deepEqual(getStickerCard(2, 6, 256), { cardW: 256 / 3, cardH: 256 });
  });

  test("the preview and the proof describe the same rectangle", () => {
    // 256 on the card, 720 on the proof stage. Same shape, different
    // magnification — that is the whole invariant.
    const preview = getStickerCard(4, 1, 256);
    const proof = getStickerCard(4, 1, 720);

    assert.equal(preview.cardW / preview.cardH, proof.cardW / proof.cardH);
    assert.equal(proof.cardW / preview.cardW, 720 / 256);
  });

  test("no dimensions falls back to a square", () => {
    // A preset size or a form nobody has filled in yet. This is what those
    // rendered as before dimensions existed, and must keep rendering as.
    assert.deepEqual(getStickerCard(0, 0, 256), { cardW: 256, cardH: 256 });
  });
});

describe("art is fitted to the tight axis", () => {
  const square = { artWidth: 100, artHeight: 100 };

  test("a square logo on a wide sticker is limited by the height", () => {
    // THE BUG, as a number. The die-cut preview used to fit against a square
    // and would have drawn 256; the sticker is only a quarter as tall as it
    // is wide, so 64 is what can actually be cut.
    const { cardW, cardH } = getStickerCard(4, 1, 256);
    const { drawW, drawH } = getArtDrawSize({
      cardW,
      cardH,
      ...square,
      scalePercent: 100,
    });

    assert.equal(drawH, 64);
    assert.equal(drawW, 64);
  });

  test("and by the width on a tall sticker", () => {
    const { cardW, cardH } = getStickerCard(1, 4, 256);
    const { drawW } = getArtDrawSize({
      cardW,
      cardH,
      ...square,
      scalePercent: 100,
    });

    assert.equal(drawW, 64);
  });

  test("the art keeps its own aspect ratio", () => {
    // Fitted, not stretched. A 2:1 logo stays 2:1.
    const { drawW, drawH } = getArtDrawSize({
      cardW: 256,
      cardH: 256,
      artWidth: 200,
      artHeight: 100,
      scalePercent: 100,
    });

    assert.equal(drawW / drawH, 2);
  });

  test("the safe-area factor holds art off a round cut", () => {
    // Die cut passes no factor — its contour is generated FROM the art, so
    // there is no fixed outline to stay clear of.
    const plain = getArtDrawSize({ cardW: 256, cardH: 256, ...square, scalePercent: 100 });
    const circle = getArtDrawSize({
      cardW: 256,
      cardH: 256,
      ...square,
      scalePercent: 100,
      safeAreaFactor: getSafeAreaFactor("Circle"),
    });

    assert.equal(circle.drawW, plain.drawW * getSafeAreaFactor("Circle"));
  });

  test("the slider's range is enforced here, not by each caller", () => {
    // The proof clamped this itself and the preview clamped upstream. Two
    // copies of one bound, and extracting the fit nearly dropped one.
    const base = { cardW: 256, cardH: 256, ...square };

    assert.equal(
      getArtDrawSize({ ...base, scalePercent: 5 }).drawW,
      getArtDrawSize({ ...base, scalePercent: 20 }).drawW
    );

    assert.equal(
      getArtDrawSize({ ...base, scalePercent: 900 }).drawW,
      getArtDrawSize({ ...base, scalePercent: ART_SCALE_CEILING }).drawW
    );
  });
});
