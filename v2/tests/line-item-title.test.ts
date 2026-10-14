import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_TITLE_LENGTH,
  lineItemTitle,
  signsFallbackTitle,
  stickerFallbackTitle,
  titleFromDesignName,
  titleFromFileName,
} from "../lib/line-item-title";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { repriceStickers } from "../lib/sticker-repricing";

/**
 * WHAT EACH LINE ON THE INVOICE IS CALLED.
 *
 * Every row led with "Design 1", which says which row you are looking at and
 * nothing about which job. Gabe, 2026-09-28: "I would like the name of each
 * line item to be named either after the file name uploaded for that file, or
 * a short descriptor to denote the job is identified properly."
 *
 * The file name was already in the payload and was being used only in the
 * shop email — and the shop reads the Printavo job, not the email, when it
 * goes to make the thing.
 */

describe("a file name becomes a title", () => {
  test("the ordinary case", () => {
    assert.equal(titleFromFileName("gorilla-head-diecut.svg"), "gorilla-head-diecut");
    assert.equal(titleFromFileName("HOCKEY PUCK FILE UPDATE.pdf"), "HOCKEY PUCK FILE UPDATE");
  });

  test("a path is stripped, both separators", () => {
    // A Windows client sends backslashes, and some browsers send a relative
    // path rather than a bare name.
    assert.equal(titleFromFileName("downloads/salem-witch.ai"), "salem-witch");
    assert.equal(titleFromFileName("C:\\Users\\gabe\\My Art\\back patch.png"), "back patch");
  });

  test("underscores read as spaces, runs collapse", () => {
    assert.equal(titleFromFileName("salem_witch_logo__v3.ai"), "salem witch logo v3");
    assert.equal(titleFromFileName("  spaced   out  .png"), "spaced out");
  });

  test("only a real-looking extension is dropped", () => {
    // "v2.1 logo" must keep its ".1" — a version is not a file type.
    assert.equal(titleFromFileName("v2.1 logo"), "v2.1 logo");
    assert.equal(titleFromFileName("logo.jpeg"), "logo");
    // All extension and nothing else: there is nothing to drop.
    assert.equal(titleFromFileName(".png"), ".png");
  });

  test("trailing whitespace does not save the extension", () => {
    // The extension regex is end-anchored and the control-character pass
    // turns a trailing newline into a space, so "logo.png\n" reached it as
    // "logo.png " and kept its extension — printing "logo.png" on the
    // invoice where every other file printed "logo". Found by mutation
    // testing the strip that creates the space.
    assert.equal(titleFromFileName("logo.png\n"), "logo");
    assert.equal(titleFromFileName("  logo.png  "), "logo");
    assert.equal(titleFromFileName("logo.png\t"), "logo");
  });

  test("nothing usable is null, so the caller falls back", () => {
    for (const value of [null, undefined, 42, {}, [], "", "   ", "___", "\n\n"]) {
      assert.equal(titleFromFileName(value), null, JSON.stringify(value));
    }
  });
});

describe("the file name is customer-supplied text going onto an invoice", () => {
  test("a newline cannot forge a spec line", () => {
    /**
     * THE ONE THAT MATTERS. A Printavo line description is MULTI-LINE — the
     * spec sits under the title on its own lines — so a file name carrying a
     * newline would print as a spec row the shop never wrote:
     *
     *     my-logo
     *     Size: 99in x 99in      <- typed by the customer
     *
     * /api/quote is public and the name arrives from the browser.
     */
    const forged = titleFromFileName("evil\nSize: 99in x 99in\nShape: Circle.png");

    assert.ok(forged);
    assert.ok(!forged.includes("\n"), "a newline survived into the title");
    assert.ok(!forged.includes("\r"), "a carriage return survived into the title");
  });

  test("no control character survives", () => {
    const title = titleFromFileName("a\u0000b\u0007c\u001bd\u007fe.png");
    assert.ok(title);
    assert.ok(
      !/[\u0000-\u001f\u007f]/.test(title),
      `control characters survived: ${JSON.stringify(title)}`
    );
  });

  test("a long name is capped, not printed whole", () => {
    const title = titleFromFileName(`${"x".repeat(400)}.png`);
    assert.ok(title);
    assert.ok(
      title.length <= MAX_TITLE_LENGTH,
      `title is ${title.length} characters, cap is ${MAX_TITLE_LENGTH}`
    );
    assert.match(title, /\u2026$/, "a truncated title should say it was truncated");
  });
});

