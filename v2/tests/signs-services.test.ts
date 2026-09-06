/**
 * The website's adders as selectable services — Gabe, 2026-09-05: "if the
 * user selects that service, that cost should be added, and non-taxable."
 *
 *   rounded corners   $5 per sign     yard and rigid signs
 *   holes             $5 per sign     yard and rigid signs
 *   velcro            $1.50 / ft      banners — top, middle, bottom, sides, all
 *
 * Three things are pinned beyond the arithmetic. (1) They are FEES: kind
 * "addOn", out of the taxable base on the estimate and taxed:false on the
 * invoice, on the one-design path and the cart path alike. (2) The server
 * reprices the same sign the browser priced — the spec carries the
 * selections, or the customer would be quoted one number and invoiced
 * another. (3) Nothing is charged by default: rigid signs used to default
 * to "Drilled Holes" as a free finishing, and turning that into a $5
 * service must not turn every rigid quote into a $5-per-sign surcharge.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { createSignsDesign, defaultSignsDesign, getSignProduct, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { calculateSignsPricing } from "../lib/signs-pricing";
import { signsPricingConfig } from "../lib/signs-pricing-config";
import { repriceSigns } from "../lib/signs-repricing";
import { getSignsTotals } from "../lib/tax";

const YARD: SignsDesign = {
  ...defaultSignsDesign,
  id: "y",
  productId: "yard-sign",
  quantity: 10,
  size: '18" x 24"',
  material: "Coroplast",
  finishing: "Signs Only",
};

const RIGID: SignsDesign = {
  ...defaultSignsDesign,
  id: "r",
  productId: "rigid-sign",
  quantity: 4,
  size: '18" x 24"',
  material: 'PVC 1/8"',
  finishing: "Standard",
};

const BANNER: SignsDesign = {
  ...defaultSignsDesign,
  id: "b",
  productId: "vinyl-banner",
  quantity: 2,
  size: "3' x 6'",
};

describe("the figures are the decision", () => {
  test("$5 per sign for corners and holes, $1.50 a foot for velcro", () => {
    assert.equal(signsPricingConfig.signAddOns.roundedCorners.perSign, 5);
    assert.equal(signsPricingConfig.signAddOns.holes.perSign, 5);
    assert.equal(signsPricingConfig.velcro.perLinearFoot, 1.5);
  });
});

describe("per sign, on yard and rigid signs", () => {
  test("ten yard signs with rounded corners: +$50", () => {
    const plain = quoteSignsCart([YARD]).total;
    const cornered = quoteSignsCart([{ ...YARD, signAddOns: ["roundedCorners"] }]);
    const line = cornered.lines.find((l) => l.code === "ADDON-ROUNDEDCORNERS");

    assert.equal(cornered.total - plain, 50);
    assert.ok(line);
    assert.equal(line.amount, 50);
    assert.equal(line.kind, "addOn");
    assert.match(line.label, /10 × \$5/);
  });

  test("four rigid signs with holes AND corners: +$40", () => {
    const plain = quoteSignsCart([RIGID]).total;
    const both = quoteSignsCart([{ ...RIGID, signAddOns: ["holes", "roundedCorners"] }]);

    assert.equal(Math.round((both.total - plain) * 100) / 100, 40);
    assert.equal(both.lines.filter((l) => l.kind === "addOn").length, 2);
  });

  test("a banner ignores sign add-on keys — no product, no charge", () => {
    // A stale key from a product switch must not bill for work not offered.
    const plain = quoteSignsCart([BANNER]).total;
    const stale = quoteSignsCart([{ ...BANNER, signAddOns: ["holes"] }]).total;

    assert.equal(stale, plain);
  });

  test("nothing is charged by default — rigid no longer defaults to paid holes", () => {
    const rigid = getSignProduct("rigid-sign");

    assert.deepEqual(rigid.finishing, ["Standard"]);
    assert.deepEqual(createSignsDesign().signAddOns, []);
    assert.equal(createSignsDesign().velcro, "");
  });
});

describe("velcro, by the foot of the edges chosen", () => {
  // 3' x 6' banner: width 6 ft, height 3 ft.
  const feet = (velcro: string) => {
    const priced = calculateSignsPricing({
      method: "banner",
      quantity: 1,
      widthInches: 72,
      heightInches: 36,
      material: "13 oz Scrim Vinyl",
      doubleSided: false,
      velcro,
    });
    const line = priced.lines.find((l) => l.code?.startsWith("ADDON-VELCRO"));

    return line ? line.amount / 1.5 : 0;
  };

  test("top, middle, bottom: the width", () => {
    assert.equal(feet("top"), 6);
    assert.equal(feet("middle"), 6);
    assert.equal(feet("bottom"), 6);
  });

  test("sides: both heights", () => {
    assert.equal(feet("sides"), 6);
  });

  test("all: three widths and two heights", () => {
    assert.equal(feet("all"), 24);
  });

  test("none, or an unknown placement, prices nothing", () => {
    assert.equal(feet(""), 0);
    assert.equal(feet("diagonal"), 0);
  });

  test("times the quantity, as its own untaxed line", () => {
    const quote = quoteSignsCart([{ ...BANNER, velcro: "all" }]);
    const line = quote.lines.find((l) => l.code === "ADDON-VELCRO-ALL");

    assert.ok(line);
    assert.equal(line.amount, 72, "24 ft × $1.50 × 2 banners");
    assert.equal(line.kind, "addOn");
    assert.match(line.label, /all of the above/);
  });
});

describe("they are fees: untaxed on the estimate and on the invoice", () => {
  function planFor(designs: SignsDesign[], family: "signs" | "banners") {
    const pricing = quoteSignsCart(designs);
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "TEST-SVC",
      order: {
        customer: { customerName: "Test", email: "test@example.com" },
        production: { needBy: "2026-10-14" },
        ...buildSignsPayloadParts(designs, pricing, family),
      },
      artworkAnalysis: null,
    });
    const invoice =
      plan.lineItems.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0) +
      plan.feeLineItems.reduce((s, f) => s + f.price, 0);
    const invoiceBase =
      (plan.salesTaxRate !== null
        ? plan.lineItems.reduce((s, l) => s + l.price * Math.max(1, l.quantity), 0)
        : 0) + plan.feeLineItems.filter((f) => f.taxed).reduce((s, f) => s + f.price, 0);

    return {
      pricing,
      plan,
      invoice: Math.round(invoice * 100) / 100,
      invoiceBase: Math.round(invoiceBase * 100) / 100,
    };
  }

  const cases: Array<[string, SignsDesign[], "signs" | "banners", string]> = [
    ["one design, corners", [{ ...YARD, signAddOns: ["roundedCorners"] }], "signs", "GORILLA-SIGN-ADDON-ROUNDEDCORNERS"],
    ["one design, velcro", [{ ...BANNER, velcro: "top" }], "banners", "GORILLA-SIGN-ADDON-VELCRO-TOP"],
    ["a cart, holes on design 2", [YARD, { ...RIGID, signAddOns: ["holes"] }], "signs", "GORILLA-SIGN-ADDON-HOLES"],
    ["a cart, velcro on design 1", [{ ...BANNER, velcro: "sides" }, { ...BANNER, id: "b2" }], "banners", "GORILLA-SIGN-ADDON-VELCRO-SIDES"],
  ];

  for (const [name, designs, family, sku] of cases) {
    test(`${name}: ${sku} arrives untaxed, invoice equals quote, bases agree`, () => {
      const { pricing, plan, invoice, invoiceBase } = planFor(designs, family);
      const line = plan.feeLineItems.find((f) => f.itemNumber === sku);

      assert.ok(line, `${sku} did not reach Printavo`);
      assert.equal(line.taxed, false, "a service is a fee, and fees are untaxed");
      assert.equal(invoice, pricing.total);
      assert.equal(
        getSignsTotals({ total: pricing.total, feeTotal: pricing.feeTotal }).taxableSubtotal,
        invoiceBase
      );
    });
  }
});

describe("the server reprices the same sign", () => {
  test("the spec carries the selections and the server agrees to the cent", () => {
    const designs: SignsDesign[] = [
      { ...YARD, signAddOns: ["holes", "roundedCorners"] },
      { ...BANNER, id: "b3", velcro: "all" },
    ];
    // A mixed cart never happens in the app (hard split) but is the
    // strongest round-trip: both kinds of service in one payload.
    const cart = quoteSignsCart(designs);
    const payload = {
      customer: { customerName: "Test", email: "test@example.com" },
      production: { needBy: "2026-10-14" },
      ...buildSignsPayloadParts(designs, cart, "signs"),
    };

    const repriced = repriceSigns(payload as never);

    assert.equal(repriced.mismatch, false, "server and browser priced different signs");
    assert.equal(repriced.serverTotal, cart.total);
    assert.ok(cart.lines.some((l) => l.code === "ADDON-HOLES"));
    assert.ok(cart.lines.some((l) => l.code === "ADDON-VELCRO-ALL"));
  });
});
