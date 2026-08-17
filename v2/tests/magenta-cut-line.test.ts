import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CUT_LINE_RGB, isMagentaPixel } from "../lib/artwork";

/**
 * The colour that decides where the blade goes.
 *
 * We tell customers to draw their cut path in pure magenta and promise to
 * detect it automatically. isMagentaPixel is the half of that promise the app
 * has to keep, and both ways of getting it wrong cost a remake:
 *
 *   false negative — a deliberate cut line is missed, and a die-cut order is
 *                    cut as a rectangle instead of the customer's silhouette
 *   false positive — the blade follows a red or pink part of the artwork
 *
 * These thresholds had no test. They are the last consequential pure logic in
 * the repo that didn't.
 */

describe("the colour we actually advertise", () => {
  test("pure magenta is detected", () => {
    // ArtworkGuidance shows "#FF00FF" and DecalBuilder says "RGB 255, 0, 255".
    // If this ever returned false the app would be failing its own printed
    // instruction, silently, on the one file type that depends on it.
    assert.equal(isMagentaPixel(255, 0, 255), true);
  });

  test("the constant matches the hex on the screen", () => {
    assert.deepEqual(CUT_LINE_RGB, { red: 255, green: 0, blue: 255 });
  });

  test("--cut-line in globals.css is that same colour", () => {
    /**
     * The protect-list rule, asserted rather than trusted. The token is drawn
     * over the art in bleed mode and shown to customers as the hex to use, so
     * if someone "tidies" it to a nicer pink the detector stops matching what
     * the customer was told to draw.
     */
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const match = css.match(/--cut-line:\s*(#[0-9a-fA-F]{6})/);

    assert.ok(match, "--cut-line is not defined in globals.css");

    const hex = match![1].toLowerCase();
    assert.equal(hex, "#ff00ff");

    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.equal(isMagentaPixel(r, g, b), true, "the token colour is not detectable");
  });
});

describe("real files are not pixel-perfect", () => {
  /**
   * A customer's magenta has been through export, a colour profile and often
   * JPEG. Demanding exactly 255,0,255 would miss most genuine cut lines, which
   * is why the bounds are loose.
   */
  const NEAR_MISSES: Array<[string, number, number, number]> = [
    ["JPEG softened", 250, 8, 248],
    ["slightly dark", 200, 12, 205],
    ["green not quite zero", 255, 40, 255],
    ["red and blue a little apart", 240, 10, 200],
    ["printer profile shift", 235, 25, 245],
  ];

  for (const [name, r, g, b] of NEAR_MISSES) {
    test(`${name} still reads as a cut line`, () => {
      assert.equal(isMagentaPixel(r, g, b), true, `rgb(${r},${g},${b}) was missed`);
    });
  }
});

describe("ordinary artwork must not be mistaken for a cut line", () => {
  /**
   * The expensive direction. A false positive means the plotter follows part
   * of the DESIGN — a red border, a pink logo — and the customer gets a
   * sticker cut through their own artwork.
   */
  const NOT_CUT_LINES: Array<[string, number, number, number]> = [
    ["pure red", 255, 0, 0],
    ["pure blue", 0, 0, 255],
    ["pure green", 0, 255, 0],
    ["white", 255, 255, 255],
    ["black", 0, 0, 0],
    ["mid grey", 128, 128, 128],
    ["hot pink (too much green)", 255, 105, 180],
    ["light pink", 255, 182, 193],
    ["purple (blue-dominant)", 128, 0, 255],
    ["crimson", 220, 20, 60],
    ["orange", 255, 165, 0],
    ["the shop's own rush red", 225, 29, 46],
    ["the shop's own gorilla green", 10, 125, 50],
    ["lavender (green too high)", 200, 160, 230],
  ];

  for (const [name, r, g, b] of NOT_CUT_LINES) {
    test(`${name} is not a cut line`, () => {
      assert.equal(isMagentaPixel(r, g, b), false, `rgb(${r},${g},${b}) false-fired`);
    });
  }
});

describe("the boundaries themselves", () => {
  test("green is what separates magenta from pink", () => {
    // Same red and blue; only green moves. This is the discriminator doing
    // the actual work, so it is worth stating as a fact rather than a hope.
    assert.equal(isMagentaPixel(255, 90, 255), true);
    assert.equal(isMagentaPixel(255, 100, 255), false);
  });

  test("red and blue must stay near each other", () => {
    // A big gap means it is drifting toward red or blue, not magenta.
    assert.equal(isMagentaPixel(255, 0, 210), true);
    assert.equal(isMagentaPixel(255, 0, 194), false);
  });

  test("both channels have to be bright", () => {
    assert.equal(isMagentaPixel(191, 0, 191), true);
    assert.equal(isMagentaPixel(190, 0, 190), false);
  });

  test("the predicate is symmetric in red and blue", () => {
    // Nothing should make magenta-leaning-red behave differently from
    // magenta-leaning-blue; the rule is about distance, not direction.
    for (const [r, b] of [[255, 210], [230, 200], [200, 240]]) {
      assert.equal(
        isMagentaPixel(r, 0, b),
        isMagentaPixel(b, 0, r),
        `rgb(${r},0,${b}) and rgb(${b},0,${r}) disagreed`
      );
    }
  });
});
