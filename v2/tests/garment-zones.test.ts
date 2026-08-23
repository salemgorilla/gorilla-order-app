import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  garmentZones,
  getVerifiedGarmentZone,
  pickGarmentPlacement,
  type GarmentPlacement,
} from "../lib/garment-zones";
import { apparelCatalogItems } from "../lib/apparel-catalog";

/**
 * The gate in front of the apparel composite.
 *
 * `ApparelPreview` composites artwork onto a real garment photograph only when
 * this lookup hands back a zone. Everything else — an unknown style, a zone
 * still carrying placeholder numbers — has to come back null so the preview
 * falls back to the side-by-side view. Pinning that here because the failure
 * mode is silent and expensive: a zone that leaks through unverified shows a
 * customer their art at a spot nobody checked, on a photograph, captioned as a
 * preview. That is the exact bug the side-by-side view was written to end.
 *
 * The range assertions below are aimed at the OTHER direction. Verifying a
 * zone means hand-editing six numbers off a photograph, and a typo there (0.32
 * where 0.032 was meant, a width that runs off the right edge) produces a
 * composite that renders happily and is wrong. These catch the ones arithmetic
 * can catch.
 */

const PLACEMENTS: GarmentPlacement[] = ["Front", "Back"];

describe("getVerifiedGarmentZone", () => {
  test("returns null for a style nobody has entered", () => {
    assert.equal(getVerifiedGarmentZone("does-not-exist", "Front"), null);
    // The manufacturer model number, which is NOT the key — S&S styleIDs are.
    // Someone reaching for "2000" instead of "39" gets the fallback, not a
    // zone belonging to a different garment.
    assert.equal(getVerifiedGarmentZone("2000", "Front"), null);
  });

  test("returns null when there is no style at all", () => {
    assert.equal(getVerifiedGarmentZone(null, "Front"), null);
    assert.equal(getVerifiedGarmentZone(undefined, "Front"), null);
    assert.equal(getVerifiedGarmentZone("", "Front"), null);
    assert.equal(getVerifiedGarmentZone("   ", "Front"), null);
  });

  test("never hands back a zone that has not been verified", () => {
    for (const [style, placements] of Object.entries(garmentZones)) {
      for (const placement of PLACEMENTS) {
        const zone = placements[placement];
        if (!zone || zone.verified) continue;

        assert.equal(
          getVerifiedGarmentZone(style, placement),
          null,
          `${style} ${placement} is unverified and must not composite`
        );
      }
    }
  });

  test("hands back the zone once it is verified", () => {
    // Vacuous while every seeded zone is still a placeholder, and that is the
    // point: it starts asserting the moment someone measures one, without
    // anybody having to remember to come back and write this test.
    for (const [style, placements] of Object.entries(garmentZones)) {
      for (const placement of PLACEMENTS) {
        const zone = placements[placement];
        if (!zone?.verified) continue;

        assert.equal(getVerifiedGarmentZone(style, placement), zone);
      }
    }
  });
});

describe("the zone table", () => {
  test("covers every style the apparel flow can select", () => {
    for (const item of apparelCatalogItems) {
      const placements = garmentZones[item.style];

      assert.ok(
        placements,
        `${item.label} (style ${item.style}) has no zone entry — add one, unverified, rather than leaving the style unknown`
      );

      for (const placement of PLACEMENTS) {
        assert.ok(
          placements[placement],
          `${item.label} is missing its ${placement} zone`
        );
      }
    }
  });

  test("keeps every coordinate on the photograph", () => {
    for (const [style, placements] of Object.entries(garmentZones)) {
      for (const placement of PLACEMENTS) {
        const zone = placements[placement];
        if (!zone) continue;

        const where = `${style} ${placement}`;

        // Fractions of the photo, origin top-left — never pixels.
        assert.ok(zone.x >= 0 && zone.x < 1, `${where}: x off the photo`);
        assert.ok(zone.y >= 0 && zone.y < 1, `${where}: y off the photo`);
        assert.ok(
          zone.width > 0 && zone.width <= 1,
          `${where}: width is not a fraction`
        );
        assert.ok(
          zone.maxHeight > 0 && zone.maxHeight <= 1,
          `${where}: maxHeight is not a fraction`
        );

        // The print area has to finish inside the photo, or art is drawn onto
        // the letterbox beside the garment.
        assert.ok(
          zone.x + zone.width <= 1,
          `${where}: runs off the right edge`
        );
        assert.ok(
          zone.y + zone.maxHeight <= 1,
          `${where}: runs off the bottom edge`
        );
      }
    }
  });
});

describe("pickGarmentPlacement", () => {
  test("Front wins when both are selected", () => {
    // One garment, one picture. A customer who ticks both pictures the front,
    // and both locations are still listed as text under the mockup.
    assert.equal(pickGarmentPlacement(["Front", "Back"]), "Front");
    assert.equal(pickGarmentPlacement(["Back", "Front"]), "Front");
  });

  test("Back alone composites the back", () => {
    assert.equal(pickGarmentPlacement(["Back"]), "Back");
  });

  test("no locations means no composite", () => {
    assert.equal(pickGarmentPlacement([]), null);
    assert.equal(pickGarmentPlacement(["Left Chest"]), null);
  });
});
