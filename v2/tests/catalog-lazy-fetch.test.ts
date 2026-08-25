import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The S&S catalog loads when apparel is selected — not on page load.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * The fetch used to run on mount for every visitor. With apparel shipping
 * as a request flow, nothing in production rendered a byte of the response:
 * sticker and signs customers paid the wire and the JSON parse of three
 * garments and 191 colours for a panel that never mounts — and every page
 * load took a dependency on S&S being up, which is how their week-long 401
 * reached 44 visitors who never asked about shirts.
 *
 * Verified in Chromium: zero /api/ss-catalog requests after load and after
 * selecting stickers and banners; exactly one after selecting apparel; and
 * still one after deselecting and re-selecting.
 *
 * These pin the guard; the effect is a closure over page state.
 */

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

describe("the catalog fetch is gated on the apparel selection", () => {
  test("the effect returns before fetching unless apparel is selected", () => {
    assert.match(
      page,
      /if \(!isApparelSelected \|\| ssCatalogStatus !== "idle"\) return;\s*\n\s*async function loadSsCatalog/
    );
  });

  test("the status guard makes it one-shot", () => {
    // "idle" is the only state that fetches. Without it, the effect's
    // dependency on ssCatalogStatus would re-fire on every transition —
    // "error" would retry in a loop against a host that just failed.
    assert.match(page, /ssCatalogStatus !== "idle"\) return;/);
    assert.match(page, /\}, \[apparelIsRequestFlow, isApparelSelected, ssCatalogStatus\]\);/);
  });
});
