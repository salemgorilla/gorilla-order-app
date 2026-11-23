import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CURSORS } from "../lib/theme-cursors";
import { DECOR } from "../lib/theme-decor";
import { THEME_CALENDAR } from "../lib/theme-calendar";

/**
 * Holiday cursors (Gabe, 2026-11-23): Santa in his sleigh saying "ho ho
 * ho" for Christmas, "continue that theme with all the other holidays",
 * and "it has to still be able to be used". These pin the parts that keep
 * ordering untouched: the layer takes no clicks, nothing is cancelled,
 * controls keep the normal pointer, and phones never get it.
 */

const component = readFileSync(new URL("../components/ThemeCursor.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("which holidays get which character", () => {
  it("every holiday has one, every season keeps the normal cursor", () => {
    for (const t of THEME_CALENDAR) {
      if (t.kind === "holiday") assert.ok(t.decor?.cursor, `${t.id} has a cursor`);
      else assert.equal(t.decor?.cursor, undefined, `${t.id} keeps the normal cursor`);
    }
  });
  it("Gabe's four are where he asked", () => {
    const of = (id: string) => THEME_CALENDAR.find((t) => t.id === id)?.decor?.cursor;
    assert.equal(of("christmas"), "santa");
    assert.equal(of("thanksgiving"), "turkey");
    assert.equal(of("valentines"), "cupid");
    assert.equal(of("halloween"), "witch");
    assert.equal(CURSORS.santa.click.text, "Ho ho ho!");
    assert.equal(CURSORS.cupid.click.burst?.shapes[0], "heart");
  });
  it("every name a theme gives has a drawing", () => {
    for (const t of THEME_CALENDAR) {
      const c = t.decor?.cursor;
      if (c) assert.ok(CURSORS[c], `${t.id}: no cursor called "${c}"`);
    }
  });
});

describe("each drawing", () => {
  for (const [id, spec] of Object.entries(CURSORS)) {
    it(`${id}: a sane SVG with its tip inside it`, () => {
      assert.match(spec.art, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.match(spec.art, /<\/svg>$/);
      assert.doesNotMatch(spec.art, /<script|on[a-z]+=|href=|<image|<foreignObject/i, "nothing but shapes");
      assert.ok(spec.height <= 48 && spec.width <= 80, "small enough not to cover the page");
      const [x, y] = spec.hotspot;
      assert.ok(x >= 0 && x <= 4 && y >= 0 && y <= spec.height, "tip at the leading (left) edge");
      for (const shape of spec.click.burst?.shapes ?? []) assert.ok(DECOR[shape], `${id}: burst shape ${shape}`);
      assert.ok(spec.click.text || spec.click.burst, "a click does something visible");
      if (spec.click.text) assert.ok(spec.click.text.length <= 24, "bubble fits");
    });
  }
});

describe("it never gets in the way", () => {
  it("the layer takes no clicks and is hidden from screen readers", () => {
    assert.match(component, /className="theme-cursor" aria-hidden="true"/);
    const layer = css.match(/\.theme-cursor \{[^}]*\}/)?.[0] ?? "";
    assert.match(layer, /pointer-events: none/);
    assert.match(layer, /position: fixed/);
  });
  it("only listens: passive, and nothing is cancelled", () => {
    assert.doesNotMatch(code, /preventDefault|stopPropagation|stopImmediatePropagation/);
    assert.match(code, /passive: true/);
    assert.doesNotMatch(code, /addEventListener\("(click|mousedown|mouseup|keydown)"/);
  });
  it("mouse only: phones, tablets and pens keep their touch", () => {
    assert.match(code, /\(hover: hover\) and \(pointer: fine\)/);
    assert.match(code, /pointerType !== "mouse"/);
  });
  it("buttons, links, fields, swatches and upload keep the normal pointer", () => {
    for (const tag of ["a", "button", "input", "select", "textarea", "label", '[role="button"]', "[tabindex]"]) {
      assert.ok(code.includes(tag), `steps aside over ${tag}`);
    }
    assert.match(code, /getComputedStyle\(target\)\.cursor/, "and over anything with cursor-pointer");
    const base = css.match(/@layer base \{\s*html\[data-theme-cursor\][\s\S]*?\n\}/)?.[0] ?? "";
    assert.match(base, /cursor: none/);
    assert.match(base, /cursor: auto/);
  });
  it("moves by transform once a frame, and still for less motion", () => {
    assert.match(code, /requestAnimationFrame\(draw\)/);
    assert.match(code, /translate3d/);
    assert.doesNotMatch(code, /style\.(left|top) =/);
    const loops = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.tc-bob[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(loops.includes(".tc-flame"), "every character loop sits inside the no-preference block");
  });
  it("sounds only on a click, and quiet", () => {
    assert.match(code, /volume = 0\.5/);
    assert.match(code, /gain\.setValueAtTime\(0\.06/);
    assert.doesNotMatch(code, /new Audio\(|autoplay/i);
  });
});
