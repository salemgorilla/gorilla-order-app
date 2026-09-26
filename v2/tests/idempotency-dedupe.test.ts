import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { POST } from "../app/api/quote/route";
import { findExistingQuote } from "../lib/printavo";
import { deriveQuoteNumber } from "../lib/idempotency";
import { resetRateLimits } from "../lib/rate-limit";

/**
 * THE BRANCH THAT IS THE WHOLE POINT: a retry that creates nothing.
 *
 * tests/idempotency.test.ts proves the mechanism's pure half — same key,
 * same quote number — and says plainly that it cannot reach the duplicate
 * branch, because with no PRINTAVO_* the route fails open by design.
 *
 * This reaches it. `printavoRequest` issues its call through the global
 * `fetch`, so a stub here really does intercept it (the Vercel Blob SDK does
 * NOT — it goes through undici.fetch — which is worth knowing before writing
 * a test that looks like this one).
 *
 * WHAT IT PROVES: given a Printavo that already holds this quote number, the
 * route returns the existing order and issues NO further request. No quote
 * created, no contact created, no payment request raised, no email sent.
 * That is measured by counting the GraphQL operations the run issued, not by
 * trusting the response body — a response can say the right thing while the
 * side effects have already happened.
 */

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;

/** Every GraphQL operation name the run issued, in order. */
let operations: string[] = [];

function stubPrintavo(reply: (query: string) => Record<string, unknown>) {
  operations = [];

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const { query } = JSON.parse(init.body) as { query: string };
    operations.push(
      (query.match(/(?:query|mutation)\s+(\w+)/) || [, "anonymous"])[1] as string
    );

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: reply(query) }),
    };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetRateLimits();
  process.env.PRINTAVO_EMAIL = "shop@example.com";
  process.env.PRINTAVO_TOKEN = "test-token";
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
  console.log = realLog;
  console.warn = realWarn;
  console.error = realError;
});

const KEY = "the-same-intent-twice-abcdef1234";

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
      needBy: "2026-10-01",
      deadlineType: "Flexible",
    },
    product: {
      type: "Custom Stickers",
      quantity: 100,
      size: '3"',
      widthInches: 3,
      heightInches: 3,
      shape: "Die Cut",
      material: "Gloss White Vinyl",
      finish: "Gloss",
      designCount: 1,
    },
    items: [
      {
        id: "design-1",
        type: "Custom Stickers",
        quantity: 100,
        size: '3"',
        widthInches: 3,
        heightInches: 3,
        shape: "Die Cut",
        material: "Gloss White Vinyl",
        finish: "Gloss",
      },
    ],
    pricing: { stickerPrice: 84, setupPrice: 15, total: 99 },
    addOns: [],
    addOnsNote: "",
    ...overrides,
  };
}

