/**
 * A rushed SIGNS quote has to reach Printavo as the number the customer was
 * shown. It did not.
 *
 * Rush shipped (#106) computing the fee in the browser, adding it to the
 * total every surface reads, and adding a row to `pricing.lines`. Apparel's
 * payload spreads the whole pricing object, so its `rushFee` travelled and
 * lib/printavo.ts billed it under GORILLA-RUSH, untaxed. The signs payload
 * builds its pricing block field by field and did not copy `rushFee` — so
 * the SAME charge went two different wrong ways:
 *
 *   one design   `lines.slice(1)` swept the untagged rush row into the fee
 *                list, billing it as GORILLA-SIGN-RUSH-SCHEDULING **with tax
 *                on it** — $25.59 of tax against the $20.47 quoted.
 *   a cart       the fee sweep takes only setup and per-design add-ons, so
 *                rush was in no list at all: $655.00 invoiced against
 *                $818.75 quoted, $163.75 short.
 *
 * Neither was visible on screen: the website total was right in both cases.
 * The invoice was the only place the disagreement existed, which is exactly
 * the shape AGENTS.md warns about — verified here by driving the real
 * payload builder and the real Printavo plan, not by reading them.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { applyRush, RUSH_LINE_LABEL } from "../lib/rush";
import { defaultSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";

const YARD: SignsDesign = {
  ...defaultSignsDesign,
  productId: "yard-sign",
  quantity: 25,
  size: '18" x 24"',
};

/** Exactly what app/page.tsx's signs pricing memo produces on a rush date. */
function rushedQuote(designs: SignsDesign[]) {
  const quote = quoteSignsCart(designs);
  const rush = applyRush({
    goodsSubtotal: quote.total,
    needBy: "2026-09-17",
    lane: "slow",
    today: "2026-09-04",
  });

  assert.equal(rush.isRush, true, "the fixture date must actually be a rush");

  return {
    ...quote,
    lines: [
      ...quote.lines,
      {
        label: RUSH_LINE_LABEL,
        amount: rush.fee,
        kind: "rush" as const,
        code: "RUSH",
      },
    ],
    total: Math.round((quote.total + rush.fee) * 100) / 100,
    rushFee: rush.fee,
  };
}

function planFor(designs: SignsDesign[]) {
  const pricing = rushedQuote(designs);

  return {
    pricing,
    plan: buildPrintavoQuotePlan({
      quoteNumber: "TEST-RUSH-1",
      order: {
        customer: { customerName: "Test", email: "test@example.com" },
        production: { needBy: "2026-09-17" },
        ...buildSignsPayloadParts(designs, pricing, "signs"),
      },
      artworkAnalysis: null,
    }),
  };
}

/** What Printavo will actually bill: goods plus fees, before tax. */
function invoiceSubtotal(plan: ReturnType<typeof planFor>["plan"]) {
  const goods = plan.lineItems.reduce(
    (sum, item) => sum + item.price * Math.max(1, item.quantity),
    0
  );
  const fees = plan.feeLineItems.reduce((sum, fee) => sum + fee.price, 0);

  return Math.round((goods + fees) * 100) / 100;
}

describe("a rushed signs quote invoices for what it quoted", () => {
  test("one design: $409.38 quoted, $409.38 invoiced", () => {
    const { pricing, plan } = planFor([YARD]);

    assert.equal(pricing.total, 409.38);
    assert.equal(invoiceSubtotal(plan), 409.38);
  });

  test("two designs: $818.75 quoted, $818.75 invoiced — was $655.00", () => {
    const { pricing, plan } = planFor([YARD, { ...YARD, id: "design-2" }]);

    assert.equal(pricing.total, 818.75);
    assert.equal(invoiceSubtotal(plan), 818.75);
  });
});

describe("rush is one line, one SKU, untaxed", () => {
  for (const [name, designs] of [
    ["one design", [YARD]],
    ["a cart", [YARD, { ...YARD, id: "design-2" }]],
  ] as const) {
    test(`${name}: exactly one rush line, and it is GORILLA-RUSH`, () => {
      const { pricing, plan } = planFor([...designs]);

      const rushLines = plan.feeLineItems.filter(
        (fee) =>
          fee.itemNumber === "GORILLA-RUSH" ||
          /rush/i.test(fee.description) ||
          fee.itemNumber.includes("RUSH")
      );

      assert.equal(rushLines.length, 1, "billed twice, or not at all");
      assert.equal(rushLines[0].itemNumber, "GORILLA-RUSH");
      assert.equal(rushLines[0].price, pricing.rushFee);
      // Labour, not goods (Gabe, 2026-09-04). The estimate takes it out of
      // the taxable base, so the invoice must too or the two disagree by
      // 6.25% of the rush fee.
      assert.equal(rushLines[0].taxed, false);
    });
  }

  test("the setup fee still bills once, under its stable SKU", () => {
    // Guard against a fix that drops rush by dropping the fee sweep.
    const { plan } = planFor([YARD, { ...YARD, id: "design-2" }]);
    const setup = plan.feeLineItems.filter(
      (fee) => fee.itemNumber === "GORILLA-SIGN-SETUP"
    );

    assert.equal(setup.length, 1);
    assert.equal(setup[0].price, 30);
  });
});

describe("the browser still tags the line it sends", () => {
  /**
   * The composition above lives in app/page.tsx's pricing memo, which a
   * node test cannot mount. Everything downstream finds rush by `kind`, so
   * an untagged line would restore the double-bill with every test here
   * still green — pin the tag at its source.
   */
  test("app/page.tsx marks the rush row kind: rush", () => {
    const source = readFileSync(
      new URL("../app/page.tsx", import.meta.url),
      "utf8"
    );

    assert.match(source, /label: RUSH_LINE_LABEL,\s*\n\s*amount: rush\.fee,/);
    assert.match(source, /kind: "rush" as const,/);
  });
});
