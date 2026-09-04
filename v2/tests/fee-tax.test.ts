/**
 * All fees are non-taxable (Gabe, 2026-09-04), generalised from the rush
 * ruling the same day: setup, screens, finishing add-ons, rush and shipping
 * are labour and services stated separately from the goods, and
 * Massachusetts does not tax separately stated labour.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM tests/quote-totals ───────────────
 * Two systems decide tax and they are not the same code: the ESTIMATE takes
 * a base out of lib/tax.ts and shows it to the customer, and the INVOICE is
 * Printavo computing from the rate plus a `taxed` flag on every line. Only
 * the invoice charges money. A change that moves one without the other is
 * invisible on screen and shows up as a different figure on the payment
 * page — and stickers pay that page with nobody in the loop.
 *
 * So these tests do not check the rule twice. They check that the two
 * systems agree, by deriving the taxable base from the real Printavo plan
 * and comparing it with the real estimate, to the cent.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { repriceStickers } from "../lib/sticker-repricing";
import { defaultSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { signsFeeTotal } from "../lib/signs-pricing";
import { getSignsTotals, getStickerTotals, SALES_TAX } from "../lib/tax";

type Plan = ReturnType<typeof buildPrintavoQuotePlan>;

/** What Printavo will actually tax: every line whose flag says so. */
function invoiceTaxableBase(plan: Plan): number {
  const goods = plan.salesTaxRate !== null ? plan.lineItems : [];
  const goodsTotal = goods.reduce(
    (sum, item) => sum + item.price * Math.max(1, item.quantity),
    0
  );
  const feeTotal = plan.feeLineItems
    .filter((fee) => fee.taxed)
    .reduce((sum, fee) => sum + fee.price, 0);
  // Shipping is never in it: separately stated shipping is untaxed in MA and
  // the line has always carried taxed:false.
  return Math.round((goodsTotal + feeTotal) * 100) / 100;
}

