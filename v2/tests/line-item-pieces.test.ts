/**
 * THE FIELD THAT ISN'T THERE.
 *
 * On 1 October the scheduled health check hit /api/press against the live
 * account and explainPrintavoFieldError printed the thing it was built to
 * print:
 *
 *   Field 'quantity' doesn't exist on type 'LineItem' — 'LineItem' has:
 *   category, color, description, id, itemNumber, items, lineItemGroup,
 *   markupPercentage, merch, mockups, personalizations, poLineItem,
 *   position, price, priceReceipt, product, productStatus, sizes, taxed,
 *   timestamps.
 *
 * TWO queries in lib/printavo.ts asked for that field, and both failed in
 * silence by design:
 *
 *   - the press query, so the hero's "on the press this week" line has
 *     never once shown a number;
 *   - fetchQuoteForReconciliation's detail query, so the reconciler's
 *     "Line items add up" check has only ever returned `unknown` — which
 *     is the check the Reconciled table's owed rows are waiting on.
 *
 * The count lives in `sizes`, which is also what this app writes: every
 * goods row it sends carries `sizes: [{ size, count }]`, so summing the
 * counts returns exactly the quantity it billed.
 *
 * What is NOT settled is whether read-side `sizes` is a plain list or a
 * Relay connection. Guessing that is how this file lost the `sortOn` enum
 * (see tests/press-sort), so both shapes are tried instead. These tests
 * pin the summing, the retry ladder, and the rule that the ladder only
 * runs for shape complaints.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  LINE_ITEM_SIZE_SHAPES,
  isShapeComplaint,
  lineItemPieces,
  lineItemSizes,
  requestTryingSizeShapes,
  resetProvenSizeShape,
} from "../lib/printavo";

describe("pieces are summed out of sizes, in either shape", () => {
  test("the plain-list shape", () => {
    assert.equal(
      lineItemPieces({ sizes: [{ size: "size_s", count: 12 }, { size: "size_m", count: 30 }] }),
      42
    );
  });

  test("the connection shape", () => {
    assert.equal(
      lineItemPieces({ sizes: { nodes: [{ size: "size_other", count: 100 }] } }),
      100
    );
  });

  test("a sticker row, which is how this app writes every decal line", () => {
    assert.equal(lineItemPieces({ sizes: [{ size: "size_other", count: 500 }] }), 500);
  });

  test("no sizes at all is zero, not an error", () => {
    assert.equal(lineItemPieces({}), 0);
    assert.equal(lineItemPieces(null), 0);
    assert.equal(lineItemPieces({ sizes: null }), 0);
    assert.equal(lineItemPieces({ sizes: "12" }), 0);
  });

  test("a negative count cannot subtract from what the shop printed", () => {
    // The same rule lib/press-activity applies to a quantity: a credit note
    // is not a reason to under-report the week.
    assert.equal(lineItemPieces({ sizes: [{ count: 50 }, { count: -20 }] }), 50);
  });

  test("junk entries are skipped rather than poisoning the sum", () => {
    assert.equal(
      lineItemPieces({ sizes: [{ count: 10 }, { count: "many" }, null, { count: 5 }] }),
      15
    );
  });

  test("fractional counts floor, so a line cannot claim a part-piece", () => {
    assert.equal(lineItemPieces({ sizes: [{ count: 10.9 }] }), 10);
  });
});

describe("sizes are normalised out of either shape", () => {
  test("the plain-list shape", () => {
    assert.deepEqual(lineItemSizes({ sizes: [{ size: "size_s", count: 3 }] }), [
      { size: "size_s", count: 3 },
    ]);
  });

  test("the connection shape", () => {
    assert.deepEqual(lineItemSizes({ sizes: { nodes: [{ size: "size_s", count: 3 }] } }), [
      { size: "size_s", count: 3 },
    ]);
  });

  test("absent sizes read as undefined, which the reconciler treats as UNKNOWN", () => {
    // Not `[]`. An empty list would claim the line genuinely has no sizes,
    // and lib/reconcile distinguishes "none" from "could not read".
    assert.equal(lineItemSizes({}), undefined);
    assert.equal(lineItemSizes({ sizes: 7 }), undefined);
  });
});

describe("only a shape complaint earns another attempt", () => {
  test("the three ways a wrong shape comes back", () => {
    assert.ok(isShapeComplaint(new Error("Printavo: Field 'nodes' doesn't exist on type 'LineItemSize'")));
    assert.ok(isShapeComplaint(new Error("Printavo: Field 'sizes' doesn't accept argument 'first'")));
    assert.ok(
      isShapeComplaint(
        new Error("Printavo: Field 'count' must not have a selection since type 'Int' has no subfields.")
      )
    );
  });

  test("an auth failure, a rate limit and a dead socket are not", () => {
    // Retrying these on the next shape doubles the load on Printavo to
    // learn nothing, and on a 429 it is actively rude.
    assert.equal(isShapeComplaint(new Error("Printavo: HTTP 401")), false);
    assert.equal(isShapeComplaint(new Error("Printavo: HTTP 429")), false);
    assert.equal(isShapeComplaint(new Error("fetch failed")), false);
  });
});

describe("the ladder settles the shape in one call, not one deploy", () => {
  test("the first shape is tried first and nothing else runs when it works", async () => {
    resetProvenSizeShape();
    const asked: string[] = [];

    const data = await requestTryingSizeShapes<{ ok: boolean }>(
      (sizes) => `query { lineItems { nodes { ${sizes} } } }`,
      undefined,
      async (query) => {
        asked.push(query);
        return { ok: true } as never;
      }
    );

    assert.deepEqual(data, { ok: true });
    assert.equal(asked.length, 1);
    assert.match(asked[0], /sizes \{ size count \}/);
  });

  test("a shape complaint falls through to the connection shape", async () => {
    resetProvenSizeShape();
    const asked: string[] = [];

    const data = await requestTryingSizeShapes<{ ok: boolean }>(
      (sizes) => `query { lineItems { nodes { ${sizes} } } }`,
      undefined,
      async (query) => {
        asked.push(query);
        if (asked.length === 1) {
          throw new Error("Printavo: Field 'size' doesn't exist on type 'LineItemSizeConnection'");
        }
        return { ok: true } as never;
      }
    );

    assert.deepEqual(data, { ok: true });
    assert.equal(asked.length, 2);
    assert.match(asked[1], /sizes\(first: 50\) \{ nodes \{ size count \} \}/);
  });

  test("the winning shape is remembered, so the cost of being wrong is paid once", async () => {
    resetProvenSizeShape();
    let calls = 0;

    const request = async (query: string) => {
      calls += 1;
      if (/sizes \{ size count \}/.test(query)) {
        throw new Error("Printavo: Field 'size' doesn't exist on type 'LineItemSizeConnection'");
      }
      return { ok: true } as never;
    };

    const build = (sizes: string) => `query { lineItems { nodes { ${sizes} } } }`;

    await requestTryingSizeShapes(build, undefined, request);
    assert.equal(calls, 2, "the first call pays for the discovery");

    await requestTryingSizeShapes(build, undefined, request);
    assert.equal(calls, 3, "the second goes straight to the proven shape");

    resetProvenSizeShape();
  });

  test("a 401 stops the ladder instead of running it twice", async () => {
    resetProvenSizeShape();
    let calls = 0;

    await assert.rejects(
      requestTryingSizeShapes(
        (sizes) => `query { ${sizes} }`,
        undefined,
        async () => {
          calls += 1;
          throw new Error("Printavo: HTTP 401");
        }
      ),
      /401/
    );

    assert.equal(calls, 1);
  });

  test("when both shapes miss, the LAST error is thrown — the one the explainer can read", async () => {
    resetProvenSizeShape();

    await assert.rejects(
      requestTryingSizeShapes(
        (sizes) => `query { ${sizes} }`,
        undefined,
        async (query) => {
          throw new Error(
            /nodes/.test(query)
              ? "Printavo: Field 'nodes' doesn't exist on type 'LineItemSize'"
              : "Printavo: Field 'size' doesn't exist on type 'LineItemSizeConnection'"
          );
        }
      ),
      // explainPrintavoFieldError turns exactly this into the real field list.
      /Field 'nodes' doesn't exist on type 'LineItemSize'/
    );
  });

  test("both candidates ask only for fields the write side already proves exist", () => {
    for (const shape of LINE_ITEM_SIZE_SHAPES) {
      assert.match(shape, /size/);
      assert.match(shape, /count/);
    }
  });
});

/**
 * The tripwire. `quantity` is not on a read LineItem, and the only reason
 * it survived in two queries for weeks is that both were built to fail
 * quietly. A third one would too.
 */
describe("no query asks a LineItem for a field it does not have", () => {
  test("quantity appears in no lineItems selection", async () => {
    const src = await readFile(new URL("../lib/printavo.ts", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // Every GraphQL template literal in the file.
    const queries = code.match(/`query [\s\S]*?`/g) || [];
    assert.ok(queries.length >= 2, "expected to find the read queries");

    for (const query of queries) {
      if (!/lineItems/.test(query)) continue;

      const selection = query.slice(query.indexOf("lineItems"));

      assert.doesNotMatch(
        selection,
        /\bquantity\b/,
        `a lineItems selection still asks for 'quantity', which LineItem does not have:\n${selection.slice(0, 300)}`
      );
    }
  });
});
