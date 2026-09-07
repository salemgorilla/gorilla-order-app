/**
 * CHOOSING A GARMENT COLOUR HAS TO LOOK LIKE SOMETHING HAPPENED.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Reported by Gabe, 2026-09-07: "when I press a color there is no indication,
 * or not one very visible, for me to know that the color has been chosen."
 *
 * The whole selected state was a 1px border changing colour and the fill
 * going from `bg-white/70` to `bg-white`. Two signals, both colour, one of
 * them a 30% opacity change on an off-white page — in a grid of up to 84
 * cells. There was no `aria-pressed`, so assistive tech was told nothing at
 * all, and the design system's own rule is that colour is NEVER the only
 * signal (DESIGN-SYSTEM §2, and the product cards a step earlier carry a
 * SELECTED badge for exactly this reason).
 *
 * ── WHY A SWATCH IS THE HARD CASE ─────────────────────────────────────────
 * The house move for a selected control is a heavier border in the brand
 * green. On a colour picker that fails twice: the cell IS a colour, so a
 * coloured edge competes with the thing being chosen, and a green swatch
 * would wear a green ring invisibly. So the selected state here is carried
 * by a tinted fill, an ink-black ring on the swatch itself, and a word.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const builder = readFileSync(
  new URL("../features/apparel/ApparelBuilder.tsx", import.meta.url),
  "utf8"
);

/** The colour grid's button, sliced out so nothing else can satisfy these. */
const swatch = builder.slice(
  builder.indexOf("Garment Color"),
  builder.indexOf("</button>", builder.indexOf("Garment Color"))
);

describe("the selected colour says so to assistive tech", () => {
  test("the swatch is a toggle button", () => {
    assert.match(swatch, /aria-pressed=\{isSelected\}/);
  });
});

describe("and says so without relying on colour", () => {
  test("a word, not just a hue", () => {
    // The signal that survives greyscale, colour-blindness and a photograph
    // of the screen. Same badge the product cards use.
    assert.match(swatch, /SELECTED/);
  });

  test("the swatch itself is ringed in ink, never in the brand green", () => {
    // A green ring on a green swatch is no ring. Ink is the one colour no
    // garment blank in the catalogue can hide.
    assert.match(swatch, /outline-\[var\(--ink-black\)\]/);
  });

  test("the ring is an outline, so selecting cannot reflow the grid", () => {
    // A border would add width to a 28px chip and nudge its row. The product
    // cards' own note explains the same trap for a 1px→2px step.
    assert.match(swatch, /outline outline-2/);
    assert.doesNotMatch(swatch, /border-2 border-\[var\(--ink-black\)\]/);
  });
});

describe("the fill actually changes", () => {
  test("selected is the tint, not white-on-white", () => {
    // bg-white/70 → bg-white was the old "signal": a 30% opacity step against
    // an off-white page, which is what made this invisible in the first place.
    assert.match(swatch, /bg-\[var\(--surface-ok\)\]/);
    assert.doesNotMatch(
      swatch,
      /isSelected\s*\?\s*"border-\[var\(--gorilla-green\)\] bg-white"/,
      "the selected fill is back to plain white"
    );
  });
});

describe("the states cannot collide", () => {
  test("an out-of-stock colour is unpickable, so it can never be selected", () => {
    assert.match(swatch, /disabled=\{color\.outOfStock\}/);
  });

  test("and a pickable one says it is pickable", () => {
    // cursor-pointer was missing entirely: every swatch, chosen or not, read
    // as a control that does nothing.
    assert.match(swatch, /cursor-pointer/);
  });
});
