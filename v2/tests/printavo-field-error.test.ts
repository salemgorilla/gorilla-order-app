/**
 * THE NEXT FAILURE SHOULD CARRY ITS OWN ANSWER.
 *
 * ── THE LOOP THIS ENDS ────────────────────────────────────────────────────
 * The press query is the one place this app READS a Printavo shape it never
 * wrote, and the published schema has been wrong for this integration
 * before. So it gets discovered one field at a time, and each round costs a
 * deploy:
 *
 *   21 Sep   Argument 'sortOn' has an invalid value (CREATED_AT_DESC)
 *   25 Sep   Field 'quantity' doesn't exist on type 'LineItem'
 *
 * Both sat in the logs saying exactly which thing was wrong and nothing
 * about what to use instead. describePrintavoSchema can answer that — it is
 * what /api/printavo-schema serves — but reaching it needs ADMIN_SECRET and
 * a person, so the loop stayed manual while the hero line stayed dark.
 *
 * The probe is injected here for the same reason the blob probe is: the
 * real one talks to Printavo, and a test that reaches the live account is
 * not a test.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { explainPrintavoFieldError } from "../lib/printavo";

/** A schema probe that answers for one type. */
function schemaWith(types: Record<string, string[] | null>) {
  return async () => ({ ok: true, types });
}

const REAL = "Printavo: Field 'quantity' doesn't exist on type 'LineItem'";

describe("a field error comes back with the type's real fields", () => {
  test("it names what the type actually has", async () => {
    const out = await explainPrintavoFieldError(
      REAL,
      schemaWith({ LineItem: ["id", "itemNumber", "items", "price", "size"] })
    );

    // The original sentence is kept — it is the finding.
    assert.match(out, /Field 'quantity' doesn't exist/);
    // And now the answer rides with it.
    assert.match(out, /'LineItem' has: id, itemNumber, items, price, size/);
    assert.match(out, /Pick the one that carries 'quantity'/);
  });

  test("an unrelated error is returned untouched", async () => {
    // Only the "Field 'x' doesn't exist on type 'Y'" shape triggers a probe.
    // Anything else must not cost a schema round-trip.
    let asked = false;
    const out = await explainPrintavoFieldError(
      "Printavo: Argument 'sortOn' on Field 'invoices' has an invalid value",
      (async () => {
        asked = true;
        return { ok: true, types: {} };
      }) as never
    );

    assert.equal(out, "Printavo: Argument 'sortOn' on Field 'invoices' has an invalid value");
    assert.equal(asked, false, "a schema probe ran for an error it cannot explain");
  });
});

describe("the diagnostic never becomes the outage", () => {
  test("a probe that throws leaves the original sentence intact", async () => {
    /**
     * This runs inside a request that is ALREADY degraded. If it threw, a
     * hero line with no data would become a failed endpoint — the
     * diagnostic making things worse than the thing it diagnoses.
     */
    const out = await explainPrintavoFieldError(REAL, (async () => {
      throw new Error("printavo unreachable");
    }) as never);

    assert.equal(out, REAL);
  });

  test("a type the schema cannot describe says so, rather than nothing", async () => {
    const out = await explainPrintavoFieldError(REAL, schemaWith({ LineItem: null }));

    assert.match(out, /could not read the fields of LineItem/);
    assert.match(out, /Field 'quantity' doesn't exist/);
  });

  test("an empty field list is treated as no answer, not as 'it has none'", async () => {
    const out = await explainPrintavoFieldError(REAL, schemaWith({ LineItem: [] }));

    assert.match(out, /could not read the fields of LineItem/);
  });
});
