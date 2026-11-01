/**
 * PAPER PRINTING IS A QUOTE REQUEST, END TO END, AND NOTHING IN IT CAN BILL.
 *
 * Gabe, 2026-10-23, chose "instant price, pay online" with prices built from
 * 4over cost plus his markup. The prices do not exist yet (lib/paper-pricing-
 * config.ts is empty on purpose), so until they do this flow must behave as a
 * hand quote on every surface: the Printavo quote, the shop email, the route.
 *
 * The property being defended is the one AGENTS.md puts first: a new flow
 * whose payload misses the right markers silently becomes a sticker order,
 * gets repriced against the sticker table and is billed a price nobody set.
 * Every test below is a way for that to happen, shut.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import { POST } from "../app/api/quote/route";
import { buildQuoteEmail } from "../lib/email";
import { classifyOrderFlow, isStickerFlow, maySignsAutoBill } from "../lib/order-flow";
import { paperQuoteOrder } from "../lib/paper";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { resetRateLimits } from "../lib/rate-limit";
import { isStickerOrder, repriceStickers } from "../lib/sticker-repricing";
import { decideSignsAutoBill, decideStickersAutoBill } from "../lib/auto-bill";

beforeEach(() => resetRateLimits());

const realLog = console.log;
const realError = console.error;
const realWarn = console.warn;

before(() => {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
});

after(() => {
  console.log = realLog;
  console.error = realError;
  console.warn = realWarn;
});

const customer = { customerName: "Dana", email: "dana@example.com", company: "", phone: "" };
const production = { deliveryMethod: "Pickup", needBy: "2027-01-15", deadlineType: "Flexible" };

function paperOrder(overrides: Record<string, unknown> = {}, product: Record<string, unknown> = {}) {
  return {
    customer,
    production,
    product: {
      type: "Paper Printing",
      paperProductId: "business-cards",
      size: '3.5" x 2"',
      stock: "14pt Matte",
      quantity: 500,
      sides: "Double-sided",
      finishing: [],
      paperNotes: "",
      ...product,
    },
    pricing: { total: 0, quoteRequired: true },
    ...overrides,
  };
}

/** A paper payload with every money field a hostile browser might add. */
function tamperedPaperOrder() {
  return paperOrder({
    pricing: {
      total: 9999,
      stickerPrice: 9000,
      setupPrice: 500,
      minimumPrice: 100,
      shippingPrice: 250,
      rushFee: 149,
      quoteRequired: false,
      unitPrice: 19.998,
    },
    discount: { code: "FAMFRE" },
  });
}

describe("paper can never be taken for another flow", () => {
  it("is not a sticker order, to either sticker gate", () => {
    const order = paperOrder();

    assert.equal(isStickerOrder(order as never), false);
    assert.equal(isStickerFlow(order as never), false);
    assert.equal(
      decideStickersAutoBill({
        order,
        repriced: false,
        unpriceable: false,
        serverTotal: 0,
        kioskSession: false,
        printavoCreated: true,
      } as never).bill,
      false
    );
  });

  it("is not a signs order, to the signs gate", () => {
    const order = paperOrder();

    assert.equal(maySignsAutoBill(order as never), false);
    assert.equal(
      decideSignsAutoBill({
        order,
        repriced: false,
        unpriceable: false,
        serverTotal: 0,
        kioskSession: false,
        printavoCreated: true,
      } as never).bill,
      false
    );
  });

  it("is classified paper", () => {
    assert.equal(classifyOrderFlow(paperOrder() as never), "paper");
  });

  it("a type that also names another flow is that flow, never paper", () => {
    // The #186 defect in reverse: paper must lose every tie, so the shape and
    // the authority predicates cannot disagree about it.
    for (const type of [
      "Paper Printing Stickers",
      "Paper Printing Banners",
      "Paper Printing Apparel",
    ]) {
      const order = paperOrder({}, { type });
      assert.notEqual(classifyOrderFlow(order as never), "paper", type);
    }
  });

  it("repricing leaves it alone (there is no server price to compute)", () => {
    const repriced = repriceStickers(paperOrder() as never);
    assert.equal((repriced as { repriced?: boolean }).repriced ?? false, false);
  });
});

