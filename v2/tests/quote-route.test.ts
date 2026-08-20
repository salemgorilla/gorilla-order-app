import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { POST } from "../app/api/quote/route";

/**
 * The submit endpoint itself, driven end to end.
 *
 * ── WHY THIS IS DIFFERENT FROM EVERY OTHER TEST HERE ──────────────────────
 * The suite tests pure functions. money-path.test.ts gets closest, and it
 * still calls repriceStickers and isStickerOrder directly rather than posting
 * anything. So the ~900 lines that actually run when a customer presses
 * Submit — parsing the multipart body, repricing, planning attachments,
 * building the internal notes, deciding on a payment link, deciding on a
 * confirmation email, and choosing a status code — were executed by nobody
 * but a customer.
 *
 * That is the file where the flows converge, and this repo's recurring defect
 * is a rule that is right in one flow and missing in its siblings.
 *
 * ── WHAT IT CAN AND CANNOT REACH HERE ─────────────────────────────────────
 * With no PRINTAVO_* and no mail provider configured, the route runs the whole
 * pipeline and then correctly reports that the quote reached nobody: a 502.
 * So everything UP TO delivery is exercised, and delivery itself is not.
 *
 * That means the checkout gate — the branch that creates a live payment link —
 * cannot be reached from here, and this file does not pretend to cover it.
 * AGENTS.md is right that the only real check on that is a reconciled order.
 * What this file does is make sure nothing before it throws, and that the
 * refusals happen in the right order.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * The route logs the whole quote record by design — that log IS the shop's
 * fallback record when email and Printavo are both down. Useful in
 * production, unreadable in a test run, so it is silenced here and restored
 * afterwards rather than removed from the route.
 */
const realLog = console.log;
const realError = console.error;

before(() => {
  console.log = () => {};
  console.error = () => {};
});

after(() => {
  console.log = realLog;
  console.error = realError;
});

function post(order: unknown) {
  const body = new FormData();
  body.append("order", JSON.stringify(order));

  return POST(
    new Request("https://labs.gorillasalem.com/api/quote", {
      method: "POST",
      body,
    })
  );
}

async function submit(order: unknown) {
  const response = await post(order);

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

/** A sticker order in the shape the browser really posts. */
function stickerOrder(overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      customerName: "Dana",
      email: "dana@example.com",
      company: "",
      phone: "",
    },
    production: {
      deliveryMethod: "Pickup",
      needBy: "2026-09-01",
      deadlineType: "Flexible",
    },
    // Both halves matter: isStickerOrder() reads product.type, and
    // repriceStickers reads items. A payload with one and not the other is a
    // shape this route has shipped bugs over.
    product: {
      type: "Custom Stickers",
      quantity: 100,
      widthInches: 3,
      heightInches: 3,
      material: "Matte",
      shape: "Die Cut",
    },
    items: [
      {
        id: "d1",
        quantity: 100,
        widthInches: 3,
        heightInches: 3,
        material: "Matte",
        shape: "Die Cut",
      },
    ],
    pricing: { total: 0 },
    ...overrides,
  };
}

describe("an address nobody can be reached at is refused", () => {
  it("refuses a malformed address with 400", async () => {
    const { status, body } = await submit(
      stickerOrder({
        customer: { customerName: "Dana", email: "dana@gmailcom" },
      })
    );

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.match(String(body.message), /@ and a domain/);
  });

  it("refuses a missing address with 400", async () => {
    const { status, body } = await submit(
      stickerOrder({ customer: { customerName: "Dana", email: "  " } })
    );

    assert.equal(status, 400);
    assert.match(String(body.message), /Enter your email/);
  });

  it("refuses BEFORE burning a quote number", async () => {
    // The GS- number is what the customer quotes back to the shop and what
    // lookupOrderStatus matches. Issuing one for a submission that was then
    // refused would put a number in front of somebody that finds nothing.
    const { body } = await submit(
      stickerOrder({ customer: { customerName: "Dana", email: "x" } })
    );

    assert.equal(body.quoteNumber, undefined);
  });

  it("refuses every flow, not just stickers", async () => {
    // The sibling-flow check. A guard on the shared customer object has no
    // business caring which product it is, and this proves it does not.
    const flows = [
      stickerOrder({ customer: { customerName: "D", email: "bad" } }),
      {
        customer: { customerName: "D", email: "bad" },
        production: { deliveryMethod: "Pickup", needBy: "2026-09-01" },
        product: { type: "Yard Signs", signType: "18oz", quantity: 5 },
        pricing: { total: 200 },
      },
      {
        customer: { customerName: "D", email: "bad" },
        production: { deliveryMethod: "Pickup", needBy: "2026-09-01" },
        product: { type: "Apparel", garmentType: "T-Shirt", quantity: 24 },
        pricing: { total: 400 },
      },
    ];

    for (const order of flows) {
      const { status } = await submit(order);
      assert.equal(status, 400);
    }
  });
});

