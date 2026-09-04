/**
 * The "and also" garments under the apparel configurator — the form-side
 * model in lib/apparel-cart-lines.ts. The pricing engine has its own tests
 * (tests/apparel-cart.test.ts); these cover the step before it: turning
 * what the customer chose into lines the engine can price, and refusing
 * to price what they have not finished choosing.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { SsCatalogProduct } from "../features/types";
import { blendedGarmentUnitPrice } from "../lib/apparel-blend";
import {
  anyGarmentNeedsUnderbase,
  describeGarmentLines,
  extraGarmentLineErrors,
  newExtraGarmentLine,
  resolveExtraGarmentLines,
} from "../lib/apparel-cart-lines";
import { getApparelFieldErrors } from "../lib/validation";

const size = (sizeName: string, markedUpPrice: number) => ({
  sku: `SKU-${sizeName}`,
  sizeName,
  markedUpPrice,
  isAvailable: true,
  outOfStock: false,
});

const color = (colorName: string, base: number) => ({
  colorName,
  colorHex: null,
  swatchImage: null,
  frontImage: null,
  backImage: null,
  sideImage: null,
  isAvailable: true,
  outOfStock: false,
  sizes: [
    size("S", base),
    size("M", base),
    size("L", base),
    size("XL", base),
    size("2XL", base + 2),
    size("3XL", base + 3),
  ],
});

const CATALOG: SsCatalogProduct[] = [
  {
    id: "tee",
    brandName: "Gildan",
    styleName: "5000",
    displayName: "Gildan 5000",
    customerLabel: "Starter Tee",
    customerCategory: "T-Shirts",
    catalogStyle: "5000",
    catalogNotes: "",
    colors: [color("White", 3.49), color("Black", 3.81)],
  },
  {
    id: "hoodie",
    brandName: "Gildan",
    styleName: "18500",
    displayName: "Gildan 18500",
    customerLabel: "Heavy Hoodie",
    customerCategory: "Sweatshirts",
    catalogStyle: "18500",
    catalogNotes: "",
    colors: [color("Black", 14.87)],
  },
];

describe("a new line is empty on purpose", () => {
  test("no product, no colour, nothing counted", () => {
    const line = newExtraGarmentLine();

    assert.equal(line.productId, "");
    assert.equal(line.colorName, "");
    assert.equal(line.quantity, 0);
  });

  test("two new lines never share an id", () => {
    assert.notEqual(newExtraGarmentLine().id, newExtraGarmentLine().id);
  });

  test("an empty line prices NOTHING — no phantom garment", () => {
    // The cart engine already refuses a phantom shirt on an empty cart;
    // the form must not hand it one by defaulting a count.
    assert.deepEqual(resolveExtraGarmentLines([newExtraGarmentLine()], CATALOG), []);
  });
});

describe("resolving a line against the catalogue", () => {
  test("a finished line becomes a priced cart line on the blend", () => {
    const [line] = resolveExtraGarmentLines(
      [{ id: "g1", productId: "hoodie", colorName: "Black", quantity: 12 }],
      CATALOG
    );

    assert.equal(line.garmentLabel, "Heavy Hoodie");
    assert.equal(line.colorName, "Black");
    assert.equal(line.catalogStyle, "18500", "the SKU Printavo files it under");
    assert.equal(line.quantity, 12);
    assert.equal(
      line.garmentUnitPrice,
      blendedGarmentUnitPrice(CATALOG[1].colors[0]),
      "extras stand on the assumed size mix"
    );
  });

  test("a product that left the catalogue resolves to nothing", () => {
    assert.deepEqual(
      resolveExtraGarmentLines(
        [{ id: "g1", productId: "discontinued", colorName: "Black", quantity: 12 }],
        CATALOG
      ),
      []
    );
  });

  test("a colour the product does not come in resolves to nothing", () => {
    assert.deepEqual(
      resolveExtraGarmentLines(
        [{ id: "g1", productId: "hoodie", colorName: "White", quantity: 12 }],
        CATALOG
      ),
      []
    );
  });

  test("a fractional count is floored, never rounded up into an order", () => {
    const [line] = resolveExtraGarmentLines(
      [{ id: "g1", productId: "tee", colorName: "White", quantity: 12.9 }],
      CATALOG
    );

    assert.equal(line.quantity, 12);
  });
});

describe("what is wrong with a line, in the order the customer fills it", () => {
  test("nothing chosen: choose a garment", () => {
    assert.equal(
      extraGarmentLineErrors([{ ...newExtraGarmentLine(), id: "g1" }], CATALOG).g1,
      "Choose a garment."
    );
  });

  test("garment gone from the catalogue: says so, rather than pricing it", () => {
    assert.match(
      extraGarmentLineErrors(
        [{ id: "g1", productId: "discontinued", colorName: "", quantity: 12 }],
        CATALOG
      ).g1,
      /no longer in the catalog/
    );
  });

  test("garment chosen, no colour: choose a color", () => {
    assert.equal(
      extraGarmentLineErrors(
        [{ id: "g1", productId: "hoodie", colorName: "", quantity: 12 }],
        CATALOG
      ).g1,
      "Choose a color."
    );
  });

  test("garment and colour, no count: enter how many", () => {
    assert.equal(
      extraGarmentLineErrors(
        [{ id: "g1", productId: "hoodie", colorName: "Black", quantity: 0 }],
        CATALOG
      ).g1,
      "Enter how many."
    );
  });

  test("a finished line has nothing wrong with it", () => {
    assert.deepEqual(
      extraGarmentLineErrors(
        [{ id: "g1", productId: "hoodie", colorName: "Black", quantity: 12 }],
        CATALOG
      ),
      {}
    );
  });

  test("the validator refuses to submit with a half-filled line", () => {
    // The per-line message reaches the field level, so the step bar and the
    // checklist point at it — lib/steps.ts owns which step (details).
    const errors = getApparelFieldErrors(
      { specialOrder: false, specialOrderNotes: "", quantity: 24, printLocations: ["Front"] },
      {
        customer: { customerName: "Dana", email: "dana@example.com" },
        artwork: { file: { name: "art.png" } },
        production: { needBy: "2026-12-15" },
      },
      24,
      "2026-09-04",
      { g1: "Choose a color." }
    );

    assert.match(errors.garmentLines ?? "", /Finish or remove the added garment/);
    assert.match(errors.garmentLines ?? "", /choose a color/);
  });

  test("…and is silent when every line is finished", () => {
    const errors = getApparelFieldErrors(
      { specialOrder: false, specialOrderNotes: "", quantity: 24, printLocations: ["Front"] },
      {
        customer: { customerName: "Dana", email: "dana@example.com" },
        artwork: { file: { name: "art.png" } },
        production: { needBy: "2026-12-15" },
      },
      24,
      "2026-09-04",
      {}
    );

    assert.equal(errors.garmentLines, undefined);
  });
});

describe("the underbase decision on a mixed run", () => {
  test("white first garment, nothing added: no underbase", () => {
    assert.equal(anyGarmentNeedsUnderbase("White", []), false);
  });

  test("a dark first garment needs it regardless of the extras", () => {
    assert.equal(anyGarmentNeedsUnderbase("Black", []), true);
  });

  test("white tees plus black hoodies: the run is priced WITH it", () => {
    // Errs high on the white tees rather than low on the black hoodies —
    // the direction that is safe on a hand-confirmed flow.
    assert.equal(
      anyGarmentNeedsUnderbase("White", [
        { id: "g1", productId: "hoodie", colorName: "Black", quantity: 12 },
      ]),
      true
    );
  });

  test("an unfinished line with no colour does not decide it", () => {
    assert.equal(
      anyGarmentNeedsUnderbase("White", [
        { id: "g1", productId: "hoodie", colorName: "", quantity: 0 },
      ]),
      false
    );
  });
});

describe("the sentence the shop reads", () => {
  test("every garment, count first, dot-separated", () => {
    assert.equal(
      describeGarmentLines([
        { garmentLabel: "Starter Tee", colorName: "White", quantity: 24 },
        { garmentLabel: "Heavy Hoodie", colorName: "Black", quantity: 12 },
      ]),
      "24 × Starter Tee / White · 12 × Heavy Hoodie / Black"
    );
  });
});
