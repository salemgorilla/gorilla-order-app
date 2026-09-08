/**
 * THE SIGNS ESCAPE HATCH — Jake Pardee's order, in code.
 *
 * ── THE ORDER THAT MADE THIS NECESSARY ────────────────────────────────────
 * 7 September, 10:26pm. #122 had made signs and banners auto-bill ELEVEN
 * HOURS earlier. The first real one to arrive:
 *
 *   Configured: Rigid Sign, 6" x 7", PVC 1/8", single-sided, rounded
 *               corners. $60.00 — of which $37.37 is the order-minimum pad
 *               on a $22.63 sign.
 *   His notes:  "Looking to do a CLEAR ACRYLIC version of this design for
 *                my recording console, the bottom space will be for a
 *                couple of autographs … Would like to discuss how to make
 *                this happen!"
 *   The email:  "Payment: Charged automatically — the customer gets a
 *                payment link as soon as this reaches Printavo."
 *
 * The list has no acrylic. He picked PVC to get through the form, and the
 * app raised a live payment link for a sign he does not want. The engine
 * priced it perfectly: a CORRECT PRICE FOR THE WRONG PRODUCT, which is the
 * failure isStickerOrder() was hardened against and the reason this is a
 * refusal rather than a cap.
 *
 * Every test below is that order, or a way of getting it wrong.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  decideSignsAutoBill,
  decideStickersAutoBill,
  isSpecialOrder,
  shopPaymentNote,
} from "../lib/auto-bill";
import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceSigns } from "../lib/signs-repricing";
import { getSignsFieldErrors, getSignsValidationSummary } from "../lib/validation";

/** Jake's sign, as the configurator built it. */
function jakesSign(): SignsDesign {
  return createSignsDesign({
    productId: "rigid-sign",
    quantity: 1,
    customWidthInches: 6,
    customHeightInches: 7,
    material: "PVC 1/8\"",
    finishing: "Standard",
    signAddOns: ["rounded-corners"],
  });
}

function payloadFor(
  designs: SignsDesign[],
  special: { specialOrder?: boolean; specialOrderNotes?: string } = {}
) {
  return {
    customer: { customerName: "Jake", email: "jake@example.com" },
    production: { deliveryMethod: "Pickup" },
    ...buildSignsPayloadParts(
      designs,
      quoteSignsCart(designs),
      undefined,
      special
    ),
  } as Record<string, unknown>;
}

/** The route's own composition: reprice, then decide. */
function decideFor(order: Record<string, unknown>) {
  const repriced = repriceSigns(order);

  return decideSignsAutoBill({
    order: repriced.order,
    repriced: repriced.repriced,
    unpriceable: repriced.unpriceable,
    serverTotal: repriced.serverTotal,
    kioskSession: false,
    printavoCreated: true,
  });
}

describe("the order as it actually arrived still bills", () => {
  test("without the escape, a rigid PVC sign is an ordinary billable order", () => {
    // The control is OFF by default, and it has to be: a flow where it
    // starts ticked stops taking payments, and it would be a while before
    // anyone noticed.
    const decision = decideFor(payloadFor([jakesSign()]));

    assert.equal(decision.bill, true, decision.reason);
  });
});

describe("the escape withholds the payment link", () => {
  test("ticked, the same order does not bill", () => {
    const decision = decideFor(
      payloadFor([jakesSign()], {
        specialOrder: true,
        specialOrderNotes: "Clear acrylic version, 6 x 7, plus a matching cover piece",
      })
    );

    assert.equal(decision.bill, false);
    assert.equal(decision.deposit, false);
    assert.match(decision.reason, /special order/i);
    assert.match(decision.reason, /not listed/i);
  });

  test("it is checked ABOVE reprice, price and ceiling", () => {
    /**
     * None of those is the question. The engine can price the PVC sign
     * perfectly — that is exactly the problem. So the refusal must not
     * depend on the order also being unpriceable, or over the ceiling, or
     * missing a spec.
     */
    const order = payloadFor([jakesSign()], {
      specialOrder: true,
      specialOrderNotes: "acrylic",
    });

    const decision = decideSignsAutoBill({
      order,
      repriced: true,
      unpriceable: false,
      // Well under the ceiling, perfectly priced, nothing else wrong.
      serverTotal: 60,
      kioskSession: false,
      printavoCreated: true,
    });

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /special order/i);
  });

  test("the shop's email says NOT charged, from the same decision", () => {
    // One decision, one sentence — the email and the link cannot disagree
    // about what happened, which is the rule #123 established.
    const order = payloadFor([jakesSign()], {
      specialOrder: true,
      specialOrderNotes: "acrylic",
    });

    const note = shopPaymentNote({
      order,
      signs: decideFor(order),
      stickers: null,
    });

    assert.ok(note);
    assert.match(note, /NOT charged/);
    assert.match(note, /special order/i);
    assert.match(note, /invoice this one by hand/i);
  });
});

