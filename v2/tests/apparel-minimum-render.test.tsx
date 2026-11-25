import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import ApparelBuilder from "../features/apparel/ApparelBuilder";
import { defaultApparelQuote } from "../lib/apparel";

/**
 * The colour-based minimum, rendered (lib/print-minimums.ts). The rule is
 * tested in print-minimums.test.ts; this proves the builder actually puts
 * the sentence on screen, in the quantity box and under the ink question,
 * and gives way to the red error once submit has marked the field.
 */
const noop = () => {};
const render = (props: Partial<Parameters<typeof ApparelBuilder>[0]> = {}) =>
  renderToStaticMarkup(
    <ApparelBuilder
      apparelQuote={{ ...defaultApparelQuote, quantity: 8 }}
      artworkAnalysis={null}
      ssCatalogStatus="idle"
      hasSsProducts={false}
      filteredSsProducts={[]}
      apparelCategories={[]}
      selectedApparelCategory=""
      selectedSsProduct={null}
      selectedSsColor={null}
      selectedSsSize={null}
      sizeOptionsForBreakdown={["S", "M", "L"]}
      sizeQuantities={{}}
      onSelectCategory={noop}
      onSelectProduct={noop}
      onSelectColor={noop}
      onSelectSize={noop}
      onSelectGarmentType={noop}
      onSelectFallbackGarmentColor={noop}
      onTogglePrintLocation={noop}
      onSelectInkColors={noop}
      onSelectLocationInkColors={noop}
      onUpdateSpecialOrder={noop}
      onUpdateSizeQuantity={noop}
      onSetSizeQuantity={noop}
      onResetSizeBreakdown={noop}
      onSetRoughQuantity={noop}
      sizesEntered={false}
      {...(props as object)}
    />
  );

const NOTICE = "Screen printing starts at 12 pieces. You have 8, so add 4 more.";

describe("the minimum on screen", () => {
  test("shown live, twice: the quantity box and under the ink question", () => {
    const html = render({ minimumNotice: NOTICE });
    assert.equal(html.split(NOTICE).length - 1, 2, html.slice(0, 200));
    assert.match(html, /data-testid="apparel-minimum-notice"/);
  });

  test("after submit the red error replaces the live notice in the box", () => {
    const html = render({ minimumNotice: NOTICE, fieldErrors: { quantity: NOTICE } });
    assert.doesNotMatch(html, /data-testid="apparel-minimum-notice"/);
    assert.match(html, /id="apparel-quantity-error"/);
  });

  test("met minimum: nothing said", () => {
    assert.doesNotMatch(render({ minimumNotice: null }), /starts at/);
  });
});
