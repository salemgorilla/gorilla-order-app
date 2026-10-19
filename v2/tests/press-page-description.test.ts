/**
 * "NO LINE" HAS MEANT THREE DIFFERENT THINGS ON THIS ENDPOINT.
 *
 * Printavo allows 25 invoices per page and this query cannot choose which 25
 * (the sort enum is unconfirmed), so the page may be this week's or may be
 * ancient - and either way the hero shows nothing, which is also what a
 * quiet week looks like. describePressPage is the line that tells them apart.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describePressPage } from "../lib/press-activity";

const NOW = new Date("2026-10-19T18:00:00Z");

describe("the page description", () => {
  test("a recent page reads as recent", () => {
    const line = describePressPage(
      [
        { createdAt: "2026-10-19T09:00:00Z" },
        { createdAt: "2026-10-15T09:00:00Z" },
        { createdAt: "2026-10-10T09:00:00Z" },
      ],
      { now: NOW }
    );

    assert.equal(line, "3 invoices, newest 2026-10-19, oldest 2026-10-10, 2 inside the 7-day window");
  });

  test("a page of OLD invoices is visibly old - the case that looks like a quiet week", () => {
    const line = describePressPage(
      [{ createdAt: "2025-01-02T00:00:00Z" }, { createdAt: "2025-01-03T00:00:00Z" }],
      { now: NOW }
    );

    assert.match(line, /newest 2025-01-03/);
    assert.match(line, /0 inside the 7-day window/);
  });

  test("an empty page and a single invoice", () => {
    assert.equal(describePressPage([], { now: NOW }), "0 invoices, 0 inside the 7-day window");
    assert.match(describePressPage([{ createdAt: "2026-10-19T00:00:00Z" }], { now: NOW }), /^1 invoice,/);
  });

  test("undated rows are counted, not silently dropped", () => {
    const line = describePressPage(
      [{ createdAt: "2026-10-18T00:00:00Z" }, { createdAt: "garbage" }, {}],
      { now: NOW }
    );

    assert.match(line, /2 undated/);
    assert.match(line, /1 inside/);
  });

  test("it carries dates and counts and nothing else", () => {
    // The log is not a safe place for customers.
    const line = describePressPage(
      [{ createdAt: "2026-10-18T00:00:00Z", lineItems: [{ itemNumber: "GORILLA-DECAL-1", quantity: 500 }] } as never],
      { now: NOW }
    );

    assert.doesNotMatch(line, /GORILLA|500|@/);
    assert.match(line, /^[\d\sa-z,\-]+$/i);
  });
});