describe("a quote that reaches nobody is reported as failed", () => {
  // Nothing is configured in this environment, so every submission below
  // genuinely fails to deliver. That is the condition being asserted: the
  // route used to return 200 with a green checkmark and a quote number for an
  // order that existed nowhere, and the only trace was a console line.
  it("returns 502 and success:false rather than a checkmark", async () => {
    const { status, body } = await submit(stickerOrder());

    assert.equal(status, 502);
    assert.equal(body.success, false);
    assert.match(String(body.message), /could not deliver/i);
  });

  it("still hands back the quote number it generated", async () => {
    // The submission failed, but a number was allocated and logged before it
    // did. Telling the customer which one lets the shop find that log line.
    const { body } = await submit(stickerOrder());

    assert.match(String(body.quoteNumber), /^GS-/);
  });

  it("says which channel failed, separately", async () => {
    const { body } = await submit(stickerOrder());

    const notification = body.notification as Record<string, unknown>;
    const printavo = body.printavo as Record<string, unknown>;

    // "Skipped because nothing is configured" is not the same as "tried and
    // failed", and a shop diagnosing a dead deployment needs to tell them
    // apart.
    assert.equal(notification.sent, false);
    assert.equal(printavo.created, false);
  });
});

describe("the whole pipeline runs without throwing", () => {
  /**
   * Not coverage for its own sake. Everything between parsing and delivery —
   * the attachment plan, the artwork-link block, the internal notes, the
   * customer-record note, the confirmation-email decision — runs on every
   * submission and is reachable no other way. A 500 here means something in
   * that stretch threw on a shape a customer can actually post.
   */
  function assertReachedDelivery(status: number) {
    // Deliberately NOT asserting 502. That is this environment's answer,
    // because nothing is configured here; a deployment with credentials would
    // answer 200 and these tests would start failing for a reason that has
    // nothing to do with what they are checking. What they check is that the
    // request got as far as a DELIVERY outcome at all — not a 400 refusal and
    // not a 500 from something in the middle throwing.
    assert.ok(
      status === 200 || status === 502,
      `expected a delivery outcome, got ${status}`
    );
  }

  it("survives a three-design cart", async () => {
    const { status } = await submit(
      stickerOrder({
        items: [
          { id: "d1", quantity: 100, widthInches: 3, heightInches: 3, material: "Matte", shape: "Die Cut" },
          { id: "d2", quantity: 250, widthInches: 2, heightInches: 2, material: "Gloss", shape: "Circle" },
          { id: "d3", quantity: 100, widthInches: 4, heightInches: 6, material: "Chrome", shape: "Square" },
        ],
      })
    );

    assertReachedDelivery(status);
  });

  it("survives a signs order", async () => {
    const { status } = await submit({
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-01" },
      product: { type: "Yard Signs", signType: "18oz", quantity: 5, size: '24" x 18"' },
      pricing: { total: 200 },
    });

    assertReachedDelivery(status);
  });

  it("survives an apparel order", async () => {
    const { status } = await submit({
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Ship", needBy: "2026-09-01" },
      product: {
        type: "Apparel",
        garmentType: "T-Shirt",
        supplier: "S&S",
        quantity: 24,
        specialOrder: true,
        specialOrderNotes: "Two dozen black tees, front print.",
      },
      pricing: { total: 400 },
    });

    assertReachedDelivery(status);
  });

  it("survives a kiosk session", async () => {
    // The counter path suppresses the payment request and the confirmation
    // email, both decided on the server. Neither decision may throw.
    const { status } = await submit(
      stickerOrder({ kiosk: { enabled: true, staffName: "Sam" } })
    );

    assertReachedDelivery(status);
  });

  it("survives an order with no items array at all", async () => {
    // A single-design payload from an older client, and the shape that made
    // the cart migration risky. It must still price and still not throw.
    const order = stickerOrder();
    delete (order as Record<string, unknown>).items;

    assertReachedDelivery((await submit(order)).status);
  });

  it("survives a payload that is barely an order", async () => {
    // Nothing about this endpoint being public guarantees a well-formed body.
    // A junk payload with a usable address must fail to DELIVER, not crash.
    const { status } = await submit({
      customer: { customerName: "", email: "dana@example.com" },
    });

    assert.notEqual(status, 500);
  });
});
