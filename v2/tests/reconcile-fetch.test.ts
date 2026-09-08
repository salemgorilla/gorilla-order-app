/**
 * READING ONE ORDER BACK OUT OF PRINTAVO.
 *
 * The half of the harness that talks to the network. Driven against a
 * stubbed Printavo — `printavoRequest` issues its call through the global
 * `fetch`, so a stub here really does intercept it. (The Vercel Blob SDK
 * does NOT — it goes through `undici.fetch` — which cost two debugging
 * rounds in lib/blob-health.ts. The difference is worth knowing before
 * writing a test that looks like this one.)
 *
 * What is pinned: the search's fuzzy-match guard, and that an UNPROVEN
 * detail shape degrades instead of throwing. Printavo's search is fuzzy and
 * its read shape for line items has never been confirmed against the live
 * account — the harness has to survive both without lying.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { fetchQuoteForReconciliation } from "../lib/printavo";

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

/** Every GraphQL query the run issued, in order. */
let queries: string[] = [];

function stubPrintavo(
  reply: (query: string) => Record<string, unknown> | { errors: unknown[] }
) {
  queries = [];

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const { query } = JSON.parse(init.body) as { query: string };
    queries.push(query);

    const answer = reply(query);

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ("errors" in answer ? answer : { data: answer }),
    };
  }) as unknown as typeof fetch;
}

const SEARCH_HIT = {
  orders: {
    nodes: [{ id: "q1", visualId: "1234", nickname: "GS-20260908-REC01 — Dana" }],
  },
};

const DETAIL = {
  quote: {
    id: "q1",
    visualId: "1234",
    total: 55.6,
    amountOutstanding: 55.6,
    customerNote: "WEBSITE ESTIMATE\nTotal: $55.60\nShipping: Free (local pickup)",
    lineItemGroups: {
      nodes: [
        {
          lineItems: {
            nodes: [
              {
                description: "100 stickers",
                itemNumber: "GORILLA-DECAL",
                price: 37.32,
                quantity: 1,
                sizes: [{ size: "size_other", count: 1 }],
              },
              {
                description: "Setup",
                itemNumber: "GORILLA-SETUP",
                price: 15,
                quantity: 1,
                sizes: [],
              },
            ],
          },
        },
      ],
    },
  },
};

beforeEach(() => {
  process.env.PRINTAVO_EMAIL = "shop@example.com";
  process.env.PRINTAVO_TOKEN = "token";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

describe("finding the order", () => {
  test("a hit is flattened into the shape the reconciler wants", async () => {
    stubPrintavo((query) =>
      query.includes("GorillaReconcileSearch") ? SEARCH_HIT : DETAIL
    );

    const order = await fetchQuoteForReconciliation("gs-20260908-rec01");

    assert.equal(order.found, true, order.error);
    // Case-folded on the way in — a number pasted out of an email is as
    // likely to be lower case as upper.
    assert.equal(order.quoteNumber, "GS-20260908-REC01");
    assert.equal(order.visualId, "1234");
    assert.equal(order.total, 55.6);
    assert.equal(order.amountOutstanding, 55.6);
    assert.equal(order.lineItems?.length, 2);
    assert.equal(order.lineItems?.[0].itemNumber, "GORILLA-DECAL");
    assert.deepEqual(order.lineItems?.[0].sizes, [
      { size: "size_other", count: 1 },
    ]);
  });

  test("Printavo's fuzzy search is not trusted on its own", async () => {
    // The same guard lookupOrderStatus carries: the search returns what it
    // decided was close, and reconciling the WRONG order to the cent would
    // be worse than reconciling nothing at all.
    stubPrintavo((query) =>
      query.includes("GorillaReconcileSearch")
        ? {
            orders: {
              nodes: [
                {
                  id: "other",
                  visualId: "9",
                  nickname: "GS-20260101-XXXXX — Someone",
                },
              ],
            },
          }
        : DETAIL
    );

    const order = await fetchQuoteForReconciliation("GS-20260908-REC01");

    assert.equal(order.found, false);
    assert.match(String(order.error), /nickname/i);
    assert.equal(queries.length, 1, "it fetched the detail of a wrong match");
  });

  test("no credentials is a setup problem, not a missing order", async () => {
    delete process.env.PRINTAVO_TOKEN;

    const order = await fetchQuoteForReconciliation("GS-1");

    assert.equal(order.found, false);
    assert.match(String(order.error), /PRINTAVO_EMAIL and PRINTAVO_TOKEN/);
  });
});

describe("an unproven shape degrades, it does not throw", () => {
  test("a detail query Printavo rejects still returns the order's identity", async () => {
    /**
     * THE POINT OF SPLITTING THE TWO QUERIES. The line-item read shape has
     * never been confirmed against the live account. If it is wrong, the run
     * must still hand back the Printavo number so a human can open the
     * record and finish by eye — rather than reporting "no such order".
     */
    stubPrintavo((query) =>
      query.includes("GorillaReconcileSearch")
        ? SEARCH_HIT
        : {
            errors: [
              { message: "Field 'sizes' doesn't exist on type 'LineItem'" },
            ],
          }
    );

    const order = await fetchQuoteForReconciliation("GS-20260908-REC01");

    assert.equal(order.found, true, "a shape failure lost the order entirely");
    assert.equal(order.visualId, "1234");
    assert.match(String(order.error), /sizes/);
    assert.equal(order.lineItems, undefined);
  });

  test("a quote with no line-item groups reports none, not an empty pass", async () => {
    stubPrintavo((query) =>
      query.includes("GorillaReconcileSearch")
        ? SEARCH_HIT
        : { quote: { id: "q1", visualId: "1234", total: 55.6 } }
    );

    const order = await fetchQuoteForReconciliation("GS-20260908-REC01");

    assert.equal(order.found, true);
    assert.equal(order.total, 55.6);
    assert.equal(order.lineItems, undefined, "a missing shape read as zero lines");
  });

  test("the raw reply is kept, so one run settles the shape", async () => {
    stubPrintavo((query) =>
      query.includes("GorillaReconcileSearch") ? SEARCH_HIT : DETAIL
    );

    const order = await fetchQuoteForReconciliation("GS-20260908-REC01");

    assert.ok(order.raw, "--raw would have nothing to print");
  });
});
