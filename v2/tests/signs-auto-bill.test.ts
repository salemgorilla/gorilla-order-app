/**
 * THE SIGNS MONEY GATE.
 *
 * Since 7 Sep a signs or banner order can raise a LIVE PAYABLE LINK with no
 * human in the loop (Gabe: "All 3 should be 'instant price - pay online'").
 * lib/auto-bill.ts is the whole decision; this file is the pressure on it.
 *
 * Every test below is a way a customer could be billed for something nobody
 * priced, or billed an amount the shop never set. The direction of failure
 * matters: withholding a link costs a follow-up email, raising a wrong one
 * costs a refund and the customer's trust. So each guard is asserted to fail
 * CLOSED.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEPOSIT_FRACTION,
  FULL_PAYMENT_CEILING,
  decideSignsAutoBill,
  isSignsOrder,
} from "../lib/auto-bill";
import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceSigns } from "../lib/signs-repricing";
import { isStickerOrder } from "../lib/sticker-repricing";

const CONTACT = { customerName: "Dana", email: "dana@example.com" };

/** The payload the browser really posts, for a given cart. */
function payloadFor(designs: SignsDesign[]) {
  return {
    customer: CONTACT,
    production: { deliveryMethod: "Pickup" },
    ...buildSignsPayloadParts(designs, quoteSignsCart(designs)),
  } as Record<string, unknown>;
}

function banner(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "vinyl-banner",
    quantity: 1,
    customWidthInches: 36,
    customHeightInches: 24,
    material: "13 oz Scrim Vinyl",
    finishing: "Hemmed + Grommets",
    ...overrides,
  });
}

function yardSign(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "yard-sign",
    quantity: 10,
    material: "Coroplast",
    finishing: "Signs Only",
    ...overrides,
  });
}

/** Run the real route composition: reprice, then decide. */
function decideFor(
  designs: SignsDesign[],
  overrides: Partial<Parameters<typeof decideSignsAutoBill>[0]> = {}
) {
  const order = payloadFor(designs);
  const repriced = repriceSigns(order);

  return decideSignsAutoBill({
    order: repriced.order,
    repriced: repriced.repriced,
    unpriceable: repriced.unpriceable,
    serverTotal: repriced.serverTotal,
    kioskSession: false,
    printavoCreated: true,
    ...overrides,
  });
}

describe("a real signs order bills", () => {
  for (const [name, designs] of [
    ["a banner", [banner()]],
    ["yard signs", [yardSign()]],
    ["a two-design cart", [banner(), yardSign()]],
  ] as Array<[string, SignsDesign[]]>) {
    test(name, () => {
      const decision = decideFor(designs);
      assert.equal(decision.bill, true, decision.reason);
    });
  }
});

describe("the two gates never overlap", () => {
  /**
   * The worse bug than not billing: a signs payload accepted by the STICKER
   * gate would be repriced against the sticker table — a per-square-inch
   * vinyl price applied to a banner. Held here as well as in
   * signs-cart-not-a-sticker.test.ts because this is the file that made
   * signs billable, so this is where someone will be tempted to widen it.
   */
  test("a signs payload is never a sticker order", () => {
    for (const designs of [[banner()], [yardSign()], [banner(), yardSign()]]) {
      assert.equal(isStickerOrder(payloadFor(designs) as never), false);
    }
  });

  test("and a sticker payload is never a signs order", () => {
    assert.equal(
      isSignsOrder({
        product: {
          type: "Custom Stickers",
          quantity: 100,
          widthInches: 3,
          heightInches: 3,
        },
      }),
      false
    );
  });

  test("apparel is neither — it is an estimate, and must never bill", () => {
    const apparel = {
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "T-Shirts",
        supplier: { productName: "Gildan 5000" },
        quantity: 24,
      },
    };

    assert.equal(isSignsOrder(apparel), false);
    assert.equal(isStickerOrder(apparel as never), false);
  });
});

describe("classification is positive, never by omission", () => {
  /**
   * The original sticker-gate bug: membership by absence, so any payload
   * that forgot a field was auto-billed. isSignsOrder asks what a thing IS.
   */
  test("an empty payload is not a signs order", () => {
    assert.equal(isSignsOrder({}), false);
    assert.equal(isSignsOrder({ product: {} }), false);
  });

  test("a type naming signs without a signType is not enough", () => {
    assert.equal(isSignsOrder({ product: { type: "Signs" } }), false);
  });

  test("a signType without a type naming signs is not enough", () => {
    assert.equal(isSignsOrder({ product: { signType: "Yard Signs" } }), false);
  });
});