describe("the reprice must not erase it", () => {
  /**
   * THE BUG THIS FILE CAUGHT BEFORE IT SHIPPED.
   *
   * repriceSigns REBUILDS `product` from the design specs, so anything the
   * browser put there that is not derivable from a spec is dropped — and
   * the escape flag is exactly that. lib/auto-bill.ts reads the REPRICED
   * order, so the hatch arrived at the money gate erased and the order
   * billed anyway. The whole feature would have shipped doing nothing, and
   * nothing about the diff looked wrong.
   */
  test("the flag survives the server's own reprice", () => {
    const order = payloadFor([jakesSign()], {
      specialOrder: true,
      specialOrderNotes: "Clear acrylic",
    });

    const repriced = repriceSigns(order);

    assert.equal(repriced.repriced, true, "fixture no longer reprices");
    assert.equal(
      isSpecialOrder(repriced.order),
      true,
      "the reprice dropped the customer's escape, so the order would bill"
    );
  });

  test("and it is the ONLY thing about the money the browser gets to say", () => {
    // Every other figure is re-derived, because a client-supplied number
    // could bill someone. This flag can only ever WITHHOLD a link — the
    // failure direction that costs a follow-up email, never a wrong charge.
    const tampered = payloadFor([jakesSign()], {
      specialOrder: true,
      specialOrderNotes: "acrylic",
    });
    (tampered.pricing as Record<string, unknown>).total = 5;

    const repriced = repriceSigns(tampered);

    assert.equal(isSpecialOrder(repriced.order), true);
    assert.notEqual(
      repriced.serverTotal,
      5,
      "the browser's total survived the reprice"
    );
  });
});

