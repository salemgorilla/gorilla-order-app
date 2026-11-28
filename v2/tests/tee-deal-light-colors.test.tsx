import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import ApparelBuilder from "../features/apparel/ApparelBuilder";
import type { SsCatalogColor, SsCatalogProduct } from "../features/types";
import { defaultApparelQuote } from "../lib/apparel";
import { TEE_DEAL_FRONTS, TEE_DEAL_SIZES } from "../lib/tee-deal";

/**
 * The light-only tee deals (12 and 24 tees, 1 color) cannot take a dark tee:
 * a dark tee needs a white underbase, a second screen. The Nov 24 and Nov 28
 * test runs picked Black, went through Artwork and Contact, and were only
 * refused at Review. Dark colours are now not offered on those deals at all.
 */
function color(colorName: string): SsCatalogColor {
  return {
    colorName,
    colorHex: "#000000",
    swatchImage: null,
    frontImage: null,
    backImage: null,
    sideImage: null,
    isAvailable: true,
    outOfStock: false,
    sizes: [],
  };
}

const COLORS = ["Black", "Navy", "Sport Grey", "White", "Ash", "Natural", "Sand", "Red"];

function render(lightOnly: boolean) {
  const product: SsCatalogProduct = {
    id: "p",
    brandName: "Gildan",
    styleName: "5000",
    displayName: "Gildan 5000",
    customerLabel: "Heavy Cotton Tee",
    customerCategory: "T-Shirts",
    catalogStyle: "16",
    catalogNotes: "",
    colors: COLORS.map(color),
  };
  const noop = () => {};
  const html = renderToStaticMarkup(
    <ApparelBuilder
      apparelQuote={defaultApparelQuote}
      artworkAnalysis={null}
      ssCatalogStatus="loaded"
      hasSsProducts
      filteredSsProducts={[product]}
      apparelCategories={["T-Shirts"]}
      selectedApparelCategory="T-Shirts"
      selectedSsProduct={product}
      selectedSsColor={null}
      selectedSsSize={null}
      sizeOptionsForBreakdown={[]}
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
      fixedDeal={{
        quantity: 24,
        sizes: TEE_DEAL_SIZES,
        placements: TEE_DEAL_FRONTS,
        inks: ["1 color"],
        lightOnly,
      }}
    />
  );
  return [...html.matchAll(/<span class="text-fine font-bold text-\[var\(--ink-black\)\]">([^<]+)<\/span>/g)].map(
    (m) => m[1]
  );
}

describe("colours offered on the tee deals", () => {
  test("a light-only deal offers only light tees", () => {
    const shown = render(true);
    for (const light of ["White", "Ash", "Natural", "Sand"]) assert.ok(shown.includes(light), light);
    for (const dark of ["Black", "Navy", "Sport Grey", "Red"]) assert.ok(!shown.includes(dark), dark);
  });

  test("the 2-color deal still offers every colour", () => {
    const shown = render(false);
    for (const name of COLORS) assert.ok(shown.includes(name), name);
  });
});
