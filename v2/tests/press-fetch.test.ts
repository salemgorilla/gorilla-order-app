/**
 * THE PRESS LINE READ THE WRONG END OF THE LIST.
 *
 * Printavo's `invoices` connection is oldest-first. `invoices(first: 25)`
 * therefore returned July-August 2021 on 2026-10-20 (logged as "25 invoices,
 * newest 2021-08-23, 0 inside the 7-day window"). The first fix, `last:`,
 * was rejected on 2026-10-21: "'last' is only supported when used with the
 * 'before' parameter". So the sort is now DISCOVERED from the live schema
 * (discoverInvoiceOrdering) and the walk pages forward from the newest. These
 * tests drive it through the `request` seam, no network.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  fetchRecentInvoicesForPress,
  discoverInvoiceOrdering,
  PRESS_MAX_PAGES,
  PRINTAVO_MAX_PAGE,
  resetProvenInvoiceOrdering,
  resetProvenSizeShape,
} from "../lib/printavo";

const NOW = new Date("2026-10-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

type Call = { query: string; variables: Record<string, unknown> };

function node(createdAt: string, count = 10) {
  return {
    id: createdAt,
    createdAt,
    lineItemGroups: {
      nodes: [
        { lineItems: { nodes: [{ itemNumber: "GS-STK", sizes: [{ size: "Std", count }] }] } },
      ],
    },
  };
}

type PageSpec = { nodes: unknown[]; hasNextPage: boolean; endCursor: string | null };

type Schema = { args: string[]; members: string[] };

/** The live schema as the sort needs it; override per test. */
const SCHEMA_DESC_FLAG: Schema = {
  args: ["first", "after", "sortOn", "sortDescending"],
  members: ["CREATED_AT", "NICKNAME", "ORDER_NUMBER"],
};

function scripted(pages: Array<PageSpec | Error>, schema: Schema | Error = SCHEMA_DESC_FLAG) {
  const calls: Call[] = [];
  const introspection: string[] = [];
  let i = 0;

  const request = (async (query: string, variables: Record<string, unknown> = {}) => {
    if (query.includes("GorillaInvoiceArgs")) {
      introspection.push("args");
      if (schema instanceof Error) throw schema;
      return {
        __schema: {
          queryType: {
            fields: [
              { name: "orders", args: [] },
              {
                name: "invoices",
                args: schema.args.map((name) => ({
                  name,
                  type:
                    name === "sortOn"
                      ? { name: null, kind: "NON_NULL", ofType: { name: "OrderSortField", kind: "ENUM" } }
                      : { name: "String", kind: "SCALAR" },
                })),
              },
            ],
          },
        },
      };
    }

    if (query.includes("GorillaInvoiceFields")) {
      introspection.push("fields");
      return { __type: { fields: [{ name: "id" }, { name: "createdAt" }, { name: "productionNote" }] } };
    }

    if (query.includes("GorillaInvoiceFilterTypes")) {
      introspection.push("filters");
      return {
        __schema: {
          queryType: {
            fields: [
              {
                name: "invoices",
                args: [
                  { name: "inProductionAfter", type: { name: "ISO8601DateTime", kind: "SCALAR" } },
                  { name: "first", type: { name: "Int", kind: "SCALAR" } },
                ],
              },
            ],
          },
        },
      };
    }

    if (query.includes("GorillaSortEnum")) {
      introspection.push("enum");
      assert.equal(variables.name, "OrderSortField");
      return { __type: { enumValues: (schema as Schema).members.map((name) => ({ name })) } };
    }

    calls.push({ query, variables });
    const next = pages[i++];
    if (!next) throw new Error("test ran out of pages");
    if (next instanceof Error) throw next;

    return {
      invoices: {
        pageInfo: { hasNextPage: next.hasNextPage, endCursor: next.endCursor },
        nodes: next.nodes,
      },
    };
  }) as never;

  return { request, calls, introspection };
}

const saved = { email: process.env.PRINTAVO_EMAIL, token: process.env.PRINTAVO_TOKEN };

