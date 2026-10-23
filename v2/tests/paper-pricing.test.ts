/**
 * Paper price = 4over cost + the shop's markup, or no price.
 *
 * The point of these tests is the REFUSALS: every way a missing number could
 * quietly become a price of $0 or a sale at cost.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defaultPaperSpec, type PaperSpec } from "../lib/paper";
import {
  paperPricingConfig,
  type PaperPricingConfig,
} from "../lib/paper-pricing-config";
import { isPaperPriced, paperCostKey, priceForPaper } from "../lib/paper-pricing";

const SPEC: PaperSpec = {
  ...defaultPaperSpec("business-cards"),
  size: '3.5" x 2"',
  stock: "14pt Matte",
  sides: "Double-sided",
  quantity: 500,
};

const KEY = paperCostKey(SPEC);

const config = (over: Partial<PaperPricingConfig> = {}): PaperPricingConfig => ({
  pricesConfirmed: true,
  markup: { default: 0.5, byProduct: {} },
  costs: { [KEY]: 20 },
  finishingCosts: {},
  ...over,
});

describe("the shipped configuration prices nothing", () => {
  test("no real option has a price until Gabe's 4over costs are entered", () => {
    assert.equal(paperPricingConfig.pricesConfirmed, false);
    assert.deepEqual(paperPricingConfig.costs, {});
    assert.equal(isPaperPriced(SPEC), false);
    assert.equal(priceForPaper(SPEC).ok, false);
  });
});

describe("cost plus markup", () => {
  test("sell is cost times (1 + markup), to the cent", () => {
    const price = priceForPaper(SPEC, config());

    assert.deepEqual(price, { ok: true, cost: 20, markup: 0.5, sell: 30 });
  });

  test("rounds to cents, not to a guess", () => {
    const price = priceForPaper(SPEC, config({ costs: { [KEY]: 21.85 }, markup: { default: 0.35, byProduct: {} } }));

    assert.equal(price.ok && price.sell, 29.5);
  });

  test("a product markup overrides the default", () => {
    const price = priceForPaper(
      SPEC,
      config({ markup: { default: 0.5, byProduct: { "business-cards": 1 } } })
    );

    assert.equal(price.ok && price.sell, 40);
  });

  test("finishing adds its own 4over cost before the markup", () => {
    const spec = { ...SPEC, finishing: ["Rounded corners"] };
    const price = priceForPaper(
      spec,
      config({
        costs: { [paperCostKey(spec)]: 20 },
        finishingCosts: { "business-cards|Rounded corners": 5 },
      })
    );

    assert.deepEqual(price, { ok: true, cost: 25, markup: 0.5, sell: 37.5 });
  });

  test("the key is the whole option, so another size or run is a different price", () => {
    assert.notEqual(paperCostKey(SPEC), paperCostKey({ ...SPEC, quantity: 1000 }));
    assert.notEqual(paperCostKey(SPEC), paperCostKey({ ...SPEC, sides: "Single-sided" }));
    assert.notEqual(paperCostKey(SPEC), paperCostKey({ ...SPEC, stock: "14pt Gloss" }));
  });
});

describe("every way a missing number is refused", () => {
  test("prices not confirmed, whatever the table holds", () => {
    const result = priceForPaper(SPEC, config({ pricesConfirmed: false }));
    assert.deepEqual(result, { ok: false, reason: "paper prices are not confirmed" });
  });

  test("no cost for the option", () => {
    assert.equal(priceForPaper(SPEC, config({ costs: {} })).ok, false);
  });

  test("a $0, negative or non-numeric cost is not a cost", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(priceForPaper(SPEC, config({ costs: { [KEY]: bad } })).ok, false, String(bad));
    }
  });

  test("no markup is set: it does not quietly sell at cost", () => {
    const result = priceForPaper(SPEC, config({ markup: { default: null, byProduct: {} } }));
    assert.deepEqual(result, { ok: false, reason: "no markup has been set" });
  });

  test("a negative markup is refused", () => {
    assert.equal(priceForPaper(SPEC, config({ markup: { default: -0.1, byProduct: {} } })).ok, false);
  });

  test("ticked finishing with no cost is a quote request, not a free extra", () => {
    const spec = { ...SPEC, finishing: ["Rounded corners"] };
    const result = priceForPaper(spec, config({ costs: { [paperCostKey(spec)]: 20 } }));

    assert.deepEqual(result, { ok: false, reason: "no 4over cost for Rounded corners" });
  });

  test("an unknown product is refused", () => {
    assert.equal(priceForPaper({ ...SPEC, productId: "banners" as never }, config()).ok, false);
  });
});
