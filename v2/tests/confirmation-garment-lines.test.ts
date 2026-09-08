/**
 * THE CONFIRMATION CONFIRMS THE WHOLE CART.
 *
 * Found 2026-09-07, the same day the sticker version of this bug was fixed:
 * the apparel confirmation read `selectedGarmentLabel` and
 * `apparelQuote.quantity` alone, so a cart of 24 tees and 20 hoodies was
 * confirmed back as "44 Basic Tee". For signs and apparel this screen is
 * the customer's ONLY copy of what they sent — there is no email to repeat
 * it in — so it has to list every line, the way the review card and the
 * Printavo invoice do.
 *
 * Source-level, like tests/review-card-truth.test.ts: the component must
 * render the garment lines, and the page must actually hand them over. A
 * prop that exists but is never passed is the same bug with a type.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const confirmation = readFileSync(
  new URL("../features/QuoteConfirmation.tsx", import.meta.url),
  "utf8"
);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

describe("the apparel confirmation lists every garment line", () => {
  test("the component renders the lines, each with its invoice code", () => {
    // The condition was `garmentLines.length > 1` until 8 Sep, when driving
    // the builder showed that test has a hole: a quote whose ONLY priced
    // garment is an added one has one line, and the single-garment branch
    // then describes the configured garment nobody ordered. The rule moved
    // into shouldListGarments so it could be tested as a rule — see
    // tests/per-line-sizes.test.ts — rather than as a string in this file.
    assert.match(confirmation, /listGarments && isApparelSubmitted/);
    assert.match(
      confirmation,
      /const listGarments = shouldListGarments\(garmentLines, apparelQuote\.quantity\)/
    );
    assert.match(confirmation, /garmentLines\.map\(/);
    assert.match(confirmation, /apparelLineSku\(line, index\)/);
  });

  test("the page passes the priced lines to the confirmation screen", () => {
    const screen = page.slice(
      page.indexOf("<QuoteConfirmationScreen"),
      page.indexOf("/>", page.indexOf("<QuoteConfirmationScreen"))
    );
    assert.match(screen, /garmentLines=\{apparelPricing\.lines\}/);
  });
});
