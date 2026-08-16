import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ART_SCALE_CEILING,
  clampArtScaleToShape,
  getBleedThreshold,
  getSafeAreaFactor,
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
