/**
 * THE SCHEMA PROBE — read-only, schema-only, and it has to stay that way.
 *
 * PRINTAVO-PROBE.md refuses to ship an arbitrary-GraphQL endpoint to answer
 * research questions, and is right to. This endpoint is the narrow version of
 * that: fixed queries, introspection only, admin-guarded, with the caller
 * choosing nothing but which TYPE NAME to ask about.
 *
 * The danger is obvious and worth a test: a type name is interpolated into a
 * query variable, and "arbitrary GraphQL" is what this becomes the day
 * somebody loosens that. So what is pinned here is the guard and the shape of
 * the module, not the answers — the answers need live credentials and change
 * when Printavo ships.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { safeSchemaTypeNames } from "../lib/printavo";

describe("only identifiers reach the query", () => {
  test("real type names pass", () => {
    assert.deepEqual(
      safeSchemaTypeNames(["QuoteCreateInput", "InvoiceCreateInput", "Task", "_Private"]),
      ["QuoteCreateInput", "InvoiceCreateInput", "Task", "_Private"]
    );
  });

  test("anything that could change what the query means is dropped", () => {
    for (const bad of [
      "Quote Create",
      'Quote"Create',
      "Quote{id}",
      "Quote) { __schema { types { name } } } #",
      "Quote\nCreate",
      "1Quote",
      "",
      "   ",
      null,
      undefined,
      {},
      "A".repeat(200),
    ]) {
      assert.deepEqual(safeSchemaTypeNames([bad]), [], JSON.stringify(String(bad)));
    }
  });

  test("a good name beside a bad one does not smuggle the bad one through", () => {
    assert.deepEqual(
      safeSchemaTypeNames(["QuoteCreateInput", "x) { y } #"]),
      ["QuoteCreateInput"]
    );
  });

  test("capped, so one request cannot become a hundred round trips", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Type${i}`);
    assert.equal(safeSchemaTypeNames(many).length, 10);
  });
});

describe("the endpoint cannot read business data or write anything", () => {
  test("its queries are literals, and every one is introspection", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../lib/printavo.ts", import.meta.url), "utf8");

    const probe = source.slice(
      source.indexOf("export async function describePrintavoSchema"),
      source.indexOf("export async function testPrintavoConnection")
    );

    assert.ok(probe.length > 0, "probe function moved — this test is looking at nothing");

    // Every GraphQL document in the probe must be introspection. A query that
    // named `orders`, `quote` or `contact` would be reading the shop's data.
    const documents = [...probe.matchAll(/`(query|mutation)[\s\S]*?`/g)].map((m) => m[0]);
    assert.ok(documents.length >= 2, "expected the two introspection queries");

    for (const document of documents) {
      assert.match(document, /__schema|__type/, "a probe query is not introspection");
      assert.doesNotMatch(document, /\bmutation\b/, "the probe must never mutate");
      assert.doesNotMatch(
        document,
        /\b(orders|quote|invoice|contact|customer|payment|lineItem)\s*[({]/i,
        "the probe must not reach business data"
      );
    }

    // The type name must travel as a VARIABLE. Interpolating it into the
    // query string is exactly how this becomes arbitrary GraphQL.
    assert.match(probe, /\$name: String!/);
    assert.doesNotMatch(probe, /__type\(name:\s*"\$\{/, "type name is interpolated");
  });

  test("the route fails closed without an admin secret, and checks it", async () => {
    const { readFile } = await import("node:fs/promises");
    const route = await readFile(
      new URL("../app/api/printavo-schema/route.ts", import.meta.url),
      "utf8"
    );

    assert.match(route, /isAdminSecretConfigured\(\)/);
    assert.match(route, /adminSecretMatches\(/);
    assert.doesNotMatch(route, /export async function POST/, "the probe must be read-only");
  });
});
