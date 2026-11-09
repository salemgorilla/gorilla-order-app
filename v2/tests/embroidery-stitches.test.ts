/**
 * The stitch-count ESTIMATE from a logo's size and how busy it is.
 *
 * It is the fallback and the sanity bound for the image-reading agent, and the
 * worked examples are pinned so that calibrating a constant is a visible change.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EMBROIDERY_COMPLEXITIES,
  EMBROIDERY_PLACEMENTS,
  MIN_STITCHES,
  estimateStitches,
  embroideryPlacementById,
} from "../lib/embroidery";

const est = (placementId: string, widthInches: number, heightInches: number, complexity: string) =>
  estimateStitches({ placementId, widthInches, heightInches, complexity } as never);

describe("worked examples", () => {
  test("a 3.5 x 2 in left chest logo, by how busy it is", () => {
    // 7 sq in x coverage x 1,800 x 1.1, to the nearest hundred.
    assert.deepEqual(est("left-chest", 3.5, 2, "light"), { ok: true, stitches: 3500, low: 2800, high: 4400 });
    assert.deepEqual(est("left-chest", 3.5, 2, "medium"), { ok: true, stitches: 6900, low: 5500, high: 8600 });
    assert.deepEqual(est("left-chest", 3.5, 2, "dense"), { ok: true, stitches: 11800, low: 9400, high: 14800 });
  });

  test("a medium cap front lands in the usual range", () => {
    const e = est("cap-front", 4, 2, "medium");
    assert.ok(e.ok && e.stitches >= 7000 && e.stitches <= 9000);
  });

  test("a tiny design is floored, not priced as nothing", () => {
    const e = est("cap-side-back", 0.5, 0.5, "light");
    assert.ok(e.ok && e.stitches === MIN_STITCHES && e.low === MIN_STITCHES);
  });

  test("more area or more coverage means more stitches", () => {
    const small = est("other", 3, 3, "medium");
    const big = est("other", 6, 6, "medium");
    const dense = est("other", 3, 3, "dense");
    assert.ok(small.ok && big.ok && dense.ok);
    if (small.ok && big.ok && dense.ok) {
      assert.ok(big.stitches > small.stitches);
      assert.ok(dense.stitches > small.stitches);
    }
  });
});

describe("refusals", () => {
  test("a logo bigger than its placement takes is refused, never shrunk", () => {
    const e = est("left-chest", 6, 6, "medium");
    assert.equal(e.ok, false);
    assert.match(e.ok ? "" : e.reason, /Left chest takes up to 4\.5" x 4\.5"/);
  });

  test("nonsense sizes are refused", () => {
    for (const [w, h] of [[0, 2], [2, 0], [-1, 2], [Number.NaN, 2], [2, Number.POSITIVE_INFINITY]] as const) {
      assert.equal(est("left-chest", w, h, "medium").ok, false, `${w}x${h}`);
    }
  });

  test("an unknown placement or complexity is refused", () => {
    assert.equal(est("forehead", 2, 2, "medium").ok, false);
    assert.equal(est("left-chest", 2, 2, "extreme").ok, false);
  });
});

describe("the catalogue", () => {
  test("covers what Gabe asked for: left chest, caps, sleeve and other", () => {
    assert.deepEqual(
      EMBROIDERY_PLACEMENTS.map((p) => p.id),
      ["left-chest", "cap-front", "cap-side-back", "sleeve", "other"]
    );
  });

  test("every default size fits its own placement", () => {
    for (const p of EMBROIDERY_PLACEMENTS) {
      assert.ok(p.defaultWidthInches <= p.maxWidthInches && p.defaultHeightInches <= p.maxHeightInches, p.id);
      assert.ok(embroideryPlacementById(p.id));
    }
  });

  test("coverage rises light to dense", () => {
    const coverages = EMBROIDERY_COMPLEXITIES.map((c) => c.coverage);
    assert.deepEqual([...coverages].sort((a, b) => a - b), coverages);
    assert.ok(coverages.every((c) => c > 0 && c <= 1));
  });
});