beforeEach(() => {
  process.env.PRINTAVO_EMAIL = "shop@example.com";
  process.env.PRINTAVO_TOKEN = "token";
  resetProvenSizeShape();
  resetProvenInvoiceOrdering();
});

afterEach(() => {
  for (const [key, value] of [
    ["PRINTAVO_EMAIL", saved.email],
    ["PRINTAVO_TOKEN", saved.token],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("reads the newest invoices, not the oldest", () => {
  test("asks for a descending creation sort, never the default order", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(3)), node(ago(1))], hasNextPage: true, endCursor: "c1" },
      // second page reaches past the window, so the walk ends there
      { nodes: [node(ago(20))], hasNextPage: true, endCursor: "c0" },
    ]);

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(
      calls[0].query,
      /invoices\(first: \$first, after: \$after, sortOn: CREATED_AT, sortDescending: true\)/
    );
    assert.doesNotMatch(calls[0].query, /\blast:|\bbefore:/, "last/before was rejected by Printavo on 2026-10-21");
    assert.equal(calls[0].variables.first, PRINTAVO_MAX_PAGE);
    assert.equal(calls[0].variables.after, null);
  });

  test("a single recent page is enough when it already reaches past the window", async () => {
    const { request, calls } = scripted([
      {
        nodes: [node(ago(30)), node(ago(2)), node(ago(1))],
        hasNextPage: true,
        endCursor: "c1",
      },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 1);
    assert.equal(result.pages, 1);
    assert.equal(result.error, undefined);
    assert.equal(result.stoppedEarly, undefined);
    // newest first, nothing dropped
    assert.deepEqual(
      result.orders.map((o) => o.createdAt),
      [ago(1), ago(2), ago(30)]
    );
  });
});

describe("walks backwards until the window is covered", () => {
  test("pages with after = the previous endCursor and merges them", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1)), node(ago(2))], hasNextPage: true, endCursor: "c1" },
      { nodes: [node(ago(4)), node(ago(5))], hasNextPage: true, endCursor: "c2" },
      { nodes: [node(ago(9)), node(ago(6))], hasNextPage: true, endCursor: "c3" },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 3);
    assert.equal(calls[1].variables.after, "c1");
    assert.equal(calls[2].variables.after, "c2");
    assert.equal(result.orders.length, 6);
    assert.equal(result.orders[0].createdAt, ago(1));
    assert.equal(result.pages, 3);
    assert.equal(result.stoppedEarly, undefined);
  });

  test("stops when there is nothing earlier, whatever the dates", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1))], hasNextPage: false, endCursor: "c1" },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 1);
    assert.equal(result.stoppedEarly, undefined);
  });

  test("stops when there is no cursor to step back from", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1))], hasNextPage: true, endCursor: null },
    ]);

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 1);
  });

  test("never reads more than maxPages, and says the window may reach further", async () => {
    const pages: PageSpec[] = Array.from({ length: 10 }, (_, n) => ({
      nodes: [node(ago(n))],
      hasNextPage: true,
      endCursor: `c${n}`,
    }));
    const { request, calls } = scripted(pages);

    const result = await fetchRecentInvoicesForPress({ maxPages: 2 }, { request, now: NOW });

    assert.equal(calls.length, 2);
    assert.equal(result.pages, 2);
    assert.match(result.stoppedEarly ?? "", /may reach further back/);
  });

  test("the default walk is bounded by PRESS_MAX_PAGES", async () => {
    const pages: PageSpec[] = Array.from({ length: 20 }, (_, n) => ({
      nodes: [node(ago(n * 0.1))],
      hasNextPage: true,
      endCursor: `c${n}`,
    }));
    const { request, calls } = scripted(pages);

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, PRESS_MAX_PAGES);
  });
});

