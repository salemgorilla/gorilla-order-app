import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  clampZone,
  formatStyleSnippet,
  formatZoneSnippet,
  moveZone,
  resizeZone,
  type CalibrationZone,
} from "../lib/zone-calibration";

/**
 * The fraction arithmetic behind /calibrate.
 *
 * The page exists to satisfy garment-zones.ts's verification contract — a
 * human eyeballing the real photo — so the page itself cannot be unit-tested
 * into correctness. What CAN be pinned is the arithmetic the drag handlers
 * feed on: a box that can be pushed off the photograph, or a snippet that
 * prints numbers other than the ones on screen, would make the human's
 * careful look produce wrong constants with full confidence.
 */

const chest: CalibrationZone = {
  centerX: 0.5,
  top: 0.28,
  width: 0.34,
  maxHeight: 0.32,
};

describe("clampZone keeps the whole box on the photograph", () => {
  test("a centred chest box passes through untouched", () => {
    assert.deepEqual(clampZone(chest), chest);
  });

  test("centerX cannot push the box past either edge", () => {
    assert.equal(clampZone({ ...chest, centerX: 0 }).centerX, chest.width / 2);
    assert.equal(clampZone({ ...chest, centerX: 1 }).centerX, 1 - chest.width / 2);
  });

  test("top cannot push the box below the photo", () => {
    assert.equal(clampZone({ ...chest, top: 0.9 }).top, 1 - chest.maxHeight);
    assert.equal(clampZone({ ...chest, top: -0.2 }).top, 0);
  });

  test("size clamps FIRST, so position is clamped against the real size", () => {
    // width 1.5 clamps to 1, and only centerX 0.5 keeps a full-width box on
    // the photo. Clamping position against the unclamped size would accept
    // centerX 0.9 and render half the box off the edge.
    const clamped = clampZone({ ...chest, width: 1.5, centerX: 0.9 });
    assert.equal(clamped.width, 1);
    assert.equal(clamped.centerX, 0.5);
  });

  test("the box cannot be shrunk into nothing", () => {
    const clamped = clampZone({ ...chest, width: 0, maxHeight: -1 });
    assert.ok(clamped.width >= 0.04);
    assert.ok(clamped.maxHeight >= 0.04);
  });
});

describe("drag arithmetic", () => {
  test("moveZone translates without touching size", () => {
    const moved = moveZone(chest, 0.1, -0.05);
    assert.equal(moved.centerX, 0.6);
    assert.equal(Math.round(moved.top * 1000) / 1000, 0.23);
    assert.equal(moved.width, chest.width);
    assert.equal(moved.maxHeight, chest.maxHeight);
  });

  test("a drag past the edge stops at the edge instead of leaving the photo", () => {
    assert.equal(moveZone(chest, 5, 0).centerX, 1 - chest.width / 2);
  });

  test("resizeZone grows width symmetrically about the centreline", () => {
    // The corner handle moves 0.05 right; the box must grow 0.10 wide,
    // because the compositor draws from centerX outward — growing one-sided
    // would show a box the composite does not match.
    const resized = resizeZone(chest, 0.05, 0.1);
    assert.equal(Math.round(resized.width * 1000) / 1000, 0.44);
    assert.equal(resized.centerX, chest.centerX);
    assert.equal(Math.round(resized.maxHeight * 1000) / 1000, 0.42);
    assert.equal(resized.top, chest.top);
  });
});

describe("the snippet prints exactly what the screen shows", () => {
  test("a side block carries verified: true and three-decimal fractions", () => {
    const snippet = formatZoneSnippet("front", chest);
    assert.match(snippet, /^front: \{/);
    assert.match(snippet, /verified: true,/);
    assert.match(snippet, /centerX: 0\.500,/);
    assert.match(snippet, /top: 0\.280,/);
    assert.match(snippet, /width: 0\.340,/);
    assert.match(snippet, /maxHeight: 0\.320,/);
  });

  test("long fractions round to three decimals instead of printing float noise", () => {
    const snippet = formatZoneSnippet("back", {
      ...chest,
      centerX: 0.5004999,
      top: 0.2856,
    });
    assert.match(snippet, /centerX: 0\.500,/);
    assert.match(snippet, /top: 0\.286,/);
  });

  test("a style block includes only the sides actually saved", () => {
    const snippet = formatStyleSnippet("39", { front: chest });
    assert.match(snippet, /^"39": \{/);
    assert.match(snippet, /front: \{/);
    assert.doesNotMatch(snippet, /back:/);
  });

  test("both sides saved means both sides printed", () => {
    const snippet = formatStyleSnippet("395", { front: chest, back: chest });
    assert.match(snippet, /front: \{/);
    assert.match(snippet, /back: \{/);
  });
});
