import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import ApparelBuilder from "../features/apparel/ApparelBuilder";
import type { SsCatalogColor, SsCatalogProduct } from "../features/types";
import { defaultApparelQuote } from "../lib/apparel";
import {
  GARMENT_COLOR_RANKING,
  POPULAR_COLOR_COUNT,
  sortColorsByPopularity,
} from "../lib/garment-color-ranking";

/**
 * Gabe, 2026-11-21: colours "in order that they're commonly ordered. Black,
 * navy, sport grey ... put those colors first."
 *
 * The fixture is the real colour names S&S returned for the three live styles
 * that day, so a name in the ranking that no garment uses is caught here
 * rather than silently doing nothing.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/ss-color-names-2026-11-21.json", import.meta.url),
    "utf8"
  )
) as { styles: Record<string, string[]> };

const BASIC_TEE = "39";
const PREMIUM_TEE = "7584";
const HOODIE = "395";

function named(names: string[]) {
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((colorName) => ({ colorName }));
}

function order(style: string) {
  return sortColorsByPopularity(named(fixture.styles[style])).map(
    (c) => c.colorName
  );
}

describe("garment colours, most ordered first", () => {
  test("Gabe's three lead every Gildan style, in his order", () => {
    for (const style of [BASIC_TEE, HOODIE]) {
      assert.deepEqual(order(style).slice(0, 3), ["Black", "Navy", "Sport Grey"]);
    }
  });

  test("the Bella+Canvas tee gets the same three under its own names", () => {
    assert.deepEqual(order(PREMIUM_TEE).slice(0, 3), [
      "Solid Black Blend",
      "Heather Navy",
      "Athletic Heather",
    ]);
  });

  test("nothing is dropped or doubled", () => {
    for (const [style, names] of Object.entries(fixture.styles)) {
      const sorted = order(style);
      assert.equal(sorted.length, names.length);
      assert.deepEqual([...sorted].sort(), [...names].sort());
    }
  });

  test("colours the ranking doesn't name stay alphabetical, after it", () => {
    const sorted = order(BASIC_TEE);
    const ranked = new Set(GARMENT_COLOR_RANKING.flat().map((n) => n.toLowerCase()));
    const firstUnranked = sorted.findIndex((n) => !ranked.has(n.toLowerCase()));
    const tail = sorted.slice(firstUnranked);
    assert.deepEqual(tail, [...tail].sort((a, b) => a.localeCompare(b)));
  });

  test("only one name per slot is promoted", () => {
    // Gildan 2000 has both Navy and Heather Navy: Navy takes the slot, and
    // Heather Navy is not pulled up beside it.
    const sorted = order(BASIC_TEE);
    assert.ok(sorted.indexOf("Heather Navy") > POPULAR_COLOR_COUNT);
  });

  test("every slot matches at least one live garment", () => {
    const live = new Set(
      Object.values(fixture.styles).flat().map((n) => n.toLowerCase())
    );
    for (const slot of GARMENT_COLOR_RANKING) {
      assert.ok(
        slot.some((name) => live.has(name.toLowerCase())),
        `no live garment has any of: ${slot.join(", ")}`
      );
    }
  });

  test("matching ignores case and stray spaces, and the input is untouched", () => {
    const input = [{ colorName: "ash" }, { colorName: " BLACK " }];
    const sorted = sortColorsByPopularity(input);
    assert.deepEqual(sorted.map((c) => c.colorName), [" BLACK ", "ash"]);
    assert.deepEqual(input.map((c) => c.colorName), ["ash", " BLACK "]);
  });
});

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

function render(selected: string | null) {
  const colors = sortColorsByPopularity(
    named(fixture.styles[PREMIUM_TEE]).map((c) => color(c.colorName))
  );
  const product: SsCatalogProduct = {
    id: "p",
    brandName: "BELLA + CANVAS",
    styleName: "3001CVC",
    displayName: "BELLA + CANVAS 3001CVC",
    customerLabel: "Premium Soft Tee",
    customerCategory: "T-Shirts",
    catalogStyle: PREMIUM_TEE,
    catalogNotes: "",
    colors,
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
      selectedSsColor={selected ? colors.find((c) => c.colorName === selected)! : null}
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
    />
  );
  const shown = [...html.matchAll(/aria-pressed="(?:true|false)"[^>]*>[\s\S]*?<span class="text-fine font-bold text-\[var\(--ink-black\)\]">([^<]+)<\/span>/g)].map(
    (m) => m[1]
  );
  return { html, shown, total: colors.length };
}

describe("the order page's colour list", () => {
  test("shows the popular colours first, the rest behind one button", () => {
    const { html, shown, total } = render(null);
    assert.equal(shown.length, POPULAR_COLOR_COUNT);
    assert.equal(shown[0], "Solid Black Blend");
    assert.match(html, new RegExp(`Show all ${total} colors`));
  });

  test("a chosen colour from the long tail is still shown", () => {
    const { shown } = render("Neon Pink");
    assert.equal(shown.length, POPULAR_COLOR_COUNT + 1);
    assert.equal(shown.at(-1), "Neon Pink");
  });
});