describe("rows stay distinguishable — the job 'Design N' was also doing", () => {
  test("more than one design keeps the number", () => {
    // Two identical designs once produced byte-identical rows the shop could
    // not tell apart (CART-PLAN bug 3). Two designs can easily share a file
    // name, or have none.
    const first = lineItemTitle({ fileName: "logo.png", fallback: "x", position: 1, total: 2 });
    const second = lineItemTitle({ fileName: "logo.png", fallback: "x", position: 2, total: 2 });

    assert.notEqual(first, second);
    assert.match(first, /\(Design 1\)$/);
    assert.match(second, /\(Design 2\)$/);
  });

  test("a single design needs no number and does not get one", () => {
    assert.equal(
      lineItemTitle({ fileName: "logo.png", fallback: "x", position: 1, total: 1 }),
      "logo"
    );
  });

  test("no file name falls back to a descriptor, never to nothing", () => {
    assert.equal(
      lineItemTitle({ fileName: null, fallback: '3in x 3in Die Cut Sticker', position: 1, total: 1 }),
      "3in x 3in Die Cut Sticker"
    );
    // Total by design: a cart row is never nameless. With neither a file
    // name nor a fallback it lands back on the old behaviour rather than an
    // empty title — the last resort, not the normal path.
    assert.equal(
      lineItemTitle({ fileName: null, fallback: "", position: 2, total: 3 }),
      "Design 2 (Design 2)"
    );
  });

  test("the descriptors say what the thing is", () => {
    assert.equal(
      stickerFallbackTitle({ widthInches: 3, heightInches: 3, shape: "Die Cut" }),
      "3in x 3in Die Cut Sticker"
    );
    assert.equal(
      stickerFallbackTitle({ size: '4"', shape: "Circle" }),
      '4" Circle Sticker'
    );
    assert.equal(
      signsFallbackTitle({ signType: "Vinyl Banner", size: '72" x 36"' }),
      'Vinyl Banner 72" x 36"'
    );
    assert.equal(signsFallbackTitle({}), "Sign");
  });
});

describe("the customer can name the run themselves", () => {
  test("a typed name outranks the file name", () => {
    // "Fall Market Stickers" is what they call the job. "export_final_v7.ai"
    // is what their software called the export. Gabe, 2026-09-28.
    assert.equal(
      lineItemTitle({
        designName: "Fall Market Stickers",
        fileName: "export_final_v7.ai",
        fallback: "3in x 3in Die Cut Sticker",
        position: 1,
        total: 1,
      }),
      "Fall Market Stickers"
    );
  });

  test("the whole preference order, one step at a time", () => {
    const base = { fallback: "3in x 3in Die Cut Sticker", position: 1, total: 1 };

    assert.equal(
      lineItemTitle({ ...base, designName: "Named", fileName: "file.ai" }),
      "Named"
    );
    assert.equal(lineItemTitle({ ...base, designName: "", fileName: "file.ai" }), "file");
    assert.equal(lineItemTitle({ ...base, designName: "", fileName: null }), base.fallback);
  });

  test("a blank or whitespace name falls through rather than blanking the row", () => {
    // An input the customer clicked into and left is not a name.
    for (const designName of ["", "   ", "\n", undefined, null, 42]) {
      assert.equal(
        lineItemTitle({ designName, fileName: "file.ai", fallback: "x", position: 1, total: 1 }),
        "file",
        JSON.stringify(designName)
      );
    }
  });

  test("a typed name is customer text too, and gets the same treatment", () => {
    // Same hazard as the file name: it is printed on the shop's invoice, and
    // /api/quote is public even though the form's input is single-line.
    const forged = titleFromDesignName("Fall Market\nSize: 99in x 99in");
    assert.ok(forged);
    assert.ok(!forged.includes("\n"), "a newline survived into the title");

    const long = titleFromDesignName("y".repeat(300));
    assert.ok(long && long.length <= MAX_TITLE_LENGTH);
  });

  test("unlike a file name, nothing is stripped from it", () => {
    // No path, no extension: a design called "v2.1" keeps every character,
    // and one called "logo.png" was typed that way on purpose.
    assert.equal(titleFromDesignName("v2.1"), "v2.1");
    assert.equal(titleFromDesignName("logo.png"), "logo.png");
    assert.equal(titleFromDesignName("Spring/Summer run"), "Spring/Summer run");
  });
});

