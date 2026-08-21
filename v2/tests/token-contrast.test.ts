import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The tokens that draw the app's structure, measured rather than eyeballed.
 *
 * ── WHAT THIS CAUGHT ──────────────────────────────────────────────────────
 * `--rule` was `#d8d2c4`, which measures 1.51:1 against `--paper` and 1.34:1
 * against `--shirt-blank`. WCAG 2.1 SC 1.4.11 asks 3:1 of a non-text UI
 * boundary, and this one token draws every card edge, every step tile, every
 * section and the footer — the entire structural language of the design sat
 * below the threshold at which a border reads as a border.
 *
 * A colour is easy to nudge lighter in service of a look, and impossible to
 * check by eye. So it is checked here, from the shipped stylesheet, on every
 * ground it is actually drawn against.
 *
 * `--rule-faint` deliberately keeps the old value and is NOT held to 3:1: it
 * separates rows INSIDE an already-bordered container, where the edge is
 * carried by the container. It is excluded on purpose, not by oversight.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function token(name: string) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
  assert.ok(match, `--${name} not found in globals.css`);
  return match[1];
}

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");

  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the arithmetic itself", () => {
  // If the helpers are wrong, every assertion below is decorative.
  it("agrees with the two anchors everyone knows", () => {
    assert.equal(Math.round(contrast("#000000", "#ffffff") * 100) / 100, 21);
    assert.equal(contrast("#ffffff", "#ffffff"), 1);
  });
});

describe("structural borders clear the 3:1 non-text floor", () => {
  const GROUNDS = ["paper", "shirt-blank"];

  for (const ground of GROUNDS) {
    it(`--rule on --${ground}`, () => {
      const ratio = contrast(token("rule"), token(ground));

      assert.ok(
        ratio >= 3,
        `--rule is ${token("rule")} on --${ground} ${token(ground)}: ` +
          `${ratio.toFixed(2)}:1, below the 3:1 floor for a UI boundary`
      );
    });
  }
});

describe("text tokens clear the 4.5:1 floor", () => {
  // Not the whole table — the pairs this app actually renders, on both of the
  // two surfaces it renders them on.
  const PAIRS: Array<[string, string]> = [
    ["ink-black", "paper"],
    ["ink-black", "shirt-blank"],
    ["ink-muted", "paper"],
    ["ink-muted", "shirt-blank"],
    ["rush-red", "paper"],
    ["rush-red", "shirt-blank"],
  ];

  for (const [ink, ground] of PAIRS) {
    it(`--${ink} on --${ground}`, () => {
      const ratio = contrast(token(ink), token(ground));

      assert.ok(
        ratio >= 4.5,
        `--${ink} on --${ground}: ${ratio.toFixed(2)}:1, below the 4.5:1 text floor`
      );
    });
  }
});

describe("the faint rule is a separator, not an edge", () => {
  it("keeps the old value, and is not held to the boundary floor", () => {
    // Asserted so the exemption is a decision on the record rather than an
    // omission somebody later reads as an oversight.
    assert.equal(token("rule-faint"), "#d8d2c4");
    assert.ok(contrast(token("rule-faint"), token("paper")) < 3);
  });

  it("is lighter than the edge it sits inside", () => {
    assert.ok(
      luminance(token("rule-faint")) > luminance(token("rule")),
      "the within-container hairline must not out-weigh the container edge"
    );
  });
});
