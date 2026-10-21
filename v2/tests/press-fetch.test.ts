/**
 * THE PRESS LINE READ THE WRONG END OF THE LIST.
 *
 * Printavo's `invoices` connection is oldest-first. `invoices(first: 25)`
 * therefore returned July-August 2021 on 2026-10-20 (logged as "25 invoices,
 * newest 2021-08-23, 0 inside the 7-day window"), and the hero stayed empty
 * while every earlier error had already been fixed. fetchRecentInvoicesForPress
 * now reads from the end with `last:` / `before:` and stops once a page reaches
 * past the window. These tests drive it through the `request` seam, no network.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  fetchRecentInvoicesForPress,
  PRESS_MAX_PAGES,
  PRINTAVO_MAX_PAGE,
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

type PageSpec = { nodes: unknown[]; hasPreviousPage: boolean; startCursor: string | null };

function scripted(pages: Array<PageSpec | Error>) {
  const calls: Call[] = [];
  let i = 0;

  const request = (async (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });
    const next = pages[i++];
    if (!next) throw new Error("test ran out of pages");
    if (next instanceof Error) throw next;

    return {
      invoices: {
        pageInfo: { hasPreviousPage: next.hasPreviousPage, startCursor: next.startCursor },
        nodes: next.nodes,
      },
    };
  }) as never;

  return { request, calls };
}

const saved = { email: process.env.PRINTAVO_EMAIL, token: process.env.PRINTAVO_TOKEN };

beforeEach(() => {
  process.env.PRINTAVO_EMAIL = "shop@example.com";
  process.env.PRINTAVO_TOKEN = "token";
  resetProvenSizeShape();
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
  test("asks for the END of the list with last:, never first:", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(3)), node(ago(1))], hasPreviousPage: true, startCursor: "c1" },
      // second page reaches past the window, so the walk ends there
      { nodes: [node(ago(20))], hasPreviousPage: true, startCursor: "c0" },
    ]);

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(calls[0].query, /invoices\(last: \$last, before: \$before\)/);
    assert.doesNotMatch(calls[0].query, /invoices\(first:/);
    assert.equal(calls[0].variables.last, PRINTAVO_MAX_PAGE);
    assert.equal(calls[0].variables.before, null);
  });

  test("a single recent page is enough when it already reaches past the window", async () => {
    const { request, calls } = scripted([
      {
        nodes: [node(ago(30)), node(ago(2)), node(ago(1))],
        hasPreviousPage: true,
        startCursor: "c1",
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
  test("pages with before = the previous startCursor and merges them", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1)), node(ago(2))], hasPreviousPage: true, startCursor: "c1" },
      { nodes: [node(ago(4)), node(ago(5))], hasPreviousPage: true, startCursor: "c2" },
      { nodes: [node(ago(9)), node(ago(6))], hasPreviousPage: true, startCursor: "c3" },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 3);
    assert.equal(calls[1].variables.before, "c1");
    assert.equal(calls[2].variables.before, "c2");
    assert.equal(result.orders.length, 6);
    assert.equal(result.orders[0].createdAt, ago(1));
    assert.equal(result.pages, 3);
    assert.equal(result.stoppedEarly, undefined);
  });

  test("stops when there is nothing earlier, whatever the dates", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1))], hasPreviousPage: false, startCursor: "c1" },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 1);
    assert.equal(result.stoppedEarly, undefined);
  });

  test("stops when there is no cursor to step back from", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1))], hasPreviousPage: true, startCursor: null },
    ]);

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, 1);
  });

  test("never reads more than maxPages, and says the window may reach further", async () => {
    const pages: PageSpec[] = Array.from({ length: 10 }, (_, n) => ({
      nodes: [node(ago(n))],
      hasPreviousPage: true,
      startCursor: `c${n}`,
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
      hasPreviousPage: true,
      startCursor: `c${n}`,
    }));
    const { request, calls } = scripted(pages);

    await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.equal(calls.length, PRESS_MAX_PAGES);
  });
});

describe("failures", () => {
  test("page one failing is an error", async () => {
    const { request } = scripted([new Error("Printavo: Argument 'last' is not valid")]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /'last'/);
    assert.deepEqual(result.orders, []);
  });

  test("a later page failing keeps the pages already read", async () => {
    const { request } = scripted([
      { nodes: [node(ago(1)), node(ago(2))], hasPreviousPage: true, startCursor: "c1" },
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
    const request = (async () => ({ invoices: {} })) as never;

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.match(result.error ?? "", /without an invoices\.nodes list/);
    assert.ok(result.raw);
  });
});

describe("page size", () => {
  test("never asks for more than Printavo allows, however it is called", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(30))], hasPreviousPage: false, startCursor: null },
    ]);

    await fetchRecentInvoicesForPress({ pageSize: 500 }, { request, now: NOW });

    assert.ok(Number(calls[0].variables.last) <= PRINTAVO_MAX_PAGE);
  });

  test("the admin probe size is honoured", async () => {
    const { request, calls } = scripted([
      { nodes: [node(ago(1))], hasPreviousPage: true, startCursor: "c1" },
    ]);

    const result = await fetchRecentInvoicesForPress({ pageSize: 5, maxPages: 1 }, { request, now: NOW });

    assert.equal(calls[0].variables.last, 5);
    assert.equal(calls.length, 1);
    assert.ok(result.raw);
  });
});

describe("what it hands to press-activity", () => {
  test("flattens lines and synthesises quantity from sizes", async () => {
    const { request } = scripted([
      { nodes: [node(ago(1), 40), node(ago(30), 5)], hasPreviousPage: false, startCursor: "c1" },
    ]);

    const result = await fetchRecentInvoicesForPress({}, { request, now: NOW });

    assert.deepEqual(result.orders[0], {
      createdAt: ago(1),
      lineItems: [{ itemNumber: "GS-STK", quantity: 40 }],
    });
  });
});
