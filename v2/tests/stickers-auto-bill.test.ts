/**
 * THE STICKERS MONEY GATE.
 *
 * Stickers have raised a LIVE PAYABLE LINK on submit, with no human in the
 * loop, since the app went live. Until 7 Sep the decision was a boolean in
 * the route — not a kiosk, priceable, a sticker order, Printavo answered —
 * with no ceiling and no reason attached. It is now decideStickersAutoBill()
 * in lib/auto-bill.ts, beside the signs decision, and this file is the
 * pressure on it, exactly as signs-auto-bill.test.ts is on its sibling.
 *
 * Every test below is a way a customer could be billed for something nobody
 * priced, or for more than Gabe wants taken unattended. Each guard is
 * asserted to fail CLOSED: withholding a link costs a follow-up email, raising
 * a wrong one costs a refund and the customer's trust.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SELF_CHECKOUT_CEILING,
  decideSignsAutoBill,
  decideStickersAutoBill,
} from "../lib/auto-bill";
import { isStickerOrder, repriceStickers } from "../lib/sticker-repricing";

/** A sticker cart in the shape the browser really posts. */
function stickerOrder(
  items: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {}
) {
  return {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: { deliveryMethod: "Pickup" },
    // Both halves matter: isStickerOrder() reads product.type, and
    // repriceStickers reads items. A payload with one and not the other is a
    // shape this route has shipped bugs over.
    product: {
      type: "Custom Stickers",
      ...items[0],
      quantity: items.reduce((sum, i) => sum + Number(i.quantity), 0),
    },
    items,
    pricing: { total: 0 },
    ...extra,
  };
}

function design(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    quantity: 100,
    widthInches: 3,
    heightInches: 3,
    material: "Matte",
    shape: "Die Cut",
    ...overrides,
  };
}

/** Run the real route composition: reprice, then decide. */
function decideFor(
  order: Record<string, unknown>,
  overrides: Partial<Parameters<typeof decideStickersAutoBill>[0]> = {}
) {
  const priced = repriceStickers(order);

  return decideStickersAutoBill({
    order: priced.order,
    unpriceable: priced.unpriceable,
    serverTotal: priced.serverTotal,
    kioskSession: false,
    printavoCreated: true,
    ...overrides,
  });
}

describe("a real sticker order bills", () => {
  for (const [name, order] of [
    ["one design", stickerOrder([design()])],
    ["a two-design cart", stickerOrder([design(), design({ id: "d2", quantity: 250 })])],
    [
      "a shipped order",
      stickerOrder([design()], { production: { deliveryMethod: "Ship" } }),
    ],
  ] as Array<[string, Record<string, unknown>]>) {
    test(name, () => {
      const decision = decideFor(order);
      assert.equal(decision.bill, true, decision.reason);
    });
  }
});

describe("the gate reads isStickerOrder, and only that", () => {
  /**
   * The classifier stays in lib/sticker-repricing.ts because it also
   * decides what gets repriced against the sticker table. This file only
   * checks that the decision defers to it — it must never grow a looser
   * definition of "sticker" of its own.
   */
  test("a payload the classifier rejects never bills", () => {
    for (const order of [
      {},
      { product: {} },
      { product: { type: "Signs", signType: "Yard Signs", quantity: 10 } },
      {
        product: {
          type: "T-Shirts & Apparel",
          garmentType: "T-Shirts",
          supplier: { productName: "Gildan 5000" },
        },
      },
    ]) {
      assert.equal(isStickerOrder(order), false, "fixture is a sticker order");

      const decision = decideStickersAutoBill({
        order,
        unpriceable: false,
        serverTotal: 50,
        kioskSession: false,
        printavoCreated: true,
      });

      assert.equal(decision.bill, false);
      assert.match(decision.reason, /not a sticker order/i);
    }
  });
});

describe("nothing bills at a price nobody set", () => {
  test("a design with no usable size does not bill", () => {
    // No dimensions and no size label: material prices at $0, the total is
    // the setup fee alone. This once raised a $25 link for 1,000 stickers.
    const order = stickerOrder([
      { id: "d1", quantity: 1000, material: "Matte", shape: "Die Cut" },
    ]);

    const priced = repriceStickers(order);
    assert.equal(priced.unpriceable, true, "fixture is no longer unpriceable");

    const decision = decideFor(order);

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /no usable size/i);
  });

  test("a zero total does not bill", () => {
    const decision = decideFor(stickerOrder([design()]), { serverTotal: 0 });
    assert.equal(decision.bill, false);
  });
});

