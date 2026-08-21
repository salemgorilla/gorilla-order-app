import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HARD_TOLERANCE,
  MIN_BORDER_UNIFORMITY,
  readBorder,
} from "../lib/background-removal";

/**
 * The gate that decides whether we touch a customer's artwork at all.
 *
 * removeBackground refuses when `uniformity` falls below
 * MIN_BORDER_UNIFORMITY — the border is not one flat colour, so the file is a
 * photo or a gradient or a design printed edge to edge, and a flood fill
 * would take a bite out of it.
 *
 * The two errors are not symmetric. Too strict costs somebody a convenience
 * they can work around by uploading a PNG. Too permissive destroys the file
 * they were about to have printed. That asymmetry is why this is worth
 * testing directly, and it was private and untested until now.
 *
 * These build real pixel buffers rather than mocking a canvas: readBorder
 * takes a Uint8ClampedArray, so the whole decision is checkable without a
 * browser.
 */

type RGBA = [number, number, number, number];

/** An image whose pixels are chosen by a function of (x, y). */
function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => RGBA
) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }

  return { data, width, height };
}

const WHITE: RGBA = [255, 255, 255, 255];
const BLACK: RGBA = [0, 0, 0, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

function read(img: ReturnType<typeof image>) {
  return readBorder(img.data, img.width, img.height);
}

describe("a flat background is recognised", () => {
  it("reads pure white and reports total agreement", () => {
    // A logo exported onto solid white: the case this feature exists for.
    const img = image(40, 40, (x, y) =>
      x > 8 && x < 32 && y > 8 && y < 32 ? BLACK : WHITE
    );

    const border = read(img);

    assert.ok(border);
    assert.deepEqual([border.r, border.g, border.b], [255, 255, 255]);
    assert.equal(border.uniformity, 1);
  });

  it("reads a flat colour that is not white", () => {
    const teal: RGBA = [16, 120, 120, 255];
    const img = image(30, 30, (x, y) =>
      x > 6 && x < 24 && y > 6 && y < 24 ? BLACK : teal
    );

    const border = read(img);

    assert.ok(border);
    assert.deepEqual([border.r, border.g, border.b], [16, 120, 120]);
    assert.equal(border.uniformity, 1);
  });

  it("tolerates the noise a JPEG leaves in a flat area", () => {
    // A white background out of a JPEG is not 255,255,255 everywhere. Within
    // HARD_TOLERANCE it must still count as agreeing, or every photographed
    // or re-saved logo would be refused.
    const jitter = (x: number, y: number): RGBA => {
      const n = ((x * 7 + y * 13) % 5) * 4;
      return [255 - n, 255 - n, 255 - n, 255];
    };

    const img = image(40, 40, (x, y) =>
      x > 8 && x < 32 && y > 8 && y < 32 ? BLACK : jitter(x, y)
    );

    const border = read(img);

    assert.ok(border);
    assert.ok(
      border.uniformity >= MIN_BORDER_UNIFORMITY,
      `jittered white scored ${border.uniformity}, which would be refused`
    );
  });
});

describe("a background we must not touch is refused", () => {
  it("scores a gradient border below the threshold", () => {
    // A photo or an edge-to-edge design. Flood filling this eats the artwork.
    const img = image(40, 40, (x) => {
      const v = Math.round((x / 39) * 255);
      return [v, v, v, 255];
    });

    const border = read(img);

    assert.ok(border);
    assert.ok(
      border.uniformity < MIN_BORDER_UNIFORMITY,
      `a full-width gradient scored ${border.uniformity} and would be processed`
    );
  });

  it("scores a two-tone border below the threshold", () => {
    // Half white, half black around the edge — no single background colour.
    const img = image(40, 40, (x) => (x < 20 ? WHITE : BLACK));

    const border = read(img);

    assert.ok(border);
    assert.ok(border.uniformity < MIN_BORDER_UNIFORMITY);
  });

  it("is not fooled by a flat border with the design running off one side", () => {
    // Artwork bleeding off the left edge. Roughly a quarter of the border is
    // design, which should not clear the bar.
    const img = image(40, 40, (x) => (x < 10 ? BLACK : WHITE));

    const border = read(img);

    assert.ok(border);
    assert.ok(
      border.uniformity < MIN_BORDER_UNIFORMITY,
      `design on one edge scored ${border.uniformity}`
    );
  });
});

describe("images with nothing to sample", () => {
  it("returns null when the whole border is already transparent", () => {
    // An already knocked-out PNG. A transparent pixel says nothing about the
    // colour of a background we would be removing, so there is nothing to
    // read — and removeBackground turns this into "nothing-to-remove" rather
    // than processing it.
    const img = image(20, 20, (x, y) =>
      x > 5 && x < 14 && y > 5 && y < 14 ? BLACK : CLEAR
    );

    assert.equal(read(img), null);
  });

  it("handles a one-pixel image without throwing", () => {
    assert.doesNotThrow(() => read(image(1, 1, () => WHITE)));
  });

  it("handles a single row and a single column", () => {
    assert.ok(read(image(10, 1, () => WHITE)));
    assert.ok(read(image(1, 10, () => WHITE)));
  });
});

describe("the thresholds themselves", () => {
  it("measures agreement as a DISTANCE, not a per-channel delta", () => {
    /**
     * HARD_TOLERANCE is 42, and it is Euclidean in RGB. That is easy to read
     * as "42 levels per channel" and it is not:
     *
     *   one channel off by 42     -> distance 42.0   agrees
     *   all three off by 24       -> distance 41.6   agrees
     *   all three off by 25       -> distance 43.3   does NOT
     *
     * So a neutral grey shift gets 42/sqrt(3) — about 24 levels — while a
     * single-channel cast gets the full 42. Anyone tuning this number by
     * reasoning per-channel would be out by a factor of sqrt(3).
     */
    const borderOf = (colour: RGBA) =>
      image(40, 40, (x, y) => {
        const onBorder = x === 0 || y === 0 || x === 39 || y === 39;
        if (!onBorder) return BLACK;
        // A quarter of the border carries the shifted colour.
        return x % 4 === 0 ? colour : WHITE;
      });

    const greyInside = read(borderOf([255 - 24, 255 - 24, 255 - 24, 255]));
    const greyOutside = read(borderOf([255 - 25, 255 - 25, 255 - 25, 255]));

    assert.ok(greyInside && greyOutside);
    assert.equal(greyInside.uniformity, 1, "24 per channel is inside 42");
    assert.ok(greyOutside.uniformity < 1, "25 per channel is outside 42");

    const oneChannelInside = read(borderOf([255 - 42, 255, 255, 255]));
    const oneChannelOutside = read(borderOf([255 - 43, 255, 255, 255]));

    assert.ok(oneChannelInside && oneChannelOutside);
    assert.equal(
      oneChannelInside.uniformity,
      1,
      "a single channel gets the whole tolerance"
    );
    assert.ok(oneChannelOutside.uniformity < 1);
  });

  it("keeps a threshold that refuses more than it accepts near the line", () => {
    // Guards the direction of the trade-off: this number protects artwork, so
    // it should sit high. If someone lowers it to widen coverage, this fails
    // and makes them say so.
    assert.ok(MIN_BORDER_UNIFORMITY >= 0.8);
    assert.ok(MIN_BORDER_UNIFORMITY <= 1);
  });
});
