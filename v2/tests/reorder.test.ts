/**
 * Reorder links — "order these again" as a URL.
 *
 * The two tests that matter most are in the last describe block: a link
 * carries no price, and a link cannot place an order. Everything else is
 * the format doing its job.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { decodeReorder, encodeReorder, reorderUrl } from "../lib/reorder";
import { stickerCatalog } from "../lib/catalog";

const CATALOGUE = {
  materials: stickerCatalog.materials,
  shapes: stickerCatalog.shapes,
};

const twoDesignCart = {
  items: [
    { quantity: 100, widthInches: 3, heightInches: 3, material: "Gloss White Vinyl", shape: "Die Cut" },
    { quantity: 50, widthInches: 2, heightInches: 2, material: "Holographic", shape: "Circle" },
  ],
  deliveryMethod: "Pickup",
};

describe("a link describes the cart, readably", () => {
  test("the canonical two-design cart round-trips", () => {
    const query = encodeReorder(twoDesignCart);

    assert.equal(
      query,
      "?reorder=1&d=100%403x3%3Agloss-white-vinyl%3Adie-cut&d=50%402x2%3Aholographic%3Acircle&delivery=pickup"
    );

    const decoded = decodeReorder(query, CATALOGUE);
    assert.deepEqual(decoded, {
      designs: [
        { quantity: 100, widthInches: 3, heightInches: 3, material: "Gloss White Vinyl", shape: "Die Cut" },
        { quantity: 50, widthInches: 2, heightInches: 2, material: "Holographic", shape: "Circle" },
      ],
      deliveryMethod: "Pickup",
    });
  });

  test("the full URL is the site plus the query", () => {
    assert.match(
      reorderUrl("https://labs.gorillasalem.com", twoDesignCart) ?? "",
      /^https:\/\/labs\.gorillasalem\.com\/\?reorder=1&d=/
    );
  });

  test("fractional sizes survive the trip", () => {
    const decoded = decodeReorder(
      encodeReorder({ items: [{ quantity: 25, widthInches: 2.5, heightInches: 1.75, material: "Chrome", shape: "Oval" }] }),
      CATALOGUE
    );

    assert.equal(decoded?.designs[0].widthInches, 2.5);
    assert.equal(decoded?.designs[0].heightInches, 1.75);
  });
});

describe("nothing worth linking produces no link", () => {
  test("an empty cart", () => {
    assert.equal(encodeReorder({ items: [] }), "");
    assert.equal(reorderUrl("https://x.test", { items: [] }), null);
  });

  test("a design the engine could not price is not re-offered", () => {
    // Zero area cannot check out; a link rebuilding it would rebuild a
    // dead end. (The unpriceable guard in sticker-repricing exists for the
    // same figure.)
    assert.equal(
      encodeReorder({ items: [{ quantity: 100, widthInches: 0, heightInches: 0, material: "Chrome", shape: "Circle" }] }),
      ""
    );
  });
});

describe("decoding is tolerant — a bad link prefills nothing", () => {
  const bad = [
    "",
    "?",
    "?reorder=1",
    "?reorder=99&d=100@3x3:gloss-white-vinyl:die-cut",
    "?reorder=1&d=garbage",
    "?reorder=1&d=0@3x3:gloss-white-vinyl:die-cut",
    "?reorder=1&d=-5@3x3:gloss-white-vinyl:die-cut",
    "?reorder=1&d=100@0x0:gloss-white-vinyl:die-cut",
    "?reorder=1&d=100@999x999:gloss-white-vinyl:die-cut",
    "?reorder=1&d=999999999@3x3:gloss-white-vinyl:die-cut",
  ];

  for (const search of bad) {
    test(`refuses ${JSON.stringify(search)}`, () => {
      assert.equal(decodeReorder(search, CATALOGUE), null);
    });
  }

  test("a discontinued material falls back to the builder's default", () => {
    // The link is a convenience, never an authority on what the shop sells.
    const decoded = decodeReorder(
      "?reorder=1&d=100@3x3:unobtainium-foil:die-cut",
      CATALOGUE
    );

    assert.equal(decoded?.designs[0].material, "");
    assert.equal(decoded?.designs[0].shape, "Die Cut");
  });

  test("a cart of absurd length is capped, not honoured", () => {
    const many = Array.from({ length: 40 }, () => ({
      quantity: 10, widthInches: 2, heightInches: 2, material: "Chrome", shape: "Circle",
    }));

    assert.equal(decodeReorder(encodeReorder({ items: many }), CATALOGUE)?.designs.length, 10);
  });
});

describe("THE TWO PROPERTIES THAT MAKE THIS SAFE", () => {
  const source = readFileSync(new URL("../lib/reorder.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  test("a link carries NO price, ever", () => {
    /**
     * A price in the link is last spring's price next spring. Every figure
     * comes from the engine at render time, exactly as it does for a fresh
     * quote. Checked on the encoded output AND on the type, so neither a
     * new field nor a stray value can slip one in.
     */
    const query = encodeReorder({
      ...twoDesignCart,
      // Even if a caller hands over a priced cart, price must not travel.
      items: twoDesignCart.items.map((item) => ({
        ...item,
        linePrice: 28.8,
        total: 53.8,
      })),
    } as never);

    assert.doesNotMatch(query, /28\.8|53\.8|price|total/i);
    assert.doesNotMatch(source, /linePrice|stickerPrice|\btotal\b/);
  });

  test("applying a link prefills and stops — it never submits", () => {
    /**
     * Stickers auto-bill. A URL that could place an order would be a URL
     * that could take money, so the effect that applies a link must not
     * touch submit. Pinned on the source because this is a wiring
     * property: the shape of the effect, not the value of a function.
     */
    const effect = page.slice(
      page.indexOf("const [reorderPrefilled, setReorderPrefilled]"),
      page.indexOf("function addDesign()")
    );

    assert.ok(effect.length > 200, "the reorder effect moved — re-pin this");
    assert.doesNotMatch(effect, /submitQuote|handleSubmit|fetch\(/);
    assert.match(effect, /setSelectedProductId\("stickers"\)/);
  });
});