describe("a paper order's money is replaced, not trusted", () => {
  it("paperQuoteOrder zeroes every figure and the discount", () => {
    const clean = paperQuoteOrder(tamperedPaperOrder() as Record<string, unknown>);

    assert.deepEqual(
      (clean as { pricing: Record<string, unknown> }).pricing,
      {
        total: 0,
        quoteRequired: true,
        note: "Paper printing is priced by hand from the shop's 4over account.",
      }
    );
    assert.equal((clean as { discount: unknown }).discount, null);
  });

  it("the Printavo quote carries no money even from a tampered payload", () => {
    // The second wall: the route replaces `pricing` first, but the plan
    // builder must not depend on that.
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST-PAPER",
      order: tamperedPaperOrder() as Record<string, unknown>,
      artworkAnalysis: null,
    });

    assert.equal(plan.lineItems.length, 1);
    assert.equal(plan.lineItems[0].price, 0);
    assert.equal(plan.lineItems[0].quantity, 500);
    assert.equal(plan.shippingLineItem, null);
    assert.deepEqual(plan.feeLineItems, [], "no setup, minimum or rush row for paper");
  });

  it("is still flagged for hand pricing when the payload claims it is not", () => {
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-TEST-PAPER",
      order: tamperedPaperOrder() as Record<string, unknown>,
      artworkAnalysis: null,
    });

    assert.ok(plan.tags.includes("#NeedsPricing"));
    assert.match(plan.nickname, /NEEDS PRICING/);
  });

  it("the shop email still says NEED TO QUOTE when the payload claims it is priced", () => {
    const email = buildQuoteEmail({
      quoteNumber: "GS-TEST-PAPER",
      receivedAt: "2026-10-23T12:00:00Z",
      order: tamperedPaperOrder() as Record<string, unknown>,
      artworkAnalysis: null,
    } as never);

    assert.match(email.subject, /NEED TO QUOTE/);
    assert.match(JSON.stringify(email), /NEEDS A HAND QUOTE/);
    assert.doesNotMatch(JSON.stringify(email), /\$9,?999/);
  });
});

describe("the Printavo quote reads as a paper hand quote", () => {
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-20261023-PAPER1",
    order: paperOrder({}, { paperNotes: "Matte please", finishing: ["Rounded corners"] }) as Record<string, unknown>,
    artworkAnalysis: null,
  });

  it("is tagged #Paper and #NeedsPricing, and nothing from another flow", () => {
    assert.ok(plan.tags.includes("#Paper"));
    assert.ok(plan.tags.includes("#NeedsPricing"));

    for (const other of ["#Stickers", "#Signs", "#Apparel"]) {
      assert.equal(plan.tags.includes(other), false, other);
    }
  });

  it("files the one line under a paper SKU, never GORILLA-DECAL", () => {
    assert.equal(plan.lineItems[0].itemNumber, "GORILLA-PAPER-BUSINESS-CARDS");
  });

  it("names the product and the pricing need in the nickname, with the quote number", () => {
    assert.match(plan.nickname, /GS-20261023-PAPER1/);
    assert.match(plan.nickname, /500 Business Cards/);
    assert.match(plan.nickname, /NEEDS PRICING/);
    assert.doesNotMatch(plan.nickname, /sticker/i);
  });

  it("describes the spec the printer works from", () => {
    const note = plan.customerNote;

    assert.match(note, /PAPER PRINTING/);
    assert.match(note, /Stock: 14pt Matte/);
    assert.match(note, /Printing: Double-sided/);
    assert.match(note, /Finishing: Rounded corners/);
    assert.match(note, /Notes: Matte please/);
    assert.match(note, /PRICING NEEDED/);
  });

  it("is taxable goods (Massachusetts only exempts clothing)", () => {
    assert.ok(plan.salesTaxRate !== null && plan.salesTaxRate > 0);
  });
});

