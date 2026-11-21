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
import { garmentFamily, placementsFor } from "../lib/print-placements";

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
 * The seeded zones were measured against S&S's photos on 2026-11-21 and
 * ship verified:true (see the note above garmentZones). The gate itself is
 * still pinned below with an injected table, so a placeholder added later
 * cannot render until someone flips it after looking at the picture.
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
    // Injected table: a placeholder must never render, whatever its numbers.
    const zones = {
      "39": { Front: { ...VERIFIED, verified: false }, Back: { ...VERIFIED, verified: false } },
    };

    assert.equal(getVerifiedGarmentZone("39", "Front", zones), null);
    assert.equal(getVerifiedGarmentZone("39", "Back", zones), null);
  });

  test("every catalog style composites, front and back", () => {
    // The measured table: each live garment has a verified zone on both
    // sides, so the mockup shows instead of the side-by-side fallback.
    for (const item of apparelCatalogItems) {
      for (const placement of ["Front", "Back"] as const) {
        assert.ok(
          getVerifiedGarmentZone(item.style, placement),
          `${item.label} ${placement} has no verified zone`
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
    const zones = { "39": { Front: VERIFIED } };

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
        if (!zone) continue;
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

  test("every box stays on the photo; the centred ones stay centred", () => {
    // Left chest and sleeve sit off centre on purpose; nothing else does.
    const offCentre = new Set(["Left Chest", "Sleeve"]);

    for (const [style, zones] of Object.entries(garmentZones)) {
      for (const [placement, zone] of Object.entries(zones)) {
        if (!zone) continue;
        const label = `${style} ${placement}`;
        assert.ok(zone.centerX - zone.width / 2 >= 0, `${label} runs off the left`);
        assert.ok(zone.centerX + zone.width / 2 <= 1, `${label} runs off the right`);
        assert.ok(zone.top + zone.maxHeight <= 1, `${label} runs off the bottom`);
        if (!offCentre.has(placement)) {
          assert.ok(Math.abs(zone.centerX - 0.5) < 0.02, `${label} is off centre`);
        }
      }
    }
  });

  test("left chest and sleeve sit on the wearer's left: the photo's right", () => {
    for (const [style, zones] of Object.entries(garmentZones)) {
      for (const placement of ["Left Chest", "Sleeve"]) {
        const zone = zones[placement];
        assert.ok(zone && zone.centerX > 0.55, `${style} ${placement} is not on the left side`);
      }
    }
  });

  test("every hoodie front box ends above the pouch pocket", () => {
    // Measured: the pocket's top edge sits at ~0.525 of the 18500 photo.
    for (const placement of ["Left Chest", "Center Chest", "Front"]) {
      const zone = garmentZones["395"][placement]!;
      assert.ok(zone.top + zone.maxHeight <= 0.5, `${placement} runs into the pocket`);
    }
  });

  test("every placement a catalog garment offers has a verified zone, and no others", () => {
    for (const item of apparelCatalogItems) {
      const offered = placementsFor(garmentFamily({ catalogStyle: item.style }))
        .map((placement) => placement.id)
        .sort();
      assert.deepEqual(Object.keys(garmentZones[item.style]).sort(), offered, item.label);
      for (const id of offered) {
        assert.ok(getVerifiedGarmentZone(item.style, id), `${item.label} ${id}`);
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
    assert.match(preview, /getVerifiedGarmentZone\(catalogStyle, location\)/);
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

  test("the front face wins, and every placement on it is drawn", () => {
    assert.match(preview, /const side = frontPlacements\.length\s*\n?\s*\? \("front" as const\)/);
    assert.match(preview, /extraZones,/);
  });

  test("a back placement composites onto the back photo", () => {
    // Back zones are measured on the back photograph; drawn on the front
    // photo they land on the chest.
    assert.match(preview, /side === "back" \? garmentBackImage : garmentImage/);
    assert.match(preview, /garmentUrl: placementImage/);
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.match(page, /garmentBackImage=\{selectedGarmentBackPhotoSrc\}/);
    assert.match(page, /chosenSsColor\?\.backImage/);
  });

  test("the page passes the style through", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.match(page, /catalogStyle=\{selectedSsProduct\?\.catalogStyle\}/);
  });
});