describe("nothing bills at a figure the server did not compute", () => {
  /**
   * THE most important guard in this file.
   *
   * repriceSigns() passes a payload through UNTOUCHED when it carries no
   * `spec` to rebuild from — an open tab from before specs existed. That was
   * harmless while the shop read every figure by hand before invoicing. The
   * moment a link is raised it stops being harmless: the amount billed would
   * be the one the browser sent, which is the definition of trusting the
   * client with money.
   */
  test("a payload the server could not reprice does not bill", () => {
    const order = payloadFor([banner()]);
    const designs = order.signsDesigns as Record<string, unknown>[];

    // Strip the specs, exactly as an old payload would arrive.
    const stripped = {
      ...order,
      signsDesigns: designs.map(({ spec: _spec, ...rest }) => rest),
    };

    const repriced = repriceSigns(stripped);
    assert.equal(repriced.repriced, false, "fixture no longer exercises passthrough");

    const decision = decideSignsAutoBill({
      order: stripped,
      repriced: repriced.repriced,
      unpriceable: repriced.unpriceable,
      // The browser's own claim, which is exactly what must not be billed.
      serverTotal: repriced.serverTotal,
      kioskSession: false,
      printavoCreated: true,
    });

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /could not reprice/i);
  });

  test("an order the engine cannot price does not bill", () => {
    // A rigid sign on a banner material: no per-square-foot rate exists, so
    // the cart comes back unpriceable and the shop quotes it by hand.
    const decision = decideFor([
      createSignsDesign({
        productId: "rigid-sign",
        quantity: 2,
        customWidthInches: 24,
        customHeightInches: 18,
        material: "13 oz Scrim Vinyl",
        finishing: "Standard",
      }),
    ]);

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /could not price/i);
  });

  test("a zero total does not bill", () => {
    const decision = decideFor([banner()], { serverTotal: 0 });
    assert.equal(decision.bill, false);
  });
});

describe("Gabe's ceiling", () => {
  /**
   * $1,500 on signs alone for a few hours on 7 Sep, then ONE ceiling for
   * everything that self-checks-out, at $5,000. The constant is shared with
   * stickers on purpose (stickers-auto-bill.test.ts pins that side): a
   * ceiling only one flow honours has a hole in it.
   */
  test("it is the figure Gabe named, not a round $5,000", () => {
    // "All orders over $4999.99 should ask for 50% deposit" — so an order of
    // exactly $5,000.00 IS over it and takes a deposit. The ceiling this
    // replaced was `> 5000`, which let $5,000.00 through at full price: a
    // one-cent band on the wrong side of the rule.
    assert.equal(FULL_PAYMENT_CEILING, 4999.99);
    assert.equal(DEPOSIT_FRACTION, 0.5);
  });

  test("at the ceiling, it bills in full", () => {
    const decision = decideFor([banner()], {
      serverTotal: FULL_PAYMENT_CEILING,
    });

    assert.equal(decision.bill, true, decision.reason);
    assert.equal(decision.deposit, false);
  });

  test("a cent over it, it asks for a deposit — it does NOT refuse", () => {
    // The rule changed on 7 Sep. Over the ceiling used to withhold the link
    // and leave the shop to invoice by hand, which gave the largest orders
    // the least automation and the slowest cash. Now the customer still pays
    // online, they pay half, and the balance is due before the job leaves.
    const decision = decideFor([banner()], {
      serverTotal: FULL_PAYMENT_CEILING + 0.01,
    });

    assert.equal(decision.bill, true, decision.reason);
    assert.equal(decision.deposit, true);
    assert.match(decision.reason, /deposit requested/i);
    assert.match(decision.reason, /full-payment ceiling/i);
  });

  test("exactly $5,000.00 takes a deposit", () => {
    const decision = decideFor([banner()], { serverTotal: 5000 });
    assert.equal(decision.deposit, true, decision.reason);
  });

  test("a genuinely large order is over it", () => {
    // Not a contrived number: a wall of banners, priced by the real engine.
    const decision = decideFor([
      banner({ quantity: 120, customWidthInches: 96, customHeightInches: 48 }),
    ]);

    assert.equal(decision.bill, true, decision.reason);
    assert.equal(decision.deposit, true, "a four-figure order billed in full");
    assert.match(decision.reason, /deposit/i);
  });
});

describe("the rules stickers already had apply here too", () => {
  test("a kiosk order never gets an emailed link", () => {
    const decision = decideFor([banner()], { kioskSession: true });

    assert.equal(decision.bill, false);
    assert.equal(decision.deposit, false);
    assert.match(decision.reason, /kiosk/i);
  });

  test("no Printavo quote, nothing to bill against", () => {
    const decision = decideFor([banner()], { printavoCreated: false });
    assert.equal(decision.bill, false);
  });
});

describe("every refusal says why", () => {
  /**
   * The route logs the reason on every signs order that does not bill. A
   * blank reason makes a silently-not-billing flow invisible until a
   * customer asks where their payment link went.
   */
  test("no reason is ever empty", () => {
    const decisions = [
      decideFor([banner()]),
      decideFor([banner()], { kioskSession: true }),
      decideFor([banner()], { printavoCreated: false }),
      decideFor([banner()], { repriced: false }),
      decideFor([banner()], { unpriceable: true }),
      decideFor([banner()], { serverTotal: 0 }),
      decideFor([banner()], { serverTotal: 9999 }),
      decideSignsAutoBill({
        order: { product: { type: "Custom Stickers" } },
        repriced: false,
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
