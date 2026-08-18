import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { fillEnclosed } from "../lib/die-cut-canvas";

/**
 * What counts as vinyl.
 *
 * A cutting head follows the OUTER contour only — it does not cut the middle
 * out of a donut. So everything the contour encloses is stock, and this is
 * the function that decides it. Get it wrong and the shop cuts a hole in a
 * sticker that should be solid, or leaves vinyl where the customer expected
 * a gap, which is scrapped material rather than a wrong number.
 *
 * It is also the only genuinely algorithmic thing in the die-cut path — a
 * flood fill, not arithmetic — and it had no test. These are the cases the
 * fill is actually asked about, read as pictures: `#` is covered, `.` is not.
 */

function parse(rows: string[]) {
  const width = rows[0].length;
  const height = rows.length;
  const mask = new Uint8Array(width * height);

  rows.forEach((row, y) =>
    row.split("").forEach((cell, x) => {
      mask[y * width + x] = cell === "#" ? 1 : 0;
    })
  );

  return { mask, width, height };
}

function render(rows: string[]) {
  const { mask, width, height } = parse(rows);
  const filled = fillEnclosed(mask, width, height);
  const out: string[] = [];

  for (let y = 0; y < height; y += 1) {
    out.push(
      Array.from(filled.slice(y * width, y * width + width))
        .map((v) => (v ? "#" : "."))
        .join("")
    );
  }

  return out;
}

describe("everything inside the cut is vinyl", () => {
  test("a donut is filled solid", () => {
    // The case the whole approach exists for. An SVG dilate could not do
    // this — a blur cannot reach across a gap wider than itself — and a ring
    // previewed with a see-through middle, which is not the sticker the shop
    // would have made.
    assert.deepEqual(
      render([
        "........",
        "..####..",
        "..#..#..",
        "..#..#..",
        "..####..",
        "........",
      ]),
      [
        "........",
        "..####..",
        "..####..",
        "..####..",
        "..####..",
        "........",
      ]
    );
  });

  test("a C-shape keeps its opening", () => {
    // The counter-case, and the one that proves the fill is not just
    // "bounding box". The gap reaches the outside, so it is not enclosed and
    // must stay cut away.
    assert.deepEqual(
      render([
        "........",
        ".#####..",
        ".#......",
        ".#......",
        ".#####..",
        "........",
      ]),
      [
        "........",
        ".#####..",
        ".#......",
        ".#......",
        ".#####..",
        "........",
      ]
    );
  });

  test("two designs do not bleed into one another", () => {
    // A cart renders each design separately, but a single file can carry two
    // marks. The space between them is outside both.
    assert.deepEqual(
      render(["........", ".##..##.", ".##..##.", "........"]),
      ["........", ".##..##.", ".##..##.", "........"]
    );
  });
});

describe("the awkward edges", () => {
  test("art running off the canvas does not flood the whole sheet", () => {
    // At a high art scale the drawing can reach the layer's edge. The fill
    // seeds from every border pixel, so the ones still uncovered keep the
    // outside reachable and only the art stays solid.
    assert.deepEqual(
      render(["####....", "####....", "####....", "........", "........"]),
      ["####....", "####....", "####....", "........", "........"]
    );
  });

  test("art covering the entire canvas stays covered", () => {
    assert.deepEqual(render(["#####", "#####", "#####"]), [
      "#####",
      "#####",
      "#####",
    ]);
  });

  test("nothing in, nothing out", () => {
    // A file that failed to load, or one that is entirely transparent. This
    // must not come back as a solid rectangle of vinyl.
    assert.deepEqual(render(["....", "....", "...."]), ["....", "....", "...."]);
  });

  test("a single pixel is not enclosed by itself", () => {
    assert.deepEqual(render([".....", "..#..", "....."]), [
      ".....",
      "..#..",
      ".....",
    ]);
  });
});
