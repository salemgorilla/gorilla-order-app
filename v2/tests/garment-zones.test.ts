import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  garmentZones,
  getVerifiedGarmentZone,
  type GarmentZone,
} from "../lib/garment-zones";
import { composeGarmentMockup } from "../lib/garment-composite";
import { apparelCatalogItems } from "../lib/apparel-catalog";

/**
 * The apparel mockup composite, and the gate in front of it.
 *
 * ── THE RULE THIS PINS ────────────────────────────────────────────────────
 * ApparelPreview shows garment and artwork side by side BECAUSE the
 * component it replaced pinned art to guessed coordinates and called it a
 * proof. A composite is only ever rendered from a zone a HUMAN has checked
 * against the style's actual photograph — `verified: true` is that
 * signature, and getVerifiedGarmentZone() returning null for everything
 * else is what makes the fallback automatic. There is no flag to remember.
 *
 * Every zone ships verified:false with placeholder numbers, so nothing
 * customer-facing changes until someone does the look-at-a-picture work
 * (see the handoff in lib/garment-zones.ts's header).
 */

const VERIFIED: GarmentZone = {
  verified: true,
  centerX: 0.5,
  top: 0.3,
  width: 0.35,
  maxHeight: 0.3,
};

describe("the gate", () => {
  test("an unverified zone is null — the whole safety property", () => {
    // Every seeded style, both placements: placeholders must never render.
    for (const item of apparelCatalogItems) {
      for (const placement of ["Front", "Back"] as const) {
        assert.equal(
          getVerifiedGarmentZone(item.style, placement),
          null,
          `${item.label} ${placement} would render from placeholder coordinates`
        );
      }
    }
  });

  test("unknown style, unknown placement, and no style are all null", () => {
    assert.equal(getVerifiedGarmentZone("9999", "Front"), null);
    assert.equal(getVerifiedGarmentZone(null, "Front"), null);
    assert.equal(getVerifiedGarmentZone(undefined, "Back"), null);
  });

  test("a verified zone comes back exactly", () => {
    // Injected table: the true path, without flipping anything in the real
    // one before a human has done the verification.
    const zones = { "39": { front: VERIFIED } };

    assert.equal(getVerifiedGarmentZone("39", "Front", zones), VERIFIED);
    assert.equal(getVerifiedGarmentZone("39", "Back", zones), null);
  });
});

describe("the seeded table is coherent", () => {
  test("every style in the apparel catalog has a zone entry, and no extras", () => {
    // A new garment added to the catalog without a zone entry silently
    // never composites; an entry for a removed garment is a stale guess
    // waiting to be verified against a photo that no longer exists.
    assert.deepEqual(
      Object.keys(garmentZones).sort(),
      apparelCatalogItems.map((item) => item.style).sort()
    );
  });

  test("every fraction is a fraction", () => {
    for (const [style, zones] of Object.entries(garmentZones)) {
      for (const zone of Object.values(zones)) {
        for (const [key, value] of Object.entries(zone)) {
          if (key === "verified") continue;
          assert.ok(
            typeof value === "number" && value > 0 && value <= 1,
            `${style} ${key} = ${value} is not a usable fraction of a photo`
          );
        }
      }
    }
  });
});

describe("the compositor's contract", () => {
  test("no DOM means null, never a throw", async () => {
    // The sticker-proof contract: a mockup is a courtesy, and no failure of
    // it can be worth blocking a quote over. In node there is no document,
    // which doubles as the no-canvas failure path.
    assert.equal(
      await composeGarmentMockup({
        garmentUrl: "https://example.com/shirt.png",
        artworkUrl: "blob:whatever",
        zone: VERIFIED,
      }),
      null
    );
  });
});

describe("the component keeps its honest default", () => {
  const preview = readFileSync(
    new URL("../components/preview/ApparelPreview.tsx", import.meta.url),
    "utf8"
  );

  test("the composite renders only from a verified zone", () => {
    assert.match(preview, /getVerifiedGarmentZone\(catalogStyle, placement\)/);
    assert.match(preview, /mockupUrl \? \(/);
  });

  test("the side-by-side view is still there, word for word", () => {
    // The fallback IS the feature the old component exists for. These are
    // its two captions; losing either means the fallback was edited rather
    // than preserved.
    assert.match(preview, /The garment/);
    assert.match(preview, /Your artwork/);
    assert.match(preview, /shown side by side, not to final size or/);
  });

  test("front wins when both locations are picked", () => {
    assert.match(
      preview,
      /printLocations\.includes\("Front"\)\s*\n?\s*\? \("Front" as const\)/
    );
  });

  test("the page passes the style through", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.match(page, /catalogStyle=\{selectedSsProduct\?\.catalogStyle\}/);
  });
});