describe("stickers: the auto-billing flow's estimate matches its invoice", () => {
  /**
   * Priced by the SERVER's own repricing, not by a fixture: this is the flow
   * that bills without a human, so the numbers here have to be the ones the
   * money path produces. Two designs, pickup — the canonical release-check
   * order.
   */
  const priced = repriceStickers({
    customer: { customerName: "Test", email: "test@example.com" },
    production: { deliveryMethod: "Pickup" },
    product: { type: "Custom Stickers", quantity: 150 },
    items: [
      { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte" },
      { id: "d2", quantity: 50, widthInches: 2, heightInches: 2, material: "Matte" },
    ],
    pricing: { total: 0 },
  });

  const pricing = priced.order.pricing as {
    stickerPrice: number;
    setupPrice: number;
    total: number;
  };

  const plan = buildPrintavoQuotePlan({
    quoteNumber: "TEST-FEE-1",
    order: priced.order,
    artworkAnalysis: null,
  });

  test("setup is billed, and billed untaxed", () => {
    const setup = plan.feeLineItems.filter(
      (fee) => fee.itemNumber === "GORILLA-DECAL-SETUP"
    );

    assert.equal(setup.length, 1);
    assert.equal(setup[0].price, pricing.setupPrice, "the fee must still be CHARGED");
    assert.ok(setup[0].price > 0);
    assert.equal(setup[0].taxed, false, "…and must not be taxed");
  });

  test("the estimate's base is the invoice's base, to the cent", () => {
    assert.equal(
      getStickerTotals(pricing).taxableSubtotal,
      invoiceTaxableBase(plan)
    );
  });

  test("the decals alone are the base — setup is out of it", () => {
    const totals = getStickerTotals(pricing);

    assert.equal(totals.taxableSubtotal, pricing.stickerPrice);
    assert.ok(pricing.setupPrice > 0, "the order must actually carry setup");
    assert.equal(
      totals.estimatedTotal,
      Math.round((pricing.total + totals.estimatedTax) * 100) / 100
    );
  });

  test("the rate still reaches Printavo — the flow is taxable, not exempt", () => {
    // Untaxing the fees must never be implemented by untaxing the QUOTE.
    assert.equal(plan.salesTaxRate, SALES_TAX.ratePercent);
  });
});

describe("signs: fees out of the base on both sides", () => {
  const YARD: SignsDesign = {
    ...defaultSignsDesign,
    productId: "yard-sign",
    quantity: 25,
    size: '18" x 24"',
  };

  const BANNER_WITH_ADDONS: SignsDesign = {
    ...defaultSignsDesign,
    id: "design-2",
    productId: "vinyl-banner",
    quantity: 2,
    size: "3' x 6'",
    bannerAddOns: ["polePockets"],
  };

  function planFor(designs: SignsDesign[]) {
    const pricing = quoteSignsCart(designs);

    return {
      pricing,
      plan: buildPrintavoQuotePlan({
        quoteNumber: "TEST-FEE-2",
        order: {
          customer: { customerName: "Test", email: "test@example.com" },
          production: { needBy: "2026-10-14" },
          ...buildSignsPayloadParts(designs, pricing, "signs"),
        },
        artworkAnalysis: null,
      }),
    };
  }

  for (const [name, designs] of [
    ["one design", [YARD]],
    ["one banner with finishing", [BANNER_WITH_ADDONS]],
    ["a cart", [YARD, BANNER_WITH_ADDONS]],
  ] as const) {
    test(`${name}: the estimate's base equals the invoice's`, () => {
      const { pricing, plan } = planFor([...designs]);
      const estimate = getSignsTotals({
        total: pricing.total,
        feeTotal: pricing.feeTotal,
      });

      assert.equal(
        estimate.taxableSubtotal,
        invoiceTaxableBase(plan),
        "the customer would meet a different tax on the invoice"
      );
    });

    test(`${name}: setup is charged and untaxed`, () => {
      const { plan } = planFor([...designs]);
      const setup = plan.feeLineItems.filter((fee) =>
        fee.itemNumber.includes("SETUP")
      );

      assert.equal(setup.length, 1);
      assert.ok(setup[0].price > 0);
      assert.equal(setup[0].taxed, false);
    });
  }

  test("finishing add-ons are fees on one design AND on a cart", () => {
    // The shape that made this worth pinning: a cart's add-ons are rebuilt
    // from the DESIGNS rather than read off the tagged line list, so the tag
    // has to be restated there. Untagged, pole pockets would be taxed on a
    // two-design quote and untaxed on a one-design quote — the same charge,
    // two answers.
    for (const designs of [[BANNER_WITH_ADDONS], [YARD, BANNER_WITH_ADDONS]]) {
      const { plan } = planFor(designs);
      const addOns = plan.feeLineItems.filter((fee) =>
        /POLE|ADDON/.test(fee.itemNumber)
      );

      assert.equal(addOns.length, 1, "the add-on line went missing");
      assert.equal(addOns[0].taxed, false);
    }
  });

  test("step stakes are GOODS, and stay taxed", () => {
    /**
     * Not everything Printavo files as a fee line IS a fee. On a one-design
     * quote the fee list is "every line after the product", which sweeps up
     * step stakes and sewn construction — physical things bolted to the
     * sign. Only the tagged kinds (setup, addOn, rush) are fees; the rest
     * stay taxable, on both sides, which is why signsFeeTotal and the
     * invoice read the same SIGNS_FEE_KINDS.
     */
    const staked: SignsDesign = {
      ...YARD,
      finishing: "With Step Stakes",
    };
    const { pricing, plan } = planFor([staked]);

    const stakes = plan.feeLineItems.filter((fee) =>
      /STAKE/i.test(fee.description)
    );

    assert.equal(stakes.length, 1, "step stakes should be their own line");
    assert.equal(stakes[0].taxed, true, "stakes are goods, not labour");

    // And the estimate agrees, because both sides sum the same kinds.
    assert.equal(
      getSignsTotals({ total: pricing.total, feeTotal: pricing.feeTotal })
        .taxableSubtotal,
      invoiceTaxableBase(plan)
    );
  });

  test("signsFeeTotal counts the tagged kinds and nothing else", () => {
    const lines = [
      { label: "25 × yard signs", amount: 310 },
      { label: "Step stakes", amount: 62.5 },
      { label: "Pole pockets", amount: 30, kind: "addOn" as const },
      { label: "Setup fee (per design)", amount: 15, kind: "setup" as const },
      { label: "Rush scheduling", amount: 104.38, kind: "rush" as const },
    ];

    assert.equal(signsFeeTotal(lines), 149.38);
  });
});

describe("apparel is exempt outright, fees included", () => {
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "TEST-FEE-3",
    order: {
      customer: { customerName: "Test", email: "test@example.com" },
      production: { needBy: "2026-10-14" },
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "T-Shirts",
        quantity: 24,
        supplier: { source: "S&S Activewear" },
      },
      pricing: {
        total: 480,
        garmentTotal: 300,
        printTotal: 120,
        setupTotal: 60,
        printUnitPrice: 5,
      },
    },
    artworkAnalysis: null,
  });

  test("no rate on the quote at all", () => {
    assert.equal(plan.salesTaxRate, null);
  });

  test("printing and screens say untaxed rather than relying on that", () => {
    // Belt and braces on purpose: the flag is what a human reads in
    // Printavo's UI, and "taxable" next to an exempt total is misleading.
    for (const sku of ["GORILLA-APPAREL-PRINT", "GORILLA-APPAREL-SETUP"]) {
      const line = plan.feeLineItems.find((fee) => fee.itemNumber === sku);

      assert.ok(line, `${sku} missing`);
      assert.equal(line.taxed, false);
    }
  });
});