describe("through the real Printavo plan", () => {
  function stickerPlan(
    items: Array<{ q: number; s: number; file?: string | null; name?: string }>
  ) {
    const designs = items.map((d, i) => ({
      id: `design-${i + 1}`,
      type: "Custom Stickers",
      quantity: d.q,
      size: `${d.s}"`,
      widthInches: d.s,
      heightInches: d.s,
      shape: "Die Cut",
      material: "Gloss White Vinyl",
      finish: "Gloss",
      artworkFileName: d.file ?? null,
      designName: d.name ?? "",
    }));

    const order = {
      customer: { customerName: "X", email: "x@y.com" },
      production: { deliveryMethod: "Pickup" },
      product: {
        ...designs[0],
        quantity: designs.reduce((sum, d) => sum + d.quantity, 0),
        designCount: designs.length,
      },
      items: designs,
      pricing: {},
    } as Record<string, unknown>;

    const repriced = repriceStickers(order) as { order: Record<string, unknown> };

    return (
      buildPrintavoQuotePlan({
        quoteNumber: "GS-TITLE",
        order: repriced.order,
        artworkAnalysis: null,
      } as never) as unknown as {
        lineItems: Array<{ description: string; itemNumber: string }>;
      }
    ).lineItems;
  }

  test("a cart names each row after its own file", () => {
    const rows = stickerPlan([
      { q: 100, s: 3, file: "HOCKEY PUCK FILE UPDATE.pdf" },
      { q: 50, s: 2, file: "downloads/salem-witch_v3.ai" },
    ]);

    assert.equal(rows[0].description.split("\n")[0], "HOCKEY PUCK FILE UPDATE (Design 1)");
    assert.equal(rows[1].description.split("\n")[0], "salem-witch v3 (Design 2)");
  });

  test("the spec underneath is untouched", () => {
    // The title is prepended context, not a replacement. The note below it is
    // what a printer actually works from and no line of it is redundant.
    const rows = stickerPlan([{ q: 100, s: 3, file: "a.png" }, { q: 50, s: 2, file: "b.png" }]);

    assert.match(rows[0].description, /100x Custom Stickers/);
    assert.match(rows[0].description, /Size: 3in x 3in/);
    assert.match(rows[0].description, /Shape: Die Cut/);
  });

  test("no file still names the row usefully, never 'Design 1' alone", () => {
    const rows = stickerPlan([{ q: 100, s: 3 }, { q: 100, s: 3 }]);

    assert.equal(rows[0].description.split("\n")[0], "3in x 3in Die Cut Sticker (Design 1)");
    assert.notEqual(rows[0].description.split("\n")[0], "Design 1");
  });

  test("THE ITEM NUMBER DOES NOT MOVE", () => {
    /**
     * The customer reads "Invoice line: GORILLA-DECAL-2" on the review screen
     * and lays it beside the Printavo invoice —
     * tests/sku-agreement.test.ts holds the two equal. The title is the
     * DESCRIPTION; renaming rows must not touch what they file under, or
     * that promise breaks and "how many decals did we sell" loses its answer.
     */
    const named = stickerPlan([{ q: 100, s: 3, file: "x.png" }, { q: 50, s: 2, file: "y.png" }]);
    const unnamed = stickerPlan([{ q: 100, s: 3 }, { q: 50, s: 2 }]);

    assert.deepEqual(
      named.map((row) => row.itemNumber),
      unnamed.map((row) => row.itemNumber)
    );
    assert.deepEqual(named.map((row) => row.itemNumber), ["GORILLA-DECAL-1", "GORILLA-DECAL-2"]);
  });

  test("a named design titles its own row, ahead of the file", () => {
    const rows = stickerPlan([
      { q: 100, s: 3, file: "export_final_v7.ai", name: "Fall Market Stickers" },
      { q: 50, s: 2, file: "back-patch.png" },
    ]);

    assert.equal(rows[0].description.split("\n")[0], "Fall Market Stickers (Design 1)");
    assert.equal(rows[1].description.split("\n")[0], "back-patch (Design 2)");
  });

  test("a forged spec line does not reach the invoice", () => {
    const rows = stickerPlan([
      { q: 100, s: 3, file: "evil\nSize: 99in x 99in.png" },
      { q: 50, s: 2, file: "ok.png" },
    ]);

    const title = rows[0].description.split("\n")[0];
    assert.ok(title.includes("Size: 99in x 99in"), "expected it flattened INTO the title");
    assert.ok(
      !rows[0].description.split("\n").slice(1).some((line) => line === "Size: 99in x 99in"),
      "the customer's text became its own spec line on the invoice"
    );
  });
});
