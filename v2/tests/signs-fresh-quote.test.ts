import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSignsQuote, defaultSignsQuote } from "../lib/signs";

/**
 * What the next customer gets when someone presses "Start a new quote".
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * startNewQuote called `setSignsQuote(defaultSignsQuote)` — the module
 * constant, built once at import. Its design therefore carries ONE fixed id
 * for the life of the page.
 *
 * Signs artwork previews are keyed by design id (`signsDesignPreviews`), and
 * reset never cleared that map. So the fresh quote's design had the same id
 * as the last one, the map still held the old entry, and
 * `signsDesignPreviews[design.id]` — read directly in the upload box and the
 * preview card — rendered the PREVIOUS customer's artwork on a brand-new
 * empty quote. Worst at the kiosk: one customer after another on the shop's
 * own terminal.
 *
 * The object URLs leaked too, one per design for the life of the tab.
 *
 * ── IT WAS ALREADY SOLVED NEXT DOOR ───────────────────────────────────────
 * The sticker cart hit this and fixed it, and startNewQuote says so two lines
 * above the signs line: "A fresh item, not the one baked into defaultOrder at
 * import time — reusing it would hand every reset order the same design id."
 * Signs missed it when they grew a design list, which is the recurring shape
 * in this repo: correct for one flow, wrong for its sibling.
 */

describe("a new quote is genuinely new", () => {
  test("every call returns a design id nothing has held", () => {
    const ids = Array.from({ length: 5 }, () => createSignsQuote().designs[0].id);

    assert.equal(new Set(ids).size, 5, `repeated ids: ${ids.join(", ")}`);
  });

  test("and never the constant's id, which the preview map may still key", () => {
    const reused = defaultSignsQuote.designs[0].id;

    for (let i = 0; i < 5; i += 1) {
      assert.notEqual(createSignsQuote().designs[0].id, reused);
    }
  });

  test("the constant itself is stable, so it stays safe as an initial value", () => {
    // Asserted so nobody "fixes" this by making defaultSignsQuote a getter —
    // it is a value, and the fresh one comes from the function.
    assert.equal(defaultSignsQuote.designs[0].id, defaultSignsQuote.designs[0].id);
    assert.equal(defaultSignsQuote.designs.length, 1);
  });

  test("a new quote shares no mutable state with the constant", () => {
    const fresh = createSignsQuote();

    assert.notEqual(fresh.designs, defaultSignsQuote.designs);
    assert.notEqual(fresh.designs[0], defaultSignsQuote.designs[0]);
    assert.notEqual(fresh.designs[0].artwork, defaultSignsQuote.designs[0].artwork);
    assert.notEqual(
      fresh.designs[0].templateText,
      defaultSignsQuote.designs[0].templateText
    );
  });

  test("it starts at one design, whatever the last quote held", () => {
    assert.equal(createSignsQuote().designs.length, 1);
  });
});

describe("reset lets go of what it is replacing", () => {
  const page = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8"
  );

  const startNewQuote = page.slice(
    page.indexOf("function startNewQuote()"),
    page.indexOf("function startNewQuote()") + 3000
  );

  test("startNewQuote revokes the signs previews and empties the map", () => {
    // Read from the source because this lives in a component this repo has no
    // renderer for. Crude, but the alternative is not checking at all — and
    // the leak it guards is one object URL per design, per quote, for the
    // life of the tab.
    assert.match(startNewQuote, /signsDesignPreviews/);
    assert.match(startNewQuote, /revokeObjectURL/);
    assert.match(startNewQuote, /setSignsDesignPreviews\(\{\}\)/);
  });

  test("and asks for fresh quotes rather than the import-time one", () => {
    // Both pipelines since the hard split — each family's cart gets its own
    // fresh design with an id nothing else has held, which is the whole
    // point of createSignsQuote being a function.
    assert.match(
      startNewQuote,
      /banners: createSignsQuote\("banners"\),\s*\n?\s*signs: createSignsQuote\("signs"\)/
    );
    assert.doesNotMatch(startNewQuote, /defaultSignsQuote/);
  });
});