describe("the shop email says it needs a hand quote and that no link went out", () => {
  const email = buildQuoteEmail({
    quoteNumber: "GS-20261023-PAPER1",
    receivedAt: "2026-10-23T12:00:00Z",
    order: paperOrder({}, { paperNotes: "Matte please" }) as Record<string, unknown>,
    artworkAnalysis: null,
  } as never);

  const text = JSON.stringify(email);

  it("is subject-flagged NEED TO QUOTE with the product name", () => {
    assert.match(email.subject, /NEED TO QUOTE/);
    assert.match(email.subject, /500 Business Cards/);
  });

  it("has a PAPER DETAILS section with the spec", () => {
    assert.match(text, /PAPER DETAILS/);
    assert.match(text, /14pt Matte/);
    assert.match(text, /Double-sided/);
    assert.match(text, /Matte please/);
  });

  it("never shows a figure: NEEDS A HAND QUOTE, and says no payment link was sent", () => {
    assert.match(text, /NEEDS A HAND QUOTE/);
    assert.match(text, /No payment link was sent/);
    assert.doesNotMatch(text, /Estimated Each/);
    assert.doesNotMatch(text, /STICKER DETAILS|SIGNS DETAILS|APPAREL DETAILS/);
  });
});

describe("the route", () => {
  function post(order: unknown) {
    const body = new FormData();
    body.append("order", JSON.stringify(order));

    return POST(
      new Request("https://labs.gorillasalem.com/api/quote", { method: "POST", body })
    );
  }

  async function submit(order: unknown) {
    const response = await post(order);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it("refuses a stock the product does not sell, before issuing a quote number", async () => {
    const { status, body } = await submit(paperOrder({}, { stock: "16pt Soft Touch", paperProductId: "rack-cards", size: '4" x 9"' }));

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.match(String(body.message), /paper stocks/i);
    assert.equal(body.quoteNumber, undefined);
  });

  it("refuses a quantity that is not a break", async () => {
    const { status, body } = await submit(paperOrder({}, { quantity: 137 }));

    assert.equal(status, 400);
    assert.match(String(body.message), /quantities/i);
  });

  it("refuses an unknown paper product", async () => {
    const { status } = await submit(paperOrder({}, { paperProductId: "banners" }));

    assert.equal(status, 400);
  });

  it("a valid paper order gets through validation (502 only because nothing is configured here)", async () => {
    // With no Printavo or mail provider, every order that passes validation
    // reports that it reached nobody. Reaching THAT answer is the proof that
    // validation, repricing and the plan did not throw on a paper payload.
    const { status, body } = await submit(paperOrder());

    assert.equal(status, 502);
    assert.match(String(body.message), /could not deliver/i);
    assert.match(String(body.quoteNumber), /^GS-/);
  });

  it("a tampered paper payload is no different, and raises no checkout", async () => {
    const { status, body } = await submit(tamperedPaperOrder());

    assert.equal(status, 502);
    assert.equal(
      (body as { checkout?: unknown }).checkout ?? null,
      null,
      "paper must never come back with a payment link"
    );
  });
});

describe("the route is wired shut around paper (text, because delivery cannot run here)", () => {
  const route = readFileSync(new URL("../app/api/quote/route.ts", import.meta.url), "utf8");

  it("replaces a paper order's pricing before any later step reads it", () => {
    const at = route.indexOf("const stickerPriced = repriceStickers(order);");
    const stub = route.indexOf("paperQuoteOrder(", at);
    const signs = route.indexOf("repriceSigns(priced.order)");

    assert.ok(at > 0 && stub > at, "the paper stub must follow the sticker reprice");
    assert.ok(stub < signs, "the paper stub must run BEFORE the signs reprice and everything after");
  });

  it("the payment-link branch refuses paper whatever the decisions above said", () => {
    assert.match(
      route,
      /printavoReady &&\s*!isPaper &&\s*\(stickersAutoBill\.bill \|\| signsAutoBill\.bill\)/
    );
  });

  it("logs paper as paper, not as apparel", () => {
    assert.match(route, /isPaper\s*\n?\s*\? "paper"/);
  });
});
