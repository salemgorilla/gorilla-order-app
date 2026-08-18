import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isTotalErasure, MAX_REMOVED_SHARE } from "../lib/background-removal";

/**
 * The knockout must not hand back a blank file.
 *
 * ── WHAT WAS HAPPENING ────────────────────────────────────────────────────
 * removeBackground floods inward from the border through anything within
 * HARD_TOLERANCE of the border colour. When the DESIGN is also within that
 * tolerance the fill runs straight through it, and the file comes back
 * completely transparent — returned as a SUCCESS.
 *
 * Measured in Chromium on constructed files, before the guard:
 *
 *   #f0f0f0 logo on #ffffff .... 100% removed, 0% artwork left
 *   cream logo on ivory ........ 100% removed, 0% artwork left
 *   a solid white image ........ 100% removed, 0% artwork left
 *   black logo on white ........  75% removed, 25% left   (correct)
 *
 * "Cream off ivory" is the case the header of background-removal.ts offers
 * as proof the matting is scale-free. The matting is. The fill that runs
 * first is not, and it eats the design before the matting ever sees it.
 *
 * The customer ticked the box, saw a blank preview, and that blank PNG became
 * the artwork the shop received. There was a guard for removing NOTHING and
 * none for removing EVERYTHING. `removedShare` was computed, returned and
 * typed for precisely this, and read by nobody.
 *
 * removeBackground needs a canvas, so it cannot run here — which is how this
 * survived. The RULE is extracted so it can.
 * ──────────────────────────────────────────────────────────────────────────
 */

describe("erasing the artwork is not removing the background", () => {
  test("a file the fill took entirely is refused", () => {
    assert.equal(isTotalErasure(1000, 1000), true);
  });

  test("the three cases measured in a browser would all be refused", () => {
    // All three came back 100% removed. Expressed as pixels so the numbers
    // are the ones the function actually sees.
    const total = 120 * 120;
    for (const label of ["#f0f0f0 on white", "cream on ivory", "solid white"]) {
      assert.equal(isTotalErasure(total, total), true, label);
    }
  });

  test("an ordinary knockout is untouched", () => {
    // Black logo on white: 75% removed, 25% of the file is the design.
    assert.equal(isTotalErasure(10800, 14400), false);
  });

  test("a hairline design survives", () => {
    /**
     * THE REGRESSION THIS THRESHOLD RISKS. A 1px cross on a 120px canvas is
     * 1.66% of it — measured at 98.3% removed in the same browser run — and
     * it is a perfectly good sticker. A tighter bound would refuse real
     * artwork, which is worse than the bug: the customer is told no for a
     * file that would have worked.
     */
    assert.equal(isTotalErasure(14161, 14400), false);
  });

  test("the threshold sits between those two", () => {
    assert.ok(MAX_REMOVED_SHARE > 0.983, "would refuse a hairline design");
    assert.ok(MAX_REMOVED_SHARE < 1, "would never fire at all");
  });

  test("an empty image is not an erasure", () => {
    // Guarding against a divide-by-zero reporting every zero-size image as a
    // failed knockout. There is a separate reason for a file we cannot read.
    assert.equal(isTotalErasure(0, 0), false);
  });

  test("removing nothing is not an erasure either", () => {
    // That end already had its own guard and its own message; this must not
    // start claiming those files too.
    assert.equal(isTotalErasure(0, 14400), false);
  });
});

describe("the customer is told what actually happened", () => {
  /**
   * A new failure reason with no copy falls through to "Something went wrong
   * removing the background", which gives somebody whose logo is nearly the
   * colour of its background nothing to act on — and no reason to believe
   * sending the file as-is will work.
   *
   * app/page.tsx has no test harness, so this reads the source. Weaker than
   * running it, and better than the reason existing with no message.
   */
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  test("removed-everything has its own message", () => {
    assert.ok(
      page.includes('result.reason === "removed-everything"'),
      "no branch for removed-everything — it would fall through to the generic message"
    );
  });

  test("and the message says why, and what to do next", () => {
    const start = page.indexOf('result.reason === "removed-everything"');
    const copy = page.slice(start, start + 400);

    // Why: the design and the background are the same colour.
    assert.match(copy, /close in colour/i);
    // What next: the shop will do it by hand. Never a dead end.
    assert.match(copy, /by hand/i);
  });
});