describe("failures", () => {
  test("page one failing is an error", async () => {
    const { request } = scripted([new Error("Printavo: Argument 'after' is not valid")]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /'after'/);
    assert.deepEqual(result.orders, []);
  });

  test("a later page failing keeps the pages already read", async () => {
    const { request } = scripted([
      { nodes: [node(ago(1)), node(ago(2))], hasNextPage: true, endCursor: "c1" },
      new Error("Printavo: HTTP 429 after 3 retries."),
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(result.error, undefined);
    assert.equal(result.orders.length, 2);
    assert.match(result.stoppedEarly ?? "", /page 2 failed.*429/);
  });

  test("not configured returns the error without calling Printavo", async () => {
    delete process.env.PRINTAVO_TOKEN;
    const { request, calls } = scripted([]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /not configured/);
    assert.equal(calls.length, 0);
  });

  test("an answer with no nodes list is reported, with the raw response", async () => {
    const { request } = scripted([{ nodes: undefined as never, hasNextPage: false, endCursor: null }]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /without an invoices\.nodes list/);
    assert.ok(result.raw);
  });
});

describe("page size", () => {
  test("never asks for more than Printavo allows, however it is called", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(30))], hasNextPage: false, endCursor: null },
    ]);

    await fetchRecentInvoicesForPress({ pageSize: 500 }, { request, now: NOW });

    assert.ok(Number(calls[0].variables.first) <= PRINTAVO_MAX_PAGE);
  });

  test("the admin probe size is honoured", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1))], hasNextPage: true, endCursor: "c1" },
    ]);

    const result = await fetchRecentInvoicesForPress({ pageSize: 5, maxPages: 1 }, { request, now: NOW });

    assert.equal(calls[0].variables.first, 5);
    assert.equal(calls.length, 1);
    assert.ok(result.raw);
  });
});

describe("what it hands to press-activity", () => {
  test("flattens lines and synthesises quantity from sizes", async () => {
    const { request } = scripted([
      { nodes: [node(ago(1), 40), node(ago(30), 5)], hasNextPage: false, endCursor: "c1" },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.deepEqual(result.orders[0], {
      createdAt: ago(1),
      lineItems: [{ itemNumber: "GS-STK", quantity: 40 }],
    });
  });
});

describe("the ordering is read from the live schema, not written down", () => {
  const one: PageSpec = { nodes: [node(ago(1))], hasNextPage: false, endCursor: null };

  test("a combined newest-first member is used on its own", async () => {
    const { request, calls } = scripted([one], {
      args: ["first", "sortOn"],
      members: ["CREATED_AT_ASC", "CREATED_AT_DESC", "NICKNAME"],
    });

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(calls[0].query, /sortOn: CREATED_AT_DESC\)/);
    assert.doesNotMatch(calls[0].query, /sortDescending/);
  });

  test("an ascending-only member is not mistaken for newest-first", async () => {
    const { request, calls } = scripted([one], {
      args: ["first", "sortOn"],
      members: ["CREATED_AT_ASC", "NICKNAME"],
    });

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 0, "must not fall back to the default (oldest-first) page");
    assert.match(result.error ?? "", /cannot order invoices newest-first/);
  });

  test("with no sortDescending argument a plain member cannot be reversed", async () => {
    const { request, calls } = scripted([one], {
      args: ["first", "sortOn"],
      members: ["CREATED_AT"],
    });

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 0);
    assert.match(result.error ?? "", /cannot order/);
  });

  test("a failure puts the real argument names and members in the error", async () => {
    const { request } = scripted([one], {
      args: ["first", "after", "sortOn", "foo"],
      members: ["NICKNAME", "ORDER_NUMBER"],
    });

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /invoices arguments: first, after, sortOn, foo/);
    assert.match(result.error ?? "", /OrderSortField members: NICKNAME, ORDER_NUMBER/);
  });

  test("a schema that cannot be read is an error, not a silent default", async () => {
    const { request, calls } = scripted([one], new Error("Printavo: HTTP 500"));

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 0);
    assert.match(result.error ?? "", /could not read the schema.*500/);
  });

  test("a hostile enum member name is never inlined into the query", async () => {
    const { request, calls } = scripted([one], {
      args: ["first", "sortOn", "sortDescending"],
      members: ["CREATED_AT) { id } evil: invoices(first: 1"],
    });

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 0);
    assert.match(result.error ?? "", /cannot order/);
  });

  test("what was learned is remembered, so the schema is read once", async () => {
    const first = scripted([one]);
    await fetchRecentInvoicesForPress({}, { request: first.request, now: NOW });
    const second = scripted([one]);
    await fetchRecentInvoicesForPress({}, { request: second.request, now: NOW });

    assert.deepEqual(first.introspection, ["args", "enum"]);
    assert.deepEqual(second.introspection, []);
  });

  test("a failed discovery is not cached", async () => {
    const bad = scripted([one], new Error("Printavo: HTTP 500"));
    await discoverInvoiceOrdering(bad.request);
    const good = scripted([one]);

    const ordering = await discoverInvoiceOrdering(good.request);

    assert.equal(ordering.ok, true);
  });
});

