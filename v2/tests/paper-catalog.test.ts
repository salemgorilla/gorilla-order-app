/**
 * The paper catalogue: what can be ordered, with no prices in it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DOUBLE_SIDED,
  PAPER_PRODUCT_TYPE,
  SINGLE_SIDED,
  defaultPaperSpec,
  describePaperSpec,
  paperProductById,
  paperProducts,
  paperSpecForProduct,
  validatePaperSpec,
  type PaperSpec,
} from "../lib/paper";
import { classifyOrderFlow, isStickerFlow, maySignsAutoBill } from "../lib/order-flow";

describe("the catalogue", () => {
  test("offers exactly what Gabe asked for on 2026-10-23", () => {
    assert.deepEqual(
      paperProducts.map((p) => p.id),
      ["business-cards", "rack-cards", "postcards", "brochures", "letterhead", "menus"]
    );
  });

  test("every product has at least one size, stock and quantity, with no duplicates", () => {
    for (const product of paperProducts) {
      assert.ok(product.sizes.length > 0, `${product.id} sizes`);
      assert.ok(product.stocks.length > 0, `${product.id} stocks`);
      assert.ok(product.quantities.length > 0, `${product.id} quantities`);
      assert.equal(new Set(product.stocks).size, product.stocks.length, `${product.id} stocks unique`);
      assert.equal(new Set(product.quantities).size, product.quantities.length);
      assert.deepEqual(
        [...product.quantities].sort((a, b) => a - b),
        product.quantities,
        `${product.id} quantities ascend`
      );
    }
  });

  test("holds no prices", () => {
    assert.doesNotMatch(JSON.stringify(paperProducts), /price|cost|\$\d/i);
  });
});

describe("the product type string cannot be read as another flow", () => {
  // lib/order-flow.ts classifies by substrings of product.type. This is the
  // hazard: "Paper Printing - Business Card Designs" reads as SIGNS because
  // "designs" contains "signs".
  test("contains none of the words the classifiers key on", () => {
    assert.doesNotMatch(PAPER_PRODUCT_TYPE, /sign|banner|sticker|apparel|shirt|decal/i);
  });

  test("a paper payload is neither a sticker order nor a signs order", () => {
    const order = {
      product: { type: PAPER_PRODUCT_TYPE, quantity: 500 },
      pricing: { total: 0, quoteRequired: true },
    };

    assert.equal(isStickerFlow(order as never), false);
    assert.equal(maySignsAutoBill(order as never), false);
    assert.equal(classifyOrderFlow(order as never), "paper");
  });
});

describe("a spec is always checked against the catalogue", () => {
  test("every default spec is valid", () => {
    for (const product of paperProducts) {
      assert.deepEqual(validatePaperSpec(defaultPaperSpec(product.id)), {}, product.id);
    }
  });

  test("a stock the product does not sell is refused", () => {
    const spec: PaperSpec = { ...defaultPaperSpec("rack-cards"), stock: "16pt Soft Touch" };
    assert.ok(validatePaperSpec(spec).stock);
  });

  test("a quantity that is not a break is refused", () => {
    const spec: PaperSpec = { ...defaultPaperSpec("business-cards"), quantity: 137 };
    assert.ok(validatePaperSpec(spec).quantity);
  });

  test("finishing that the product does not offer is refused", () => {
    const spec: PaperSpec = { ...defaultPaperSpec("rack-cards"), finishing: ["Rounded corners"] };
    assert.ok(validatePaperSpec(spec).finishing);
    assert.deepEqual(
      validatePaperSpec({ ...defaultPaperSpec("business-cards"), finishing: ["Rounded corners"] }),
      {}
    );
  });

  test("an unknown product, or no spec, is refused", () => {
    assert.ok(validatePaperSpec(null).productId);
    assert.ok(validatePaperSpec({ ...defaultPaperSpec(), productId: "banners" as never }).productId);
  });

  test("sides must be one of the two offered", () => {
    assert.ok(validatePaperSpec({ ...defaultPaperSpec(), sides: "Triple" as never }).sides);
    assert.deepEqual(validatePaperSpec({ ...defaultPaperSpec(), sides: SINGLE_SIDED }), {});
    assert.deepEqual(validatePaperSpec({ ...defaultPaperSpec(), sides: DOUBLE_SIDED }), {});
  });
});

describe("switching product keeps only what still applies", () => {
  test("a business-card stock and run are dropped when moving to postcards", () => {
    const cards: PaperSpec = {
      ...defaultPaperSpec("business-cards"),
      stock: "16pt Soft Touch",
      quantity: 2500,
      finishing: ["Rounded corners"],
      notes: "keep me",
    };

    const next = paperSpecForProduct(cards, "menus");

    assert.deepEqual(validatePaperSpec(next), {});
    assert.equal(next.productId, "menus");
    assert.notEqual(next.stock, "16pt Soft Touch");
    assert.deepEqual(next.finishing, []);
    assert.equal(next.notes, "keep me", "the customer's words survive the switch");
  });

  test("a stock both products sell is kept", () => {
    const next = paperSpecForProduct(
      { ...defaultPaperSpec("rack-cards"), stock: "14pt Gloss" },
      "postcards"
    );

    assert.equal(next.stock, "14pt Gloss");
  });
});

describe("the shop-facing description", () => {
  test("lists the spec and carries the notes", () => {
    const lines = describePaperSpec({
      ...defaultPaperSpec("business-cards"),
      quantity: 1000,
      notes: "  matte please ",
    });

    assert.deepEqual(lines, [
      "Product: Business Cards",
      'Size: 3.5" x 2"',
      "Stock: 14pt Matte",
      "Quantity: 1,000",
      "Printing: Double-sided",
      "Notes: matte please",
    ]);
  });

  test("every product resolves by id", () => {
    for (const product of paperProducts) assert.equal(paperProductById(product.id), product);
    assert.equal(paperProductById("nope"), undefined);
  });
});
