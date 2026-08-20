import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BORDER_AT_FULL_MARGIN,
  PREVIEW_CARD_PX,
  getBorderPx,
} from "../lib/die-cut";

/**
 * The die-cut border width, which three places needed and each worked out for
 * itself:
 *
 *   StickerShape, to DRAW the border on screen
 *   StickerShape again, to QUOTE it to the customer in inches
 *   sticker-proof, to draw it on the proof the shop is emailed
 *
 * The first two rounded to whole pixels; the third did not. So the emailed
 * proof drew a border that was not the width the customer had been quoted.
 * lib/die-cut.ts opens by insisting the two renderers cannot differ — a third
 * copy of the rule is how they come to.
 */

/** Every value the slider can actually produce: min 0, max 100, step 5. */
const REACHABLE = Array.from({ length: 21 }, (_, i) => i * 5);

describe("one rule, whatever the stage size", () => {
  it("gives the preview whole pixels", () => {
    for (const margin of REACHABLE) {
      const px = getBorderPx(margin);

      assert.equal(
        px,
        Math.round(px),
        `margin ${margin} produced ${px} on the preview card`
      );
    }
  });

  it("scales a larger stage by exactly the stage ratio", () => {
    // The proof stage is bigger than the preview card, so the same margin has
    // to grow with it or the emailed proof shows a thinner edge.
    for (const margin of REACHABLE) {
      const preview = getBorderPx(margin);

      for (const stage of [512, 1024, 1536]) {
        assert.equal(
          getBorderPx(margin, stage),
          preview * (stage / PREVIEW_CARD_PX),
          `margin ${margin} disagreed at stage ${stage}`
        );
      }
    }
  });

  it("draws the same RELATIVE border at every stage size", () => {
    // What the customer actually sees is the border as a fraction of the
    // sticker, and that must not depend on which canvas drew it.
    for (const margin of REACHABLE) {
      const previewShare = getBorderPx(margin) / PREVIEW_CARD_PX;

      for (const stage of [512, 1024]) {
        assert.equal(getBorderPx(margin, stage) / stage, previewShare);
      }
    }
  });

  it("is the unrounded proof formula only where the two happen to agree", () => {
    // The old proof code used (margin / 100) * 16 with no rounding. Naming the
    // margins where that differed keeps the reason for this file concrete.
    const disagreed = REACHABLE.filter(
      (margin) => getBorderPx(margin) !== (margin / 100) * BORDER_AT_FULL_MARGIN
    );

    assert.deepEqual(
      disagreed,
      [5, 10, 15, 20, 30, 35, 40, 45, 55, 60, 65, 70, 80, 85, 90, 95],
      "the set of margins where rounding matters changed"
    );
  });
});

describe("the ends and the nonsense", () => {
  it("has no border at zero margin", () => {
    assert.equal(getBorderPx(0), 0);
    assert.equal(getBorderPx(0, 4096), 0);
  });

  it("is the full border at 100", () => {
    assert.equal(getBorderPx(100), BORDER_AT_FULL_MARGIN);
  });

  it("clamps out-of-range margins rather than drawing nonsense", () => {
    assert.equal(getBorderPx(-40), 0);
    assert.equal(getBorderPx(400), BORDER_AT_FULL_MARGIN);
  });

  it("treats a missing or unusable margin as no border", () => {
    for (const value of [NaN, undefined, null, "" as unknown as number]) {
      assert.equal(getBorderPx(value as number), 0);
    }
  });
});