describe("Gabe's ceiling covers stickers", () => {
  /**
   * The first time stickers have had one. Signs got a $1,500 ceiling on the
   * morning of 7 Sep; that afternoon Gabe set ONE ceiling for everything
   * that self-checks-out, at $5,000, and this is the sticker half of it.
   * Before this, a sticker cart of any size raised a live link.
   */
  test("it is the same constant signs read", () => {
    assert.equal(SELF_CHECKOUT_CEILING, 5000);

    // Not two constants that happen to agree today: the SAME rule fires at
    // the same figure on both flows. If either gate ever grows a ceiling of
    // its own, these two decisions stop matching.
    const stickers = decideFor(stickerOrder([design()]), {
      serverTotal: SELF_CHECKOUT_CEILING + 0.01,
    });
    const signs = decideSignsAutoBill({
      order: { product: { type: "Vinyl Banners", signType: "Vinyl Banner" } },
      repriced: true,
      unpriceable: false,
      serverTotal: SELF_CHECKOUT_CEILING + 0.01,
      kioskSession: false,
      printavoCreated: true,
    });

    assert.equal(stickers.bill, false);
    assert.equal(signs.bill, false);
    assert.equal(stickers.reason, signs.reason);
  });

  test("at the ceiling, it still bills", () => {
    const decision = decideFor(stickerOrder([design()]), {
      serverTotal: SELF_CHECKOUT_CEILING,
    });
    assert.equal(decision.bill, true, decision.reason);
  });

  test("a cent over it, the shop invoices by hand", () => {
    const decision = decideFor(stickerOrder([design()]), {
      serverTotal: SELF_CHECKOUT_CEILING + 0.01,
    });

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /ceiling/i);
    // The figure, so the shop does not have to work out which rule fired.
    assert.match(decision.reason, /\$5000\.01/);
  });

  test("a genuinely large order is over it", () => {
    // Not a contrived number: ten thousand 5" stickers, priced by the real
    // engine, come to four figures — and before today would have billed.
    const order = stickerOrder([
      design({ quantity: 10000, widthInches: 5, heightInches: 5 }),
    ]);

    const priced = repriceStickers(order);
    assert.ok(
      priced.serverTotal > SELF_CHECKOUT_CEILING,
      `fixture is under the ceiling at $${priced.serverTotal}`
    );

    const decision = decideFor(order);

    assert.equal(decision.bill, false, "a five-figure order billed unattended");
    assert.match(decision.reason, /ceiling/i);
  });

  test("and a large order under it still bills", () => {
    // The ceiling is a blast radius, not a pricing rule. A real wholesale
    // order under it must go on paying online, or the ceiling has quietly
    // become a "stickers over $X are hand-quoted" policy nobody chose.
    const order = stickerOrder([design({ quantity: 10000 })]);

    const priced = repriceStickers(order);
    assert.ok(priced.serverTotal > 1500, "fixture is not a large order");
    assert.ok(priced.serverTotal <= SELF_CHECKOUT_CEILING);

    const decision = decideFor(order);
    assert.equal(decision.bill, true, decision.reason);
  });
});

describe("the rules the route already enforced still hold", () => {
  test("a kiosk order never gets an emailed link", () => {
    const decision = decideFor(stickerOrder([design()]), { kioskSession: true });

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /kiosk/i);
  });

  test("no Printavo quote, nothing to bill against", () => {
    const decision = decideFor(stickerOrder([design()]), {
      printavoCreated: false,
    });
    assert.equal(decision.bill, false);
  });
});

describe("every refusal says why", () => {
  /**
   * The route logs the reason on every sticker order that does not bill. A
   * blank reason makes a silently-not-billing flow invisible until a
   * customer asks where their payment link went.
   */
  test("no reason is ever empty", () => {
    const decisions = [
      decideFor(stickerOrder([design()])),
      decideFor(stickerOrder([design()]), { kioskSession: true }),
      decideFor(stickerOrder([design()]), { printavoCreated: false }),
      decideFor(stickerOrder([design()]), { unpriceable: true }),
      decideFor(stickerOrder([design()]), { serverTotal: 0 }),
      decideFor(stickerOrder([design()]), { serverTotal: 99999 }),
      decideStickersAutoBill({
        order: { product: { type: "Signs", signType: "Yard Signs" } },
        unpriceable: false,
        serverTotal: 50,
        kioskSession: false,
        printavoCreated: true,
      }),
    ];

    for (const decision of decisions) {
      assert.ok(decision.reason.trim().length > 0);
    }
  });
});
