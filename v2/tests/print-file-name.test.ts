import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_PRINT_NAME_LENGTH,
  describePrintSize,
  extensionOf,
  printFileName,
} from "../lib/print-file-name";
import { decalSku } from "../lib/sku";

/**
 * WHAT THE SHOP'S PRINT FILE IS CALLED.
 *
 * Gabe, 2026-09-28, asking for the artwork file he prints from to identify
 * itself: `GORILLA-DECAL-1: 2.5"x2.5" - 100 pcs`. It arrived as
 * `design-1-logo.png` — the cart position plus whatever the customer's
 * software called the export, which says nothing about what to cut.
 */

describe("the format Gabe asked for", () => {
  test("SKU, size, count — in that order", () => {
    assert.equal(
      printFileName({
        sku: decalSku(0, 3),
        originalName: "logo.png",
        widthInches: 2.5,
        heightInches: 2.5,
        quantity: 100,
      }),
      "GORILLA-DECAL-1 - 2.5in x 2.5in - 100 pcs.png"
    );
  });

  test("the extension is the customer's real one, never invented", () => {
    // The shop has to be able to OPEN it. A .ai renamed to .png is worse
    // than a badly named .ai.
    for (const [file, expected] of [
      ["art.ai", ".ai"],
      ["art.PDF", ".PDF"],
      ["art.jpeg", ".jpeg"],
      ["no-extension", ""],
    ] as const) {
      assert.equal(extensionOf(file), expected);
    }

    assert.match(
      printFileName({ sku: "GORILLA-DECAL", originalName: "back patch.ai", widthInches: 4, heightInches: 2, quantity: 25 }),
      /\.ai$/
    );
  });

  test("trailing zeros go — 2.50 x 2.50 is noise", () => {
    assert.equal(describePrintSize({ widthInches: 2.5, heightInches: 6.0 }), "2.5in x 6in");
    assert.equal(describePrintSize({ widthInches: 3, heightInches: 3 }), "3in x 3in");
  });

  test("no dimensions falls back to the size the customer chose", () => {
    assert.equal(describePrintSize({ size: '3″' }), "3in");
    assert.equal(describePrintSize({ size: '3"' }), "3in");
  });

  test("a missing part is dropped, never printed empty", () => {
    // "GORILLA-DECAL-1 -  - 100 pcs" helps nobody.
    const noQuantity = printFileName({
      sku: "GORILLA-DECAL",
      originalName: "a.png",
      widthInches: 3,
      heightInches: 3,
    });

    assert.equal(noQuantity, "GORILLA-DECAL - 3in x 3in.png");
    assert.ok(!noQuantity.includes(" -  - "), "an empty part was printed");
  });
});

describe("the characters that cannot be in a filename", () => {
  /**
   * THE WHOLE REASON THIS IS A FUNCTION AND NOT A TEMPLATE STRING.
   *
   * The requested format contains `:` and `"`. Both are forbidden on
   * Windows — which is what the shop runs (Accurip, Separation Studio) — and
   * the quote ALSO terminates the quoted value in
   * `Content-Disposition: attachment; filename="..."`, so a mail client
   * reading the header sees the name end early.
   *
   * A file that cannot be saved is worse than one that is badly named,
   * because it fails at the one moment it has to work.
   */
  test("no reserved character survives, whatever is fed in", () => {
    const hostile = printFileName({
      sku: 'GORILLA<DECAL>:1"/\\|?*',
      originalName: "a.png",
      size: 'we"ird:size',
      quantity: 10,
    });

    assert.ok(
      !/[<>:"/\\|?*]/.test(hostile),
      `reserved characters survived: ${JSON.stringify(hostile)}`
    );
  });

  test("the inch marks Gabe wrote become 'in', not nothing", () => {
    // The size still has to READ as a size. Dropping the marks would give
    // "2.5 x 2.5", which is a ratio, not a measurement.
    const named = printFileName({
      sku: "GORILLA-DECAL-1",
      originalName: "a.png",
      widthInches: 2.5,
      heightInches: 2.5,
      quantity: 100,
    });

    assert.ok(named.includes("2.5in x 2.5in"), named);
  });

  test("no control character, and no leading or trailing dot", () => {
    // A trailing dot makes a Windows file unopenable; a leading one hides it
    // on unix.
    const named = printFileName({
      sku: "..GORILLA\nDECAL..",
      originalName: "a.png",
      quantity: 5,
    });

    assert.ok(!/[\u0000-\u001f\u007f]/.test(named));
    assert.ok(!named.startsWith("."), named);
    assert.ok(!/\.$/.test(named.replace(/\.png$/, "")), named);
  });

  test("a long name is capped", () => {
    const named = printFileName({
      sku: "G".repeat(400),
      originalName: "a.png",
      quantity: 100,
    });

    assert.ok(
      named.length <= MAX_PRINT_NAME_LENGTH + ".png".length,
      `${named.length} characters`
    );
  });

  test("nothing usable keeps the customer's own name", () => {
    // Never invent a file called "" or ".png".
    assert.equal(
      printFileName({ sku: "", originalName: "customer-art.png" }),
      "customer-art.png"
    );
  });
});

describe("the file and the invoice line agree", () => {
  test("the SKU in the name is the SKU on the invoice", () => {
    /**
     * The point of the whole name: lay the file beside the invoice and they
     * match. decalSku is the same function buildPrintavoQuotePlan calls, so
     * a single design is GORILLA-DECAL — unnumbered, exactly as its invoice
     * line reads — and a cart is numbered.
     */
    assert.match(
      printFileName({ sku: decalSku(0, 1), originalName: "a.png", quantity: 50, widthInches: 3, heightInches: 3 }),
      /^GORILLA-DECAL - /
    );
    assert.match(
      printFileName({ sku: decalSku(1, 3), originalName: "a.png", quantity: 50, widthInches: 3, heightInches: 3 }),
      /^GORILLA-DECAL-2 - /
    );
  });

  test("three designs give three distinguishable files", () => {
    const names = [0, 1, 2].map((index) =>
      printFileName({
        sku: decalSku(index, 3),
        originalName: "logo.png",
        widthInches: 3,
        heightInches: 3,
        quantity: 100,
      })
    );

    // Same artwork name, same spec, same count — the SKU is what separates
    // them, and three files called logo.png in one folder is the problem
    // this replaces.
    assert.equal(new Set(names).size, 3, names.join(" / "));
  });
});
