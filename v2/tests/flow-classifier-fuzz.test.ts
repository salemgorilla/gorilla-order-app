import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isSignsOrder } from "../lib/auto-bill";
import { chargeableTotal, getStickerTotals } from "../lib/tax";
import {
  classifyOrderFlow,
  isApparelProduct,
  isSignsProduct,
  isStickerFlow,
  maySignsAutoBill,
  namesStickers,
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
 * This enumerates every combination of a type string built from the
 * pipeline-naming substrings, four casings and six joiners, crossed with
 * each of the spec fields present or absent — and asserts the INVARIANTS
 * rather than the answers. An invariant survives a rewrite; a table of
 * expected outputs does not. The exact count is printed in the suite name
 * rather than written here, because a hand-typed count goes stale and this
 * file already shipped two wrong ones ("~3,000" here, "1,700+" in the PR,
 * against an actual 6,248).
 *
 * ── WHAT IT FOUND ─────────────────────────────────────────────────────────
 * Invariant 3, twice over, in the two halves of the same pair.
 *
 * FIRST: `{ type: "Vinyl Banners", signType: "Banner", garmentType: "Tee" }`
 * was SHAPED as apparel and still cleared the SIGNS auto-bill gate, so an
 * apparel-shaped invoice acquired an automatic payment link — which
 * AGENTS.md forbids in as many words.
 *
 * SECOND, and only after "apparel" was added to the generator:
 * `{ type: "Custom Sticker Apparel" }` did the same through the STICKER
 * gate, which #192 left without the bail it gave signs. $99.00 charged
 * against a chargeable $104.25, the $15 setup row and the 6.25% both
 * missing from the invoice, and a prepress brief reading "100x Apparel /
 * Color: TBD / S&S style: N/A". The first fix shipped as coverage for the
 * second, which is the argument for sweeping over sampling stated twice in
 * one file.
 */

/**
 * THE GENERATOR IS THE TEST. Everything below asserts over whatever this
 * produces, so a word missing here is an invariant that cannot fail.
 *
 * "apparel" was absent from this list while being one of the three
 * pipelines, so it only ever appeared as a standalone base string and never
 * combined. Invariant 3 ("nothing shaped as apparel may auto-bill") was
 * therefore asserted over a space containing no apparel-and-sticker
 * payloads at all — it read as coverage for a defect that was live:
 * `{ type: "Custom Sticker Apparel" }` shaped as apparel, cleared the
 * STICKER billing gate, and charged $99.00 against a chargeable $104.25
 * with the $15 setup row and the 6.25% both gone from the invoice.
 *
 * Add a word here before adding an invariant about it.
 */
const SUBSTRINGS = [
  "sticker",
  "stickers",
  "decal",
  "signs",
  "sign",
  "banner",
  "banners",
  "apparel",
  "shirt",
];
const CASINGS: Array<(s: string) => string> = [
  (s) => s,
  (s) => s.toUpperCase(),
  (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
  (s) => s.replace(/\w/g, (c, i) => (i % 2 ? c.toUpperCase() : c)),
];
const JOINERS = [" ", " & ", "-", " / ", ", ", ""];

/** Type strings: each substring alone, and every ordered pair of them. */
function typeStrings(): string[] {
  const bases = new Set<string>(["", "Custom", "Poster", "Lead", "Hand Quote"]);

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

  test("5. a type naming BOTH stickers and signs never auto-bills", () => {
    /**
     * The clause `!typeText(product).includes("signs")` inside isStickerFlow
     * had NO test. Deleting it left the whole suite green — including this
     * sweep — while newly letting `{ type: "Sticker Signs" }` self-check-out,
     * which is the expensive direction.
     *
     * The old invariant 5 ("no order auto-bills down two flows at once")
     * could not catch it: maySignsAutoBill requires `signType` and
     * isStickerFlow requires `!signType`, so the two are disjoint by
     * construction and that assertion was unfalsifiable by any single-clause
     * change. This pins the clause that exists.
     *
     * DELIBERATELY "signs" AND NOT "sign"/"banner", which is what the clause
     * says. Writing the stricter rule instead made this fail on
     * `{ type: "Sticker Sign" }` and `{ type: "Custom Sticker Banners" }` —
     * and both of those are CONSISTENT: priced $99, invoiced $99, taxed on
     * the sticker base, exactly like a plain sticker order. #186 settled the
     * banners case on purpose. A test that fails on correct behaviour
     * because the rule it asserts is tidier than the rule the code
     * implements is a test that gets deleted, so this asserts the real one.
     */
    forEveryProduct(
      "a sticker/signs type cleared a billing gate",
      (product) => {
        const text = String(product.type ?? "").toLowerCase();
        const both = text.includes("sticker") && text.includes("signs");
        if (!both) return true;
        return !isStickerFlow(orderFor(product)) && !maySignsAutoBill(orderFor(product));
      }
    );
  });

  test("6. the charged figure is derived on the SAME flow the invoice uses", () => {
    /**
     * Replaces a tautology. The old invariant 6 asserted that
     * classifyOrderFlow returns one of its own three literal return values,
     * which `tsc` already guarantees and no mutation can break.
     *
     * This asserts something that WAS false: lib/tax.ts's chargeableTotal
     * carried a sixth copy of the flow rules with its own precedence — signs
     * tested before stickers, and no sticker bail — so a sticker-shaped
     * order could be taxed as a sign. 94c between the number the ceiling
     * gate reads and the number the card is charged.
     */
    const pricing = { stickerPrice: 84, setupPrice: 15, total: 99, lines: [] };

    forEveryProduct(
      "chargeableTotal disagrees with the flow the invoice is built on",
      (product) => {
        const order = { product, pricing };
        const charged = chargeableTotal(order as never);
        if (charged === null) return true; // "cannot derive" is a valid answer

        const shape = classifyOrderFlow(order as never);
        if (shape === "apparel") return charged === 99; // exempt, pre-tax
        if (shape === "signs") return charged > 99; // taxed, fees out of base
        // stickers: taxed on the sticker base, never the signs one
        return (
          Math.abs(charged - getStickerTotals({ stickerPrice: 84, setupPrice: 15, total: 99 }).estimatedTotal) < 0.005
        );
      }
    );
  });

  test("7. a payload with no product at all never auto-bills", () => {
    // AGENTS.md names this as the way stickers silently stop checking out:
    // buildQuotePayload must keep synthesising `product`, because without it
    // isStickerOrder() returns false. The inverse matters more — a payload
    // with no product must never be BILLED either, and the sweep could not
    // see it because every generated order has one.
    for (const order of [{}, { product: null }, { product: undefined }, { product: {} }]) {
      assert.equal(isStickerFlow(order as never), false, JSON.stringify(order));
      assert.equal(maySignsAutoBill(order as never), false, JSON.stringify(order));
    }
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