async function submit(order: unknown) {
  const body = new FormData();
  body.append("order", JSON.stringify(order));

  const response = await POST(
    new Request("https://labs.gorillasalem.com/api/quote", {
      method: "POST",
      body,
      headers: { "x-forwarded-for": "203.0.113.7" },
    })
  );

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("the lookup itself", () => {
  test("a nickname carrying the number is a hit, with the pay link", async () => {
    stubPrintavo((query) =>
      query.includes("GorillaIdempotencyPayLink")
        ? { quote: { id: "q1", publicUrl: "https://printavo.test/pay/q1" } }
        : {
            orders: {
              nodes: [
                { id: "q1", visualId: "1234", nickname: "WEB QUOTE GS-20260926-AAAAAAAA - 100 Stickers" },
              ],
            },
          }
    );

    const result = await findExistingQuote("GS-20260926-AAAAAAAA");

    assert.equal(result.searched, true);
    assert.equal(result.found, true);
    assert.equal(result.publicUrl, "https://printavo.test/pay/q1");
  });

  test("Printavo's fuzzy search is not trusted — a near miss is a miss", () => {
    // The search is fuzzy and returns whatever it decided was close. Here a
    // false positive would REFUSE a customer's order, so the nickname has to
    // actually carry the number.
    stubPrintavo(() => ({
      orders: {
        nodes: [{ id: "other", visualId: "9", nickname: "WEB QUOTE GS-20260926-ZZZZZZZZ - 50 Stickers" }],
      },
    }));

    return findExistingQuote("GS-20260926-AAAAAAAA").then((result) => {
      assert.equal(result.searched, true);
      assert.equal(result.found, false);
    });
  });

  test("a failed pay-link request still reports the order as existing", async () => {
    // Proven query first, unproven second. A shape failure on publicUrl must
    // not lose the answer that matters — do not create another order.
    stubPrintavo((query) => {
      if (query.includes("GorillaIdempotencyPayLink")) throw new Error("bad shape");
      return {
        orders: {
          nodes: [
            { id: "q1", visualId: "1234", nickname: "WEB QUOTE GS-20260926-AAAAAAAA - 100 Stickers" },
          ],
        },
      };
    });

    const result = await findExistingQuote("GS-20260926-AAAAAAAA");

    assert.equal(result.found, true, "lost the answer because the pay link failed");
    assert.equal(result.publicUrl, undefined);
  });

  test("a network failure is `searched: false`, never a clean miss", async () => {
    // The distinction the caller's whole decision rests on: the response to
    // a MISS is to create and bill.
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const result = await findExistingQuote("GS-20260926-AAAAAAAA");

    assert.equal(result.searched, false, "a network failure looked like a clean miss");
    assert.equal(result.found, false);
  });
});

describe("a retry against a Printavo that already has the order", () => {
  test("creates NOTHING, and says so", async () => {
    const expected = deriveQuoteNumber(KEY);

    stubPrintavo((query) =>
      query.includes("GorillaIdempotencyPayLink")
        ? { quote: { id: "q1", publicUrl: "https://printavo.test/pay/q1" } }
        : {
            orders: {
              nodes: [
                {
                  id: "q1",
                  visualId: "1234",
                  nickname: `WEB QUOTE ${expected} - 100 Stickers`,
                },
              ],
            },
          }
    );

    const { status, body } = await submit(stickerOrder({ submissionKey: KEY }));

    assert.equal(status, 200);
    assert.equal(body.duplicate, true, "the retry was not recognised");
    assert.equal(body.success, true, "reporting failure would invite a third attempt");
    assert.equal(body.quoteNumber, expected);

    // THE assertion. Only the two lookup operations ran: no quoteCreate, no
    // contact lookup, no payment request. Counting operations rather than
    // reading the response, because a response can say the right thing after
    // the side effects have already happened.
    assert.deepEqual(
      operations,
      ["GorillaIdempotencySearch", "GorillaIdempotencyPayLink"],
      `the route issued ${JSON.stringify(operations)} — anything beyond the ` +
        `two lookups means it created or billed something on a retry`
    );
    assert.ok(
      !operations.some((op) => /Create|Payment|Checkout/i.test(op)),
      "a retry created or billed something"
    );
  });

  test("the customer gets the FIRST attempt's pay link, not a new one", async () => {
    const expected = deriveQuoteNumber(KEY);

    stubPrintavo((query) =>
      query.includes("GorillaIdempotencyPayLink")
        ? { quote: { id: "q1", publicUrl: "https://printavo.test/pay/original" } }
        : {
            orders: {
              nodes: [
                { id: "q1", visualId: "1234", nickname: `WEB QUOTE ${expected} - 100 Stickers` },
              ],
            },
          }
    );

    const { body } = await submit(stickerOrder({ submissionKey: KEY }));

    assert.deepEqual(body.checkout, {
      ready: true,
      payUrl: "https://printavo.test/pay/original",
    });
  });

  test("no pay link recoverable falls through to 'check your email'", async () => {
    // checkout: null is the shape the confirmation screen already treats as
    // "we'll be in touch" — and the first attempt already emailed the link.
    const expected = deriveQuoteNumber(KEY);

    stubPrintavo((query) => {
      if (query.includes("GorillaIdempotencyPayLink")) throw new Error("bad shape");
      return {
        orders: {
          nodes: [
            { id: "q1", visualId: "1234", nickname: `WEB QUOTE ${expected} - 100 Stickers` },
          ],
        },
      };
    });

    const { body } = await submit(stickerOrder({ submissionKey: KEY }));

    assert.equal(body.duplicate, true);
    assert.equal(body.checkout, null);
  });
});

describe("a FIRST submit against the same Printavo", () => {
  test("is not mistaken for a duplicate, and proceeds to create", async () => {
    // The inverse, and it matters more: a false positive here silently drops
    // a real order. Printavo holds nothing matching, so the route must go on.
    stubPrintavo(() => ({ orders: { nodes: [] } }));

    const { body } = await submit(
      stickerOrder({ submissionKey: "a-brand-new-order-key-abcdef1234" })
    );

    assert.notEqual(body.duplicate, true, "a first submit was refused as a duplicate");
    assert.ok(
      operations.length > 1,
      `the route stopped after the lookup (${JSON.stringify(operations)}) — ` +
        `a first submit must go on to create`
    );
  });
});
