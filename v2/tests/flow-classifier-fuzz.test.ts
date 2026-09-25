import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isSignsOrder } from "../lib/auto-bill";
import {
  classifyOrderFlow,
  isApparelProduct,
  isSignsProduct,
  isStickerFlow,
  maySignsAutoBill,
  namesStickers,
  type OrderFlow,
} from "../lib/order-flow";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { isStickerOrder } from "../lib/sticker-repricing";

/**
 * The flow decision, swept rather than sampled.
 *
 * ── WHY A SWEEP ───────────────────────────────────────────────────────────
 * tests/flow-classifiers-agree.test.ts pins eight type strings that were
 * known to be dangerous. It caught the bug it was written for and could not
 * have caught the next one, because the next one is always a string nobody
 * listed. `/api/quote` is public: `product.type`, `signType`, `garmentType`
 * and `supplier` are all caller-supplied, so the input space is "any text",
 * not "the eight strings we thought of".
 *
 * This enumerates ~3,000 products — every combination of a type string
 * built from the three dangerous substrings, four casings, three
 * punctuation styles, and each of the spec fields present or absent — and
 * asserts the INVARIANTS rather than the answers. An invariant survives a
 * rewrite; a table of expected outputs does not.
 *
 * ── WHAT IT FOUND ─────────────────────────────────────────────────────────
 * Invariant 3. `{ type: "Vinyl Banners", signType: "Banner", garmentType:
 * "Tee" }` was SHAPED as apparel and still cleared the signs auto-bill gate,
 * so an apparel-shaped invoice acquired an automatic payment link — which
 * AGENTS.md forbids in as many words. The same defect as #186's sticker
 * bail, in the pair nobody had put side by side.
 */