describe("the quote object must not be rebuilt from its designs alone", () => {
  /**
   * THE SECOND BUG THIS FILE CAUGHT, and the more embarrassing one.
   *
   * Four setters in app/page.tsx wrote `setSignsQuote({ designs: … })` —
   * replacing the whole quote with an object that has ONLY designs. That was
   * harmless while `designs` was everything a signs quote had. The escape is
   * the first order-level answer, and every one of those setters silently
   * erased it.
   *
   * The symptom was maddening: ticking the box worked, the price vanished
   * from the screen, the flag survived stepping between 02 and 04 — and then
   * died the moment artwork was uploaded, because THAT setter rebuilt the
   * quote. Only driving the whole flow in a browser found it.
   *
   * Source-level, because the setters are closures over component state that
   * no unit test can mount. What is pinned is the SHAPE: a signs setter must
   * spread the quote it was given.
   */
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  test("no setter replaces the quote with a bare designs object", () => {
    const bare = page.match(/setSignsQuote\(\s*\{\s*(\/\/[^\n]*\n\s*)*designs:/g);

    assert.equal(
      bare,
      null,
      "a setSignsQuote({ designs: … }) drops every order-level answer on the quote"
    );
  });

  test("the artwork setter in particular spreads it", () => {
    // The one that actually bit: signs artwork lives on the design, so this
    // setter rebuilds the quote on every upload.
    const artwork = page.slice(
      page.indexOf("Signs artwork lives on the design"),
      page.indexOf("Signs artwork lives on the design") + 900
    );

    assert.match(artwork, /\.\.\.prev,/);
  });
});

describe("the flag is read positively, never by absence", () => {
  test("an ordinary payload is not a special order", () => {
    assert.equal(isSpecialOrder({}), false);
    assert.equal(isSpecialOrder({ product: {} }), false);
    assert.equal(isSpecialOrder(payloadFor([jakesSign()])), false);
  });

  test("only the boolean true counts", () => {
    // The original sticker-gate bug was membership by omission. Its mirror
    // here would be a truthy string flipping a paying order into a refusal
    // — or, worse, "false" reading as true.
    for (const value of ["true", "false", 1, 0, null, undefined, ""]) {
      assert.equal(
        isSpecialOrder({ product: { specialOrder: value } }),
        false,
        `${JSON.stringify(value)} was treated as a special order`
      );
    }

    assert.equal(isSpecialOrder({ product: { specialOrder: true } }), true);
  });

  test("the payload only carries the field when it is set", () => {
    const ordinary = payloadFor([jakesSign()]).product as Record<string, unknown>;
    assert.equal("specialOrder" in ordinary, false);

    const special = payloadFor([jakesSign()], {
      specialOrder: true,
      specialOrderNotes: "  acrylic  ",
    }).product as Record<string, unknown>;

    assert.equal(special.specialOrder, true);
    assert.equal(special.specialOrderNotes, "acrylic", "notes were not trimmed");
  });
});

describe("stickers share the rule, so it belongs to the file", () => {
  test("a sticker payload carrying the flag does not bill either", () => {
    // No sticker surface offers the control today. This is here so the rule
    // is the FILE's rather than one flow's — the day stickers grow it, the
    // gate is already right.
    const decision = decideStickersAutoBill({
      order: {
        product: {
          type: "Custom Stickers",
          quantity: 100,
          widthInches: 3,
          heightInches: 3,
          specialOrder: true,
        },
      },
      unpriceable: false,
      serverTotal: 55.6,
      kioskSession: false,
      printavoCreated: true,
    });

    assert.equal(decision.bill, false);
    assert.match(decision.reason, /special order/i);
  });
});

describe("a special order carries no price, exactly as apparel's does", () => {
  test("the payload sends total 0 and quoteRequired", () => {
    /**
     * The engine still prices the PVC sign — $60.00 to the cent. It is the
     * wrong product. Sending the figure would give the customer a
     * confirmation at a number the shop will never bill, and give the shop
     * a priced quote describing something nobody is going to make.
     */
    const priced = payloadFor([jakesSign()]).pricing as Record<string, unknown>;
    assert.ok(Number(priced.total) > 0, "fixture no longer prices");
    assert.equal(priced.quoteRequired, false);

    const special = payloadFor([jakesSign()], {
      specialOrder: true,
      specialOrderNotes: "acrylic",
    }).pricing as Record<string, unknown>;

    assert.equal(special.total, 0);
    assert.equal(special.quoteRequired, true);
    assert.match(String(special.note), /Special order/i);
    assert.match(String(special.note), /not on the list/i);
  });
});

describe("a special order with an empty box is refused", () => {
  const order = {
    customer: { customerName: "Jake", email: "jake@example.com" },
    production: { needBy: "2026-12-07" },
  };
  const design = {
    templateId: null,
    quantity: 1,
    customWidthInches: 6,
    customHeightInches: 7,
    artwork: { file: {} },
    needsTypedSize: true,
  };

  test("the worst of both worlds: no link AND nothing to quote from", () => {
    const errors = getSignsFieldErrors([design], order, "slow", "2026-09-08", {
      specialOrder: true,
      specialOrderNotes: "   ",
    });

    assert.match(String(errors.specialOrderNotes), /Tell us what you need/i);
  });

  test("the checklist says it in the customer's words", () => {
    const problems = getSignsValidationSummary(
      [design],
      order,
      "slow",
      "2026-09-08",
      { specialOrder: true, specialOrderNotes: "" }
    );

    assert.ok(
      problems.some((p) => /special order/i.test(p)),
      problems.join(" | ")
    );
  });

  test("filled in, it submits", () => {
    const errors = getSignsFieldErrors([design], order, "slow", "2026-09-08", {
      specialOrder: true,
      specialOrderNotes: "Clear acrylic, 6 x 7",
    });

    assert.equal(errors.specialOrderNotes, undefined);
  });

  test("and an ordinary order is untouched", () => {
    const errors = getSignsFieldErrors([design], order, "slow", "2026-09-08");

    assert.equal(errors.specialOrderNotes, undefined);
  });
});