describe("when the live schema has no creation-date sort (21 October 2026)", () => {
  // The real answer from production: invoices arguments and OrderSortField members.
  const LIVE: Schema = {
    args: [
      "excludeStatusIds", "inProductionAfter", "inProductionBefore", "paymentStatus", "query",
      "sortDescending", "sortOn", "statusIds", "tags", "after", "before", "first", "last",
    ],
    members: ["CUSTOMER_DUE_AT", "CUSTOMER_NAME", "STATUS", "OWNER", "TOTAL", "VISUAL_ID"],
  };

  test("sorts by VISUAL_ID descending, the order number, which grows with creation", async () => {
    const { request, calls } = scripted(
      [{ nodes: [node(ago(1)), node(ago(30))], hasNextPage: false, endCursor: null }],
      LIVE
    );

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(calls[0].query, /sortOn: VISUAL_ID, sortDescending: true\)/);
    assert.equal(result.error, undefined);
    assert.equal(result.orders.length, 2);
  });

  test("a proxy sort that came back oldest-first is refused, not served", async () => {
    const { request } = scripted(
      [{ nodes: [node(ago(400)), node(ago(2))], hasNextPage: false, endCursor: null }],
      LIVE
    );

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /did not return newest-first/);
    assert.deepEqual(result.orders, []);
  });

  test("the refusal carries the evidence the next round needs", async () => {
    const { request } = scripted(
      [{ nodes: [node(ago(400)), node("not a date"), node(ago(2))], hasNextPage: false, endCursor: null }],
      LIVE
    );

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /Row dates in the order returned: 2025-09-15 \? 2026-10-18\./);
    assert.match(result.error ?? "", /Invoice fields: id, createdAt, productionNote\./);
    assert.match(result.error ?? "", /Filter argument types: inProductionAfter: ISO8601DateTime\./);
  });

  test("the evidence is only dates and names, never a customer", async () => {
    const rows = [node(ago(400)), node(ago(2))].map((row) => ({
      ...row,
      customer: { fullName: "Jane Q. Customer", email: "jane@example.com" },
    }));
    const { request } = scripted([{ nodes: rows, hasNextPage: false, endCursor: null }], LIVE);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.doesNotMatch(result.error ?? "", /Jane|jane@|Customer/);
  });

  test("a failing diagnostic never hides the refusal itself", async () => {
    const base = scripted(
      [{ nodes: [node(ago(400)), node(ago(2))], hasNextPage: false, endCursor: null }],
      LIVE
    );
    const request = (async (query: string, variables?: Record<string, unknown>) => {
      if (query.includes("GorillaInvoiceFields") || query.includes("GorillaInvoiceFilterTypes")) {
        throw new Error("Printavo: HTTP 500");
      }
      return (base.request as never as (q: string, v?: unknown) => Promise<unknown>)(query, variables);
    }) as never;

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /did not return newest-first/);
    assert.match(result.error ?? "", /Invoice fields could not be read/);
  });

  test("the proxy needs sortDescending to be reversible", async () => {
    const { request, calls } = scripted([], {
      args: LIVE.args.filter((name) => name !== "sortDescending"),
      members: LIVE.members,
    });

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 0);
    assert.match(result.error ?? "", /cannot order/);
  });

  test("a real creation-date member still wins over the proxy", async () => {
    const { request, calls } = scripted(
      [{ nodes: [node(ago(1))], hasNextPage: false, endCursor: null }],
      { args: LIVE.args, members: [...LIVE.members, "CREATED_AT"] }
    );

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(calls[0].query, /sortOn: CREATED_AT, sortDescending: true\)/);
  });
});