const SUBSTRINGS = ["sticker", "stickers", "signs", "sign", "banner", "banners"];
const CASINGS: Array<(s: string) => string> = [
  (s) => s,
  (s) => s.toUpperCase(),
  (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
  (s) => s.replace(/\w/g, (c, i) => (i % 2 ? c.toUpperCase() : c)),
];
const JOINERS = [" ", " & ", "-", " / ", ", ", ""];

/** Type strings: each substring alone, and every ordered pair of them. */
function typeStrings(): string[] {
  const bases = new Set<string>(["", "Custom", "Poster", "Apparel", "T-Shirts"]);

  for (const one of SUBSTRINGS) {
    bases.add(one);
    bases.add(`Custom ${one}`);
    for (const two of SUBSTRINGS) {
      if (one === two) continue;
      for (const joiner of JOINERS) bases.add(`${one}${joiner}${two}`);
    }
  }

  const out = new Set<string>();
  for (const base of bases) for (const casing of CASINGS) out.add(casing(base));
  return [...out];
}

/** Every combination of the four spec fields being present or absent. */
const FIELD_SETS: AnyProduct[] = [
  {},
  { signType: "Yard Sign" },
  { garmentType: "T-Shirts" },
  { supplier: "S&S" },
  { signType: "Yard Sign", garmentType: "T-Shirts" },
  { signType: "Yard Sign", supplier: "S&S" },
  { garmentType: "T-Shirts", supplier: "S&S" },
  { signType: "Yard Sign", garmentType: "T-Shirts", supplier: "S&S" },
];

type AnyProduct = Record<string, unknown>;

function everyProduct(): AnyProduct[] {
  const products: AnyProduct[] = [];
  for (const type of typeStrings()) {
    for (const fields of FIELD_SETS) {
      products.push({
        type,
        quantity: 100,
        widthInches: 3,
        heightInches: 3,
        size: '3" x 3"',
        shape: "Die Cut",
        material: "Gloss White Vinyl",
        finish: "Gloss",
        ...fields,
      });
    }
  }
  return products;
}

const PRODUCTS = everyProduct();

function orderFor(product: AnyProduct) {
  return {
    customer: { customerName: "X", email: "x@y.com" },
    production: { deliveryMethod: "Pickup" },
    product,
    items: [product],
    pricing: { stickerPrice: 84, setupPrice: 15, minimumPrice: 0, total: 99 },
  } as Record<string, unknown>;
}

/** Fails naming the offending product rather than just a count. */
function forEveryProduct(
  name: string,
  holds: (product: AnyProduct) => boolean
) {
  const broken = PRODUCTS.filter((product) => !holds(product));
  assert.equal(
    broken.length,
    0,
    `${name} — ${broken.length} of ${PRODUCTS.length} products break it, ` +
      `e.g. ${JSON.stringify(broken.slice(0, 3).map((p) => ({
        type: p.type,
        signType: p.signType,
        garmentType: p.garmentType,
        supplier: p.supplier,
      })))}`
  );
}

describe(`the invariants, over ${PRODUCTS.length} generated products`, () => {
  test("the sweep is actually sweeping", () => {
    // A generator that collapsed to a handful of products would make every
    // test below pass while proving nothing — the quietest failure there is.
    assert.ok(PRODUCTS.length > 1500, `only ${PRODUCTS.length} products`);
    assert.ok(
      PRODUCTS.some((p) => isStickerFlow(orderFor(p))),
      "no product in the sweep classifies as stickers"
    );
    assert.ok(
      PRODUCTS.some((p) => classifyOrderFlow(orderFor(p)) === "signs"),
      "no product in the sweep classifies as signs"
    );
    assert.ok(
      PRODUCTS.some((p) => classifyOrderFlow(orderFor(p)) === "apparel"),
      "no product in the sweep classifies as apparel"
    );
  });

  test("1. never both: a sticker order is never shaped as signs", () => {
    // THE #186 defect. Priced and billed against the sticker table while
    // invoiced as signs, which empties the sticker rows and drops the $15
    // setup and the $45 minimum.
    forEveryProduct(
      "sticker flow and signs shape are both true",
      (product) =>
        !(isStickerFlow(orderFor(product)) && isSignsProduct(product))
    );
  });

  test("2. anything the type calls a sticker is never shaped as signs", () => {
    // Broader than 1: it covers the payloads that fail the sticker gate for
    // some OTHER reason and so are not caught by it.
    forEveryProduct(
      "a sticker-named product is shaped as signs",
      (product) => !(namesStickers(product) && isSignsProduct(product))
    );
  });

  test("3. nothing shaped as apparel may auto-bill", () => {
    // AGENTS.md, in as many words: apparel is an estimate off a catalogue
    // that can be stale, and must not acquire a payment link. This is the
    // invariant the sweep broke.
    forEveryProduct(
      "an apparel-shaped order clears a billing gate",
      (product) => {
        const order = orderFor(product);
        if (classifyOrderFlow(order) !== "apparel") return true;
        return !maySignsAutoBill(order) && !isStickerFlow(order);
      }
    );
  });

  test("4. authority is never broader than shape", () => {
    // Billing is allowed to be narrower than presentation and never wider:
    // an order that bills as signs must also LOOK like signs, or the
    // invoice and the charge describe two different jobs.
    forEveryProduct(
      "an order bills as signs without being shaped as signs",
      (product) =>
        !maySignsAutoBill(orderFor(product)) ||
        classifyOrderFlow(orderFor(product)) === "signs"
    );
    forEveryProduct(
      "an order bills as stickers without being shaped as stickers",
      (product) =>
        !isStickerFlow(orderFor(product)) ||
        classifyOrderFlow(orderFor(product)) === "stickers"
    );
  });

  test("5. no order may auto-bill down two flows at once", () => {
    forEveryProduct(
      "both billing gates are open on one order",
      (product) =>
        !(maySignsAutoBill(orderFor(product)) && isStickerFlow(orderFor(product)))
    );
  });

  test("6. every order gets exactly one shape", () => {
    const shapes: OrderFlow[] = ["apparel", "signs", "stickers"];
    forEveryProduct("classifyOrderFlow returned something else", (product) =>
      shapes.includes(classifyOrderFlow(orderFor(product)))
    );
  });
});

describe("every surface reads the same decision", () => {
  test("the exported names still delegate to the one rule", () => {
    // The refactor is only worth anything if the old names ARE the new
    // ones. A file that kept its own copy would pass every invariant above
    // while still being able to disagree.
    forEveryProduct(
      "isStickerOrder and isStickerFlow disagree",
      (product) => isStickerOrder(orderFor(product)) === isStickerFlow(orderFor(product))
    );
    forEveryProduct(
      "isSignsOrder and maySignsAutoBill disagree",
      (product) => isSignsOrder(orderFor(product)) === maySignsAutoBill(orderFor(product))
    );
  });

  test("the INVOICE agrees: a sticker order always keeps its setup row", () => {
    // The end the defect was measured at. #186's reference pack priced at
    // $99.00 and invoiced at $84.00 with the $15 setup gone, and only
    // amountOutstanding was short — every log line still said $99.
    const stickerProducts = PRODUCTS.filter((product) =>
      isStickerFlow(orderFor(product))
    );

    assert.ok(stickerProducts.length > 50, "too few sticker products to mean anything");

    for (const product of stickerProducts.slice(0, 200)) {
      const plan = buildPrintavoQuotePlan({
        quoteNumber: "GS-FUZZ",
        order: orderFor(product),
        artworkAnalysis: null,
      } as never);
      const text = JSON.stringify(plan);
      assert.match(
        text,
        /[Ss]etup/,
        `no setup row on a sticker order: ${JSON.stringify(product.type)}`
      );
    }
  });

  test("apparel-shaped products never reach the sticker invoice rows", () => {
    const apparelProducts = PRODUCTS.filter(
      (product) => isApparelProduct(product)
    );
    assert.ok(apparelProducts.length > 50);

    for (const product of apparelProducts.slice(0, 100)) {
      const order = orderFor(product);
      assert.equal(classifyOrderFlow(order), "apparel");
      assert.equal(isStickerOrder(order), false);
      assert.equal(isSignsOrder(order), false);
    }
  });
});
