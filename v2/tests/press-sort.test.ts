/**
 * THE HERO LINE HAD NEVER ONCE WORKED.
 *
 * ── THE ERROR, ON EVERY CALL ──────────────────────────────────────────────
 * Production logged this on every request to /api/press:
 *
 *   Printavo: Argument 'sortOn' on Field 'invoices' has an invalid value
 *   (CREATED_AT_DESC). Expected type 'OrderSortField'.
 *
 * So `fetchRecentInvoicesForPress` returned an error string every time and
 * the "on the press this week" line has been silently absent since it
 * shipped. Nothing broke loudly, because the feature was built to withhold
 * itself rather than fail — which is correct, and is also why nobody
 * noticed for weeks.
 *
 * ── WHY THE ARGUMENT WAS REMOVED, NOT REPLACED ────────────────────────────
 * The valid members of `OrderSortField` are not known from this side: the
 * live schema is unreachable from CI and the sandbox, and guessing an enum
 * is precisely how this broke the first time. Ordering moved into code
 * that can be tested instead.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function printavoSource(): Promise<string> {
  return readFile(new URL("../lib/printavo.ts", import.meta.url), "utf8");
}

/**
 * The file with its prose removed.
 *
 * The comment above the press query QUOTES the rejected argument verbatim,
 * because the exact error text is the most useful thing in that comment.
 * An assertion over the raw file therefore fails on its own documentation —
 * which this test did, first time out. Strip comments and assert on code.
 */
async function printavoCode(): Promise<string> {
  const src = await printavoSource();
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the query no longer sends an argument the API rejects", () => {
  test("sortOn is gone from the press query", async () => {
    const src = await printavoCode();
    const query = src.slice(src.indexOf("query GorillaPressActivity"));
    const body = query.slice(0, query.indexOf("`"));

    assert.doesNotMatch(
      body,
      /sortOn/,
      "sortOn is back — the live API rejects every value this code has tried"
    );
    assert.match(body, /invoices\(first: \$first\)/);
  });

  test("no guessed enum was substituted for it", async () => {
    // A replacement value would be a guess at OrderSortField's members,
    // which is the mistake this is recovering from. Ordering is done in
    // sortNewestFirst, where it is testable.
    const code = await printavoCode();

    assert.doesNotMatch(code, /CREATED_AT_DESC/);
    assert.doesNotMatch(code, /sortOn/, "no sort argument in any query");
    assert.match(code, /function sortNewestFirst/);
  });
});

describe("ordering is ours, and survives bad data", () => {
  /**
   * sortNewestFirst is module-private, so this drives it through the
   * behaviour it guarantees rather than importing it: newest first, and
   * nothing dropped. Re-implemented here would prove nothing, so the
   * contract is asserted against the source's own rules.
   */
  test("rows without a usable createdAt sort last, and are NOT discarded", async () => {
    const src = await printavoSource();
    const fn = src.slice(src.indexOf("function sortNewestFirst"));
    const body = fn.slice(0, fn.indexOf("\n}"));

    // NEGATIVE_INFINITY puts them last under a descending sort.
    assert.match(body, /Number\.NEGATIVE_INFINITY/);
    // press-activity already treats an unparseable date as outside the
    // window. Dropping rows here would hide a shape change that the raw
    // probe exists to reveal.
    assert.doesNotMatch(body, /\.filter\(/, "rows are being discarded before the raw probe can see them");
    // A copy, not an in-place sort of the response object.
    assert.match(body, /\[\.\.\.nodes\]\.sort/);
  });

  test("a non-array response is passed through untouched", async () => {
    // The shape guard below it reports "answered without an invoices.nodes
    // list" and returns the raw response. Sorting must not turn that into
    // a different error, or an empty array that looks like a quiet week.
    const src = await printavoSource();
    const fn = src.slice(src.indexOf("function sortNewestFirst"));

    assert.match(fn.slice(0, 400), /if \(!Array\.isArray\(nodes\)\) return nodes;/);
  });
});
