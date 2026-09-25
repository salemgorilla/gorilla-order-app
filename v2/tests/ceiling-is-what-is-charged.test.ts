/**
 * THE CEILING GOVERNS WHAT THE CARD IS CHARGED.
 *
 * ── THE BAND THAT WAS OVER-CHARGED ────────────────────────────────────────
 * Both auto-bill gates tested `serverTotal`, which is PRE-TAX — tax is
 * Printavo's to compute. But createPaymentRequest sends no amount, so
 * Printavo bills its own `amountOutstanding`, which INCLUDES tax.
 *
 * So an order quoting $4,999.00 was charged $5,308.38 IN FULL, unattended:
 * $308 over a ceiling whose entire purpose is to stop an unattended charge
 * getting that big. Every order quoting roughly $4,705–$4,999.99 pre-tax
 * sat in that band.
 *
 * Gabe, 2026-09-25, asked which figure the $4,999.99 governs: "the amount
 * charged (incl. tax)". Nothing is auto-charged above the ceiling.
 *
 * The deposit AMOUNT was never wrong — it is a fraction of Printavo's own
 * amountOutstanding, per AGENTS.md. Only the DECISION used the wrong unit.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  decideStickersAutoBill,
  DEPOSIT_FRACTION,
  FULL_PAYMENT_CEILING,
} from "../lib/auto-bill";
import { chargeableTotal } from "../lib/tax";

/** stickerPrice is the taxable base; setup and shipping are untaxed. */
function stickerOrder(stickerPrice: number, setupPrice = 15, shippingPrice = 0) {
  const total =
    Math.round((stickerPrice + setupPrice + shippingPrice) * 100) / 100;

  return {
    product: { type: "Custom Stickers", quantity: 1000 },
    items: [{ id: "d", type: "Custom Stickers", quantity: 1000 }],
    pricing: { total, stickerPrice, setupPrice, shippingPrice },
  };
}

const decide = (order: ReturnType<typeof stickerOrder>) =>
  decideStickersAutoBill({
    order: order as never,
    unpriceable: false,
    serverTotal: order.pricing.total,
    kioskSession: false,
    printavoCreated: true,
  });

describe("nothing is auto-charged above the ceiling", () => {
  test("the order that was charged $5,308 in full now takes a deposit", () => {
    // $4,950 of vinyl + $15 setup + $34 shipping = $4,999.00 pre-tax,
    // which is under $4,999.99 — and $5,308.38 once Printavo adds tax.
    const order = stickerOrder(4950, 15, 34);

    assert.equal(order.pricing.total, 4999);
    assert.equal(chargeableTotal(order), 5308.38);
    assert.equal(decide(order).deposit, true, "still charged $5,308 in full");
  });

  test("the whole pre-tax band above ~$4,705 deposits", () => {
    /**
     * The band is where the pre-tax total is under the ceiling and the
     * charged total is over it. Swept rather than sampled, because the
     * boundary is the point.
     */
    for (let goods = 4700; goods <= 4999; goods += 1) {
      const order = stickerOrder(goods, 0, 0);
      const charged = chargeableTotal(order);

      assert.ok(charged !== null);
      if (charged > FULL_PAYMENT_CEILING) {
        assert.equal(
          decide(order).deposit,
          true,
          `$${goods} pre-tax is charged $${charged.toFixed(2)} and was billed in full`
        );
      }
    }
  });

  test("an order under the ceiling AS CHARGED still bills in full", () => {
    // The fix must not start asking ordinary orders for a deposit.
    const order = stickerOrder(1000, 15, 20);

    assert.equal(decide(order).bill, true);
    assert.equal(decide(order).deposit, false);
  });

  test("the reference pack is untouched", () => {
    const order = stickerOrder(84, 15, 0);

    assert.equal(decide(order).deposit, false);
    assert.equal(chargeableTotal(order), 104.25);
  });
});

describe("the fallback cannot let an over-ceiling order through", () => {
  test("an underivable flow falls back to the pre-tax total", () => {
    // A payload whose flow this cannot derive a taxable base for. The
    // pre-tax total is never LARGER than the taxed one, so falling back
    // can only ask for a deposit that was not needed — never skip one.
    const odd = {
      product: { type: "Custom Stickers", quantity: 1 },
      items: [{ id: "d", type: "Custom Stickers", quantity: 1 }],
      pricing: { total: 6000 },
    };

    assert.equal(
      decideStickersAutoBill({
        order: odd as never,
        unpriceable: false,
        serverTotal: 6000,
        kioskSession: false,
        printavoCreated: true,
      }).deposit,
      true
    );
  });

  test("apparel is exempt, so its charge is its pre-tax total", () => {
    const apparel = {
      product: { type: "Custom Apparel", supplier: "S&S", garmentType: "Tee" },
      pricing: { total: 4999 },
    };

    assert.equal(chargeableTotal(apparel), 4999);
  });
});

describe("the money rule itself is unchanged", () => {
  test("the ceiling and the fraction are still the numbers Gabe named", () => {
    assert.equal(FULL_PAYMENT_CEILING, 4999.99);
    assert.equal(DEPOSIT_FRACTION, 0.5);
  });

  test("the reason names the figure that was actually tested", () => {
    // A reason quoting the pre-tax total beside a taxed ceiling is how the
    // next reader concludes the gate is broken when it is not.
    const order = stickerOrder(4950, 15, 34);

    assert.match(decide(order).reason, /5308\.38/);
    assert.doesNotMatch(decide(order).reason, /4999\.00/);
  });
});
